import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { handler as proxyHandler } from './netlify/functions/proxy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

function getRuntimeConfig(req) {
  const backendBaseUrl = process.env.BACKEND_BASE_URL || `${req.protocol}://${req.get('host')}`;

  return {
    backendBaseUrl,
    proxyMode: process.env.PROXY_MODE || 'always',
    forceProxyImages: true,
    forceProxyStreams: true,
    forceProxyMetadata: true,
    defaultSource: {
      type: process.env.DEFAULT_SOURCE_TYPE || '',
      playlistUrl: process.env.DEFAULT_PLAYLIST_URL || '',
      epgUrl: process.env.DEFAULT_EPG_URL || '',
      baseUrl: process.env.DEFAULT_BASE_URL || '',
      username: process.env.DEFAULT_USERNAME || '',
      password: process.env.DEFAULT_PASSWORD || '',
      label: process.env.DEFAULT_SOURCE_LABEL || 'Default IPTV Source'
    }
  };
}

function createEventFromNodeRequest(req) {
  const origin = `${req.protocol || 'http'}://${req.get?.('host') || req.headers.host || 'localhost'}`;
  const url = new URL(req.originalUrl || req.url || '/', origin);
  const headers = Object.fromEntries(
    Object.entries(req.headers || {}).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value || ''])
  );

  return {
    httpMethod: req.method || 'GET',
    path: `${url.pathname}${url.search}`,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    headers
  };
}

async function writeNodeResponse(res, response) {
  res.status(response.status);

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

app.get('/runtime-config.js', (req, res) => {
  const config = getRuntimeConfig(req);
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(`window.FIRATFLIX_RUNTIME_CONFIG = ${JSON.stringify(config)};`);
});

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));

app.all('/api/proxy', async (req, res) => {
  try {
    const response = await proxyHandler(createEventFromNodeRequest(req));
    await writeNodeResponse(res, response);
  } catch (error) {
    console.error('Render proxy failed:', error);
    res.status(500).json({ error: error.message || 'Proxy failed.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Render/web server running on port ${PORT}`);
});
