export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  runtime: () => window.FIRATFLIX_RUNTIME_CONFIG || {},
  defaultSource: () => fetchJson('/api/default-source'),
  loadDefaultLibrary: () => fetchJson('/api/library?source=default'),
  loadManualLibrary: (sourceConfig) => fetchJson('/api/library', { method: 'POST', body: JSON.stringify(sourceConfig) }),
  loadDefaultSeriesInfo: (seriesId) => fetchJson(`/api/series-info?source=default&seriesId=${encodeURIComponent(seriesId)}`),
  loadManualSeriesInfo: (sourceConfig, seriesId) => fetchJson('/api/series-info', { method: 'POST', body: JSON.stringify({ ...sourceConfig, seriesId }) }),
  resolveDefaultMedia: (url) => fetchJson(`/api/resolve-media?source=default&url=${encodeURIComponent(url)}`),
  resolveManualMedia: (sourceConfig, url) => fetchJson('/api/resolve-media', { method: 'POST', body: JSON.stringify({ ...sourceConfig, url }) })
};
