function getRuntimeConfig() {
  return window.FIRATFLIX_RUNTIME_CONFIG || {};
}

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/$/, '');
}

function isHttpLikeUrl(targetUrl = '') {
  return /^https?:\/\//i.test(String(targetUrl || '').trim());
}

export function getProxyMode(source = {}) {
  const runtimeConfig = getRuntimeConfig();
  return runtimeConfig.proxyMode || source.proxyMode || 'auto';
}

export function getBackendBaseUrl() {
  const runtimeConfig = getRuntimeConfig();
  const configured = trimTrailingSlash(runtimeConfig.backendBaseUrl || '');
  if (configured) return configured;
  return window.location.origin;
}

export function isLocalRuntime() {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname.toLowerCase();

  return (
    protocol === 'file:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  );
}

export function isAlreadyProxyUrl(targetUrl = '') {
  const value = String(targetUrl || '').trim();
  if (!value) return false;

  try {
    const parsed = new URL(value, window.location.href);
    const proxyUrl = new URL('/api/proxy', getBackendBaseUrl());
    return parsed.origin === proxyUrl.origin && parsed.pathname === proxyUrl.pathname;
  } catch {
    return value.includes('/api/proxy?url=');
  }
}

export function isMixedContentRisk(targetUrl) {
  if (!targetUrl) return false;

  try {
    const parsed = new URL(targetUrl, window.location.href);
    return window.location.protocol === 'https:' && parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function shouldForceProxyByType(targetUrl = '') {
  const runtimeConfig = getRuntimeConfig();
  const value = String(targetUrl || '').toLowerCase();

  if (
    runtimeConfig.forceProxyImages &&
    /\.(png|jpe?g|webp|gif|svg|bmp|ico)(\?|$)/i.test(value)
  ) {
    return true;
  }

  if (
    runtimeConfig.forceProxyStreams &&
    /\.(m3u8|m3u|ts|mp4|mkv|mov|avi)(\?|$)/i.test(value)
  ) {
    return true;
  }

  return false;
}

function requiresCredentials(targetUrl = '') {
  const value = String(targetUrl || '').toLowerCase();
  return (
    /player_api\.php/i.test(value) ||
    /\/stream\//i.test(value) ||
    /get\.php/i.test(value) ||
    /\.(m3u8|m3u|ts|mp4|mkv)(\?|$)/i.test(value)
  );
}

export function shouldUseProxy(source = {}, targetUrl = '') {
  if (source.type === 'demo') return false;
  if (!targetUrl) return false;
  if (!isHttpLikeUrl(targetUrl)) return false;
  if (isAlreadyProxyUrl(targetUrl)) return false;

  const mode = getProxyMode(source);

  if (mode === 'off') return false;
  if (mode === 'always') return true;

  if (isMixedContentRisk(targetUrl)) return true;
  if (shouldForceProxyByType(targetUrl)) return true;
  if (isLocalRuntime()) return false;

  return Boolean(getBackendBaseUrl());
}

export function buildProxyUrl(targetUrl, source = {}) {
  if (!targetUrl) return targetUrl;
  if (isAlreadyProxyUrl(targetUrl)) return targetUrl;
  if (!isHttpLikeUrl(targetUrl)) return targetUrl;

  const proxyUrl = new URL('/api/proxy', getBackendBaseUrl());
  proxyUrl.searchParams.set('url', targetUrl);

  const username = source.username || source.credentials?.username || '';
  const password = source.password || source.credentials?.password || '';

  if (username && password && requiresCredentials(targetUrl)) {
    proxyUrl.searchParams.set('username', username);
    proxyUrl.searchParams.set('password', password);
  }

  return proxyUrl.toString();
}

export function maybeProxyUrl(targetUrl, source = {}) {
  if (!targetUrl) return targetUrl;
  if (!isHttpLikeUrl(targetUrl)) return targetUrl;
  return shouldUseProxy(source, targetUrl) ? buildProxyUrl(targetUrl, source) : targetUrl;
}
