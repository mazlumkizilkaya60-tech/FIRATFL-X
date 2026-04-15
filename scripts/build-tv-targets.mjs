import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const outDir = path.join(projectRoot, 'tv-build');
const configPath = path.join(projectRoot, 'tv.config.json');
const exampleConfigPath = path.join(projectRoot, 'tv.config.example.json');

const defaultConfig = {
  hostedAppUrl: 'https://your-static-host.example.com/',
  backendBaseUrl: 'https://your-static-host.example.com',
  allowedOrigins: ['https://your-static-host.example.com', 'https://cdn.jsdelivr.net'],
  tizen: {
    appId: 'LQ7M2M8A9V.firatflix.omega.tv',
    packageId: 'LQ7M2M8A9V',
    requiredVersion: '5.5',
    name: 'FIRATFLIX OMEGA TV'
  },
  webos: {
    id: 'com.firatflix.omega.tv',
    title: 'FIRATFLIX OMEGA TV',
    version: '1.0.0',
    vendor: 'FIRATFLIX'
  }
};

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readConfig() {
  const hasUserConfig = await pathExists(configPath);
  const source = hasUserConfig ? configPath : exampleConfigPath;
  const raw = await fs.readFile(source, 'utf8');
  return JSON.parse(raw);
}

async function ensureDist() {
  if (!(await pathExists(distDir))) {
    throw new Error('dist klasoru bulunamadi. Once npm run build calistirin.');
  }
}

async function recreateDir(target) {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
}

async function copyDist(target) {
  await fs.cp(distDir, target, { recursive: true });
}

function normalizeHostedUrl(url) {
  if (!url) return defaultConfig.hostedAppUrl;
  return url.endsWith('/') ? url : `${url}/`;
}

function normalizeBackendBaseUrl(url, hostedUrl) {
  const candidate = url || hostedUrl || defaultConfig.backendBaseUrl;
  return candidate.replace(/\/$/, '');
}

function createRuntimeConfig(config) {
  return `window.FIRATFLIX_RUNTIME_CONFIG = window.FIRATFLIX_RUNTIME_CONFIG || {
  backendBaseUrl: ${JSON.stringify(normalizeBackendBaseUrl(config.backendBaseUrl, config.hostedAppUrl))},
  proxyMode: "always"
};
`;
}

function buildAccessEntries(origins = []) {
  const values = Array.from(new Set([...origins, 'https://cdn.jsdelivr.net']));
  return values
    .map((origin) => `  <access origin="${origin}" subdomains="true"/>\n  <tizen:allow-origin>${origin}</tizen:allow-origin>`)
    .join('\n');
}

function createTizenPackagedConfig(config) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets"
  xmlns:tizen="http://tizen.org/ns/widgets"
  id="http://yourdomain.example/firatflix/omega/tv"
  version="1.0.0"
  viewmodes="maximized">
  <tizen:application id="${config.tizen.appId}" package="${config.tizen.packageId}" required_version="${config.tizen.requiredVersion}"/>
  <content src="index.html"/>
  <icon src="brand/firatflix-mark.svg"/>
  <name>${config.tizen.name}</name>
  <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
  <feature name="http://tizen.org/feature/network.wifi"/>
  <feature name="http://tizen.org/feature/network.ethernet"/>
${buildAccessEntries(config.allowedOrigins)}
  <tizen:setting screen-orientation="landscape" context-menu="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
</widget>
`;
}

function createTizenHostedConfig(config) {
  const hostedUrl = normalizeHostedUrl(config.hostedAppUrl);
  return `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets"
  xmlns:tizen="http://tizen.org/ns/widgets"
  id="http://yourdomain.example/firatflix/omega/tv/hosted"
  version="1.0.0"
  viewmodes="maximized">
  <tizen:application id="${config.tizen.appId}.hosted" package="${config.tizen.packageId}" required_version="${config.tizen.requiredVersion}"/>
  <content src="${hostedUrl}"/>
  <icon src="brand/firatflix-mark.svg"/>
  <name>${config.tizen.name} Hosted Lab</name>
${buildAccessEntries(config.allowedOrigins)}
  <tizen:setting screen-orientation="landscape" context-menu="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
</widget>
`;
}

function createWebOsPackagedInfo(config) {
  return JSON.stringify(
    {
      id: config.webos.id,
      version: config.webos.version,
      vendor: config.webos.vendor,
      type: 'web',
      main: 'index.html',
      title: config.webos.title,
      icon: 'brand/firatflix-mark.svg',
      largeIcon: 'brand/firatflix-logo.svg',
      requiredPermissions: ['network.connection', 'media.operation']
    },
    null,
    2
  );
}

function createWebOsHostedInfo(config) {
  return JSON.stringify(
    {
      id: `${config.webos.id}.hosted`,
      version: config.webos.version,
      vendor: config.webos.vendor,
      type: 'web',
      main: 'index.html',
      title: `${config.webos.title} Hosted Lab`,
      icon: 'brand/firatflix-mark.svg',
      largeIcon: 'brand/firatflix-logo.svg',
      requiredPermissions: ['network.connection', 'media.operation']
    },
    null,
    2
  );
}

function createHostedBootstrap(config) {
  const hostedUrl = normalizeHostedUrl(config.hostedAppUrl);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="refresh" content="0; url=${hostedUrl}">
    <title>FIRATFLIX Hosted Bootstrap</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, #12304d 0%, #071019 60%, #03070d 100%);
        color: #d6f3ff;
        font: 500 22px/1.5 "Segoe UI", sans-serif;
      }
      .boot {
        text-align: center;
        max-width: 720px;
        padding: 24px;
      }
      a {
        color: #6be2ff;
      }
    </style>
    <script>
      window.location.replace(${JSON.stringify(hostedUrl)});
    </script>
  </head>
  <body>
    <div class="boot">
      <h1>FIRATFLIX OMEGA TV</h1>
      <p>Hosted TV shell yonlendiriliyor.</p>
      <p>Eger otomatik gecis olmazsa <a href="${hostedUrl}">buraya tiklayin</a>.</p>
    </div>
  </body>
</html>
`;
}

async function writeReadme(target, body) {
  await fs.writeFile(path.join(target, 'README.txt'), body, 'utf8');
}

async function buildTargets() {
  await ensureDist();
  const config = {
    ...defaultConfig,
    ...(await readConfig())
  };

  await recreateDir(outDir);

  const tizenPackagedDir = path.join(outDir, 'tizen-packaged');
  await copyDist(tizenPackagedDir);
  await fs.writeFile(path.join(tizenPackagedDir, 'runtime-config.js'), createRuntimeConfig(config), 'utf8');
  await fs.writeFile(path.join(tizenPackagedDir, 'config.xml'), createTizenPackagedConfig(config), 'utf8');
  await writeReadme(
    tizenPackagedDir,
    'Tizen packaged app. Tizen Studio ile package yapip TV Developer Mode uzerinden yukleyin.'
  );

  const tizenHostedDir = path.join(outDir, 'tizen-hosted-lab');
  await copyDist(tizenHostedDir);
  await fs.writeFile(path.join(tizenHostedDir, 'runtime-config.js'), createRuntimeConfig(config), 'utf8');
  await fs.writeFile(path.join(tizenHostedDir, 'config.xml'), createTizenHostedConfig(config), 'utf8');
  await writeReadme(
    tizenHostedDir,
    'Tizen hosted lab shell. Samsung store submission icin degil, lab ve local testing icin dusunun.'
  );

  const webosPackagedDir = path.join(outDir, 'webos-packaged');
  await copyDist(webosPackagedDir);
  await fs.writeFile(path.join(webosPackagedDir, 'runtime-config.js'), createRuntimeConfig(config), 'utf8');
  await fs.writeFile(path.join(webosPackagedDir, 'appinfo.json'), createWebOsPackagedInfo(config), 'utf8');
  await writeReadme(
    webosPackagedDir,
    'webOS packaged app. webOS CLI veya webOS Studio ile package/install yapin.'
  );

  const webosHostedDir = path.join(outDir, 'webos-hosted-lab');
  await copyDist(webosHostedDir);
  await fs.writeFile(path.join(webosHostedDir, 'runtime-config.js'), createRuntimeConfig(config), 'utf8');
  await fs.writeFile(path.join(webosHostedDir, 'appinfo.json'), createWebOsHostedInfo(config), 'utf8');
  await fs.writeFile(path.join(webosHostedDir, 'index.html'), createHostedBootstrap(config), 'utf8');
  await writeReadme(
    webosHostedDir,
    'webOS hosted lab shell. Buradaki index.html remote hosted app URLsine yonlendirir.'
  );

  const androidTvDir = path.join(outDir, 'android-tv-hosted-notes');
  await recreateDir(androidTvDir);
  await fs.writeFile(
    path.join(androidTvDir, 'README.txt'),
    [
      'Android TV icin browser hosted deployment yerine APK + Media3 ExoPlayer tavsiye edilir.',
      'Bu proje su anda web shell olarak Cloudflare Pages veya Netlify uzerinde test edilebilir.',
      'HTTP IPTV source lari HTTPS hosted web app icinde mixed-content nedeniyle yine acilmaz.'
    ].join('\n'),
    'utf8'
  );

  console.log(`TV build output ready: ${outDir}`);
  console.log('Targets: tizen-packaged, tizen-hosted-lab, webos-packaged, webos-hosted-lab, android-tv-hosted-notes');
}

buildTargets().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
