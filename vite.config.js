import { defineConfig } from 'vite';
import { handler as proxyHandler } from './netlify/functions/proxy.mjs';

function createEventFromNodeRequest(req) {
  const url = new URL(req.url || '/', 'http://localhost');
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
  res.statusCode = response.status;
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

function firatflixProxyPlugin() {
  const middleware = async (req, res, next) => {
    if (!req.url?.startsWith('/api/proxy')) {
      next();
      return;
    }

    try {
      const response = await proxyHandler(createEventFromNodeRequest(req));
      await writeNodeResponse(res, response);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: error.message || 'Local proxy failed.' }));
    }
  };

  return {
    name: 'firatflix-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

export default defineConfig({
  plugins: [firatflixProxyPlugin()],
  base: './',
  server: {
    host: true,
    port: 4173
  },
  preview: {
    host: true,
    port: 4173
  }
});
