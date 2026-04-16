const DEFAULT_TIMEOUT = 20000;

function buildHeaders(method, headers = {}, hasJsonBody = false) {
  const next = new Headers(headers);
  if (hasJsonBody && !next.has('content-type')) {
    next.set('content-type', 'application/json');
  }
  if (!next.has('accept')) {
    next.set('accept', 'application/json');
  }
  return next;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT);
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const method = String(options.method || 'GET').toUpperCase();
    const hasJsonBody = typeof options.body === 'string';
    const response = await fetch(url, {
      ...options,
      method,
      headers: buildHeaders(method, options.headers, hasJsonBody),
      signal: options.signal || controller.signal,
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      const message = data.error || data.message || `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('İstek zaman aşımına uğradı.');
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const api = {
  runtime: () => window.FIRATFLIX_RUNTIME_CONFIG || {},
  defaultSource: () => requestJson('/api/default-source'),
  loadDefaultLibrary: () => requestJson('/api/library?source=default'),
  loadManualLibrary: (sourceConfig) =>
    requestJson('/api/library', {
      method: 'POST',
      body: JSON.stringify(sourceConfig),
    }),
  loadDefaultSeriesInfo: (seriesId) =>
    requestJson(`/api/series-info?source=default&seriesId=${encodeURIComponent(seriesId)}`),
  loadManualSeriesInfo: (sourceConfig, seriesId) =>
    requestJson('/api/series-info', {
      method: 'POST',
      body: JSON.stringify({ ...sourceConfig, seriesId }),
    }),
  resolveDefaultMedia: (url) =>
    requestJson(`/api/resolve-media?source=default&url=${encodeURIComponent(url)}`),
  resolveManualMedia: (sourceConfig, url) =>
    requestJson('/api/resolve-media', {
      method: 'POST',
      body: JSON.stringify({ ...sourceConfig, url }),
    }),
};
