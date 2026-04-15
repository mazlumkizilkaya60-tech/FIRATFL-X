function getRuntimeConfig() {
  return window.FIRATFLIX_RUNTIME_CONFIG || {};
}

export function getProxyMode(source = {}) {
  return getRuntimeConfig().proxyMode || source.proxyMode || 'auto';
}

export function getBackendBaseUrl() {
  const configured = getRuntimeConfig().backendBaseUrl;
  if (configured) {
    return configured.replace(/\/$/, '');
  }
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

export function shouldUseProxy(source = {}) {
  if (source.type === 'demo') return false;

  const mode = getProxyMode(source);
  if (mode === 'off') return false;
  if (mode === 'always') return true;
  if (isLocalRuntime()) return false;
  return Boolean(getBackendBaseUrl());
}

export function buildProxyUrl(targetUrl, source = {}) {
  const url = new URL('/api/proxy', getBackendBaseUrl());
  url.searchParams.set('url', targetUrl);
  if (source.username && source.password) {
    url.searchParams.set('username', source.username);
    url.searchParams.set('password', source.password);
  }
  return url.toString();
}

export function maybeProxyUrl(targetUrl, source = {}) {
  if (!targetUrl) return targetUrl;
  return shouldUseProxy(source) ? buildProxyUrl(targetUrl, source) : targetUrl;
}

export function isMixedContentRisk(targetUrl) {
  try {
    const parsed = new URL(targetUrl, window.location.href);
    return window.location.protocol === 'https:' && parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
