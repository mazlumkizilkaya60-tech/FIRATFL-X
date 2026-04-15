import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_OUTPUT = String(process.env.FIRATFLIX_DEFAULT_OUTPUT || 'm3u8').trim() || 'm3u8';
const DEFAULT_SOURCE_TYPE = String(process.env.FIRATFLIX_DEFAULT_SOURCE_TYPE || '').trim().toLowerCase();
const DEFAULT_SOURCE_LABEL = String(process.env.FIRATFLIX_DEFAULT_SOURCE_LABEL || 'FIRATFLIX Default Source').trim();
const ALLOWED_AUTH_HOSTS = String(process.env.FIRATFLIX_ALLOWED_AUTH_HOSTS || '')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function safeJson(value, status = 200) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: Buffer.from(JSON.stringify(value))
  };
}

function textResponse(text, status = 200, contentType = 'text/plain; charset=utf-8') {
  return {
    status,
    headers: { 'content-type': contentType, 'cache-control': 'no-store' },
    body: Buffer.from(text)
  };
}

function noContent(status = 204, headers = {}) {
  return { status, headers, body: null };
}

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function getRuntimeConfig(req) {
  return {
    backendBaseUrl: `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`,
    proxyMode: String(process.env.FIRATFLIX_PROXY_MODE || 'always'),
    forceProxyImages: parseBoolean(process.env.FIRATFLIX_FORCE_PROXY_IMAGES, true),
    forceProxyStreams: parseBoolean(process.env.FIRATFLIX_FORCE_PROXY_STREAMS, true),
    hasDefaultSource: Boolean(getDefaultSource()),
    buildTime: new Date().toISOString()
  };
}

function getDefaultSource() {
  if (DEFAULT_SOURCE_TYPE === 'm3u') {
    const playlistUrl = String(process.env.FIRATFLIX_DEFAULT_PLAYLIST_URL || '').trim();
    if (!playlistUrl) return null;
    return {
      id: 'default-source',
      label: DEFAULT_SOURCE_LABEL,
      type: 'm3u',
      playlistUrl,
      epgUrl: String(process.env.FIRATFLIX_DEFAULT_EPG_URL || '').trim(),
      proxyMode: 'always'
    };
  }

  if (DEFAULT_SOURCE_TYPE === 'xtream') {
    const baseUrl = normalizeBaseUrl(process.env.FIRATFLIX_DEFAULT_BASE_URL || '');
    const username = String(process.env.FIRATFLIX_DEFAULT_USERNAME || '').trim();
    const password = String(process.env.FIRATFLIX_DEFAULT_PASSWORD || '').trim();
    if (!baseUrl || !username || !password) return null;
    return {
      id: 'default-source',
      label: DEFAULT_SOURCE_LABEL,
      type: 'xtream',
      baseUrl,
      username,
      password,
      epgUrl: String(process.env.FIRATFLIX_DEFAULT_EPG_URL || '').trim(),
      output: DEFAULT_OUTPUT,
      proxyMode: 'always'
    };
  }

  return null;
}

function sanitizeSource(source) {
  if (!source) return null;
  return {
    id: source.id || 'source',
    label: source.label || 'Source',
    type: source.type,
    epgUrl: source.epgUrl || '',
    output: source.output || DEFAULT_OUTPUT,
    hasCredentials: Boolean(source.username && source.password),
    hasDefaultServerCredentials: source.id === 'default-source',
    baseUrl: source.type === 'xtream' ? source.baseUrl : undefined,
    playlistUrl: source.type === 'm3u' ? source.playlistUrl : undefined
  };
}

function sourceFromRequestPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return null;
  const type = String(payload.type || '').trim().toLowerCase();
  if (type === 'm3u') {
    const playlistUrl = String(payload.playlistUrl || '').trim();
    if (!playlistUrl) throw new Error('playlistUrl is required for M3U sources.');
    return {
      id: payload.id || `manual-${randomUUID()}`,
      label: String(payload.label || 'Manual M3U').trim(),
      type: 'm3u',
      playlistUrl,
      epgUrl: String(payload.epgUrl || '').trim(),
      proxyMode: 'always'
    };
  }
  if (type === 'xtream') {
    const baseUrl = normalizeBaseUrl(payload.baseUrl || '');
    const username = String(payload.username || '').trim();
    const password = String(payload.password || '').trim();
    if (!baseUrl || !username || !password) {
      throw new Error('baseUrl, username and password are required for Xtream sources.');
    }
    return {
      id: payload.id || `manual-${randomUUID()}`,
      label: String(payload.label || 'Manual Xtream').trim(),
      type: 'xtream',
      baseUrl,
      username,
      password,
      epgUrl: String(payload.epgUrl || '').trim(),
      output: String(payload.output || DEFAULT_OUTPUT).trim() || DEFAULT_OUTPUT,
      proxyMode: 'always'
    };
  }
  throw new Error('Unsupported source type.');
}

function selectSource(req, payload = {}) {
  const sourceType = String(payload.source || new URL(req.url, `http://${req.headers.host}`).searchParams.get('source') || 'default');
  if (sourceType === 'default') {
    const source = getDefaultSource();
    if (!source) {
      throw new Error('No default source configured on the server. Set FIRATFLIX_DEFAULT_* environment variables.');
    }
    return source;
  }
  return sourceFromRequestPayload(payload.sourceConfig || payload);
}

function isHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function absoluteUrl(target, base) {
  if (!target) return '';
  try {
    return new URL(target, base).toString();
  } catch {
    return String(target || '').trim();
  }
}

function buildProxyUrl(req, targetUrl, source, kind = 'media') {
  const url = new URL('/api/proxy', `http://${req.headers.host}`);
  url.searchParams.set('url', targetUrl);
  url.searchParams.set('kind', kind);
  if (source?.id === 'default-source') {
    url.searchParams.set('source', 'default');
  } else if (source?.type === 'xtream') {
    url.searchParams.set('sourceType', 'xtream');
    url.searchParams.set('baseUrl', source.baseUrl);
    url.searchParams.set('username', source.username);
    url.searchParams.set('password', source.password);
  } else if (source?.type === 'm3u') {
    url.searchParams.set('sourceType', 'm3u');
  }
  return url.pathname + url.search;
}

function buildResolveUrl(req, targetUrl, source) {
  const url = new URL('/api/resolve-media', `http://${req.headers.host}`);
  url.searchParams.set('url', targetUrl);
  if (source?.id === 'default-source') {
    url.searchParams.set('source', 'default');
  } else if (source?.type === 'xtream') {
    url.searchParams.set('sourceType', 'xtream');
    url.searchParams.set('baseUrl', source.baseUrl);
    url.searchParams.set('username', source.username);
    url.searchParams.set('password', source.password);
  }
  return url.pathname + url.search;
}

function mediaTypeFromUrl(url = '', contentType = '') {
  const normalizedUrl = String(url || '').toLowerCase();
  const normalizedType = String(contentType || '').toLowerCase();
  if (normalizedType.includes('application/vnd.apple.mpegurl') || normalizedType.includes('application/x-mpegurl') || normalizedUrl.includes('.m3u8')) return 'hls';
  if (normalizedType.includes('video/mp4') || normalizedUrl.includes('.mp4')) return 'mp4';
  if (normalizedType.includes('video/mp2t') || normalizedUrl.includes('.ts')) return 'mpegts';
  if (normalizedUrl.includes('.mkv')) return 'mkv';
  return 'native';
}

function sortCandidates(candidates = []) {
  const order = { hls: 0, mp4: 1, native: 2, mpegts: 3, mkv: 4 };
  return [...candidates].sort((a, b) => (order[a.type] ?? 99) - (order[b.type] ?? 99));
}

function sourceAllowsAuthHeaders(source, targetUrl) {
  if (!source?.username || !source?.password) return false;
  try {
    const target = new URL(targetUrl);
    if (source.baseUrl) {
      const sourceHost = new URL(source.baseUrl).host.toLowerCase();
      if (target.host.toLowerCase() === sourceHost) return true;
    }
    return ALLOWED_AUTH_HOSTS.includes(target.host.toLowerCase());
  } catch {
    return false;
  }
}

function redactSensitive(input) {
  return String(input || '')
    .replace(/(username=)[^&]+/gi, '$1***')
    .replace(/(password=)[^&]+/gi, '$1***')
    .replace(/(X-Xtream-User['"]?\s*[:=]\s*['"]?)[^'"\s,}]+/gi, '$1***')
    .replace(/(X-Xtream-Pass['"]?\s*[:=]\s*['"]?)[^'"\s,}]+/gi, '$1***');
}

async function fetchWithRedirects(url, options = {}, limit = 6) {
  let currentUrl = url;
  let response = null;
  for (let attempt = 0; attempt <= limit; attempt += 1) {
    response = await fetch(currentUrl, { ...options, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: currentUrl, redirectCount: attempt };
    }
    const location = response.headers.get('location');
    if (!location) {
      return { response, finalUrl: currentUrl, redirectCount: attempt };
    }
    currentUrl = absoluteUrl(location, currentUrl);
    if (options.method === 'HEAD' && response.status === 303) {
      options = { ...options, method: 'GET' };
    }
  }
  return { response, finalUrl: currentUrl, redirectCount: limit };
}

function createXtreamApiUrl(source, action, params = {}) {
  const url = new URL('/player_api.php', `${source.baseUrl}/`);
  url.searchParams.set('username', source.username);
  url.searchParams.set('password', source.password);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function createXtreamStreamUrls(source, kind, streamId, extension = 'm3u8') {
  const base = source.baseUrl.replace(/\/$/, '');
  if (kind === 'series') {
    const raw = `${base}/series/${source.username}/${source.password}/${streamId}.${extension}`;
    return {
      rawUrl: raw,
      candidateUrls: [
        raw,
        `${base}/series/${streamId}.${extension}`
      ]
    };
  }
  if (kind === 'movie') {
    const raw = `${base}/movie/${source.username}/${source.password}/${streamId}.${extension}`;
    return {
      rawUrl: raw,
      candidateUrls: [
        raw,
        `${base}/movie/${streamId}.${extension}`
      ]
    };
  }
  const raw = `${base}/live/${source.username}/${source.password}/${streamId}.${extension}`;
  return {
    rawUrl: raw,
    candidateUrls: [
      raw,
      `${base}/live/${streamId}.${extension}`
    ]
  };
}

function parseM3uAttributes(fragment = '') {
  const attrs = {};
  const pattern = /(\S+?)="([^"]*)"/g;
  for (const match of fragment.matchAll(pattern)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseM3u(text = '') {
  const lines = String(text || '').split(/\r?\n/);
  const channels = [];
  let current = null;
  let epgUrl = '';
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTM3U')) {
      const attrs = parseM3uAttributes(line);
      epgUrl = attrs['x-tvg-url'] || attrs['url-tvg'] || '';
      continue;
    }
    if (line.startsWith('#EXTINF')) {
      const match = line.match(/^#EXTINF:[^\s]*\s?(.*?),(.*)$/);
      const attrs = parseM3uAttributes(match?.[1] || '');
      current = {
        title: String(match?.[2] || 'Channel').trim(),
        group: attrs['group-title'] || 'General',
        logo: attrs['tvg-logo'] || '',
        tvgId: attrs['tvg-id'] || '',
        tvgName: attrs['tvg-name'] || ''
      };
      continue;
    }
    if (line.startsWith('#')) continue;
    channels.push({
      id: current?.tvgId || `live-${channels.length + 1}`,
      streamId: `m3u-${channels.length + 1}`,
      number: String(channels.length + 1),
      title: current?.title || `Channel ${channels.length + 1}`,
      category: current?.group || 'General',
      logo: current?.logo || '',
      streamUrl: line,
      tvgId: current?.tvgId || '',
      tvgName: current?.tvgName || ''
    });
    current = null;
  }
  return { channels, epgUrl };
}

async function fetchTextWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream responded with ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream responded with ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function safeProxyMedia(req, url, source, kind = 'media') {
  if (!url) return '/brand/poster-placeholder.svg';
  if (!isHttpUrl(url)) return url;
  return buildProxyUrl(req, url, source, kind);
}

function normalizeCategoryId(value) {
  return String(value || 'uncategorized');
}

function buildCategoryList(entries = [], items = [], field = 'category') {
  const seen = new Set();
  const list = [{ id: 'all', label: 'Tümü' }];
  for (const entry of entries) {
    const id = normalizeCategoryId(entry.category_id || entry.id);
    const label = entry.category_name || entry.label;
    if (!label || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, label });
  }
  for (const item of items) {
    const id = normalizeCategoryId(item.categoryId || item[field]);
    const label = item[field] || 'General';
    if (seen.has(id)) continue;
    seen.add(id);
    list.push({ id, label });
  }
  return list;
}

function enrichCandidates(req, item, source) {
  const sourceCandidates = Array.isArray(item.sourceCandidates) ? item.sourceCandidates : [];
  const deduped = new Map();
  for (const candidate of sourceCandidates) {
    const url = String(candidate.url || '').trim();
    if (!url) continue;
    const proxied = buildProxyUrl(req, url, source, 'stream');
    deduped.set(proxied, {
      id: candidate.id || url,
      label: candidate.label || 'Source',
      url: proxied,
      resolveUrl: buildResolveUrl(req, url, source),
      type: candidate.type || mediaTypeFromUrl(url),
      originalUrl: url
    });
  }
  item.sourceCandidates = sortCandidates([...deduped.values()]);
  item.streamUrl = item.sourceCandidates[0]?.url || item.streamUrl;
  return item;
}

function mapXtreamMovie(req, raw, categoryMap, source) {
  const ext = String(raw.container_extension || source.output || 'mp4').trim();
  const urls = createXtreamStreamUrls(source, 'movie', raw.stream_id, ext);
  const categoryId = normalizeCategoryId(raw.category_id);
  return enrichCandidates(req, {
    kind: 'movie',
    id: `movie-${raw.stream_id}`,
    streamId: String(raw.stream_id),
    title: raw.name || 'Movie',
    description: raw.plot || raw.description || 'Açıklama bulunamadı.',
    categoryId,
    category: categoryMap[categoryId] || 'General',
    poster: safeProxyMedia(req, raw.stream_icon, source, 'image'),
    backdrop: safeProxyMedia(req, raw.backdrop_path?.[0] || raw.stream_icon, source, 'image'),
    rating: raw.rating || '',
    year: raw.year || '',
    sourceCandidates: urls.candidateUrls.map((url, index) => ({
      id: `movie-${raw.stream_id}-${index}`,
      label: index === 0 ? 'Primary' : 'Fallback',
      url,
      type: mediaTypeFromUrl(url)
    }))
  }, source);
}

function mapXtreamLive(req, raw, categoryMap, source) {
  const ext = String(raw.container_extension || source.output || 'm3u8').trim();
  const urls = createXtreamStreamUrls(source, 'live', raw.stream_id, ext);
  const categoryId = normalizeCategoryId(raw.category_id);
  return enrichCandidates(req, {
    kind: 'live',
    id: `live-${raw.stream_id}`,
    streamId: String(raw.stream_id),
    number: String(raw.num || ''),
    title: raw.name || 'Channel',
    description: categoryMap[categoryId] || 'Live channel',
    categoryId,
    category: categoryMap[categoryId] || 'General',
    logo: safeProxyMedia(req, raw.stream_icon, source, 'image'),
    poster: safeProxyMedia(req, raw.stream_icon, source, 'image'),
    sourceCandidates: urls.candidateUrls.map((url, index) => ({
      id: `live-${raw.stream_id}-${index}`,
      label: index === 0 ? 'Primary' : 'Fallback',
      url,
      type: mediaTypeFromUrl(url)
    }))
  }, source);
}

function mapXtreamSeriesCard(req, raw, categoryMap, source) {
  const categoryId = normalizeCategoryId(raw.category_id);
  return {
    kind: 'series',
    id: `series-${raw.series_id}`,
    streamId: String(raw.series_id),
    title: raw.name || 'Series',
    description: raw.plot || raw.description || 'Açıklama bulunamadı.',
    categoryId,
    category: categoryMap[categoryId] || 'General',
    poster: safeProxyMedia(req, raw.cover, source, 'image'),
    backdrop: safeProxyMedia(req, raw.backdrop_path?.[0] || raw.cover, source, 'image'),
    rating: raw.rating || '',
    year: raw.year || '',
    detailsLoaded: false,
    seasons: []
  };
}

async function loadXtreamSeriesDetail(req, source, seriesId) {
  const info = await fetchJsonWithTimeout(createXtreamApiUrl(source, 'get_series_info', { series_id: seriesId }));
  const episodesBySeason = info.episodes || {};
  const seasons = Object.entries(episodesBySeason).map(([seasonNumber, episodes]) => ({
    id: `series-${seriesId}-season-${seasonNumber}`,
    number: Number(seasonNumber),
    title: `Sezon ${seasonNumber}`,
    episodes: episodes.map((episode) => {
      const ext = String(episode.container_extension || source.output || 'mp4').trim();
      const urls = createXtreamStreamUrls(source, 'series', episode.id, ext);
      return enrichCandidates(req, {
        kind: 'episode',
        id: `series-${seriesId}-episode-${episode.id}`,
        streamId: String(episode.id),
        seriesId: `series-${seriesId}`,
        title: episode.title || `Bölüm ${episode.episode_num || ''}`.trim(),
        description: episode.info?.plot || info.info?.plot || 'Açıklama bulunamadı.',
        poster: safeProxyMedia(req, info.info?.cover || info.info?.movie_image, source, 'image'),
        backdrop: safeProxyMedia(req, info.info?.backdrop_path?.[0] || info.info?.cover, source, 'image'),
        sourceCandidates: urls.candidateUrls.map((url, index) => ({
          id: `series-${seriesId}-${episode.id}-${index}`,
          label: index === 0 ? 'Primary' : 'Fallback',
          url,
          type: mediaTypeFromUrl(url)
        }))
      }, source);
    })
  }));

  return {
    kind: 'series',
    id: `series-${seriesId}`,
    streamId: String(seriesId),
    title: info.info?.name || 'Series',
    description: info.info?.plot || 'Açıklama bulunamadı.',
    categoryId: normalizeCategoryId(info.info?.category_id),
    category: info.info?.genre || 'General',
    poster: safeProxyMedia(req, info.info?.cover || info.info?.movie_image, source, 'image'),
    backdrop: safeProxyMedia(req, info.info?.backdrop_path?.[0] || info.info?.cover, source, 'image'),
    rating: info.info?.rating || '',
    year: String(info.info?.releasedate || '').slice(0, 4),
    detailsLoaded: true,
    seasons
  };
}

async function loadLibrary(req, source) {
  if (source.type === 'm3u') {
    const playlist = await fetchTextWithTimeout(source.playlistUrl);
    const parsed = parseM3u(playlist);
    const live = parsed.channels.map((channel) => enrichCandidates(req, {
      kind: 'live',
      id: channel.id,
      streamId: channel.streamId,
      number: channel.number,
      title: channel.title,
      description: channel.category,
      categoryId: channel.category,
      category: channel.category,
      logo: safeProxyMedia(req, channel.logo, source, 'image'),
      poster: safeProxyMedia(req, channel.logo, source, 'image'),
      sourceCandidates: [{
        id: `${channel.id}-primary`,
        label: 'Primary',
        url: channel.streamUrl,
        type: mediaTypeFromUrl(channel.streamUrl)
      }]
    }, source));

    return {
      meta: sanitizeSource({ ...source, epgUrl: source.epgUrl || parsed.epgUrl }),
      counts: { live: live.length, movies: 0, series: 0 },
      hero: {
        eyebrow: 'M3U',
        title: source.label,
        summary: 'Varsayılan playlist kaynağı yüklendi. Demo akışı kullanılmıyor.'
      },
      categories: {
        live: buildCategoryList([], live),
        movies: [{ id: 'all', label: 'Tümü' }],
        series: [{ id: 'all', label: 'Tümü' }]
      },
      live,
      movies: [],
      series: []
    };
  }

  const [vodCategories, seriesCategories, liveCategories, vodStreams, seriesStreams, liveStreams] = await Promise.all([
    fetchJsonWithTimeout(createXtreamApiUrl(source, 'get_vod_categories')),
    fetchJsonWithTimeout(createXtreamApiUrl(source, 'get_series_categories')),
    fetchJsonWithTimeout(createXtreamApiUrl(source, 'get_live_categories')),
    fetchJsonWithTimeout(createXtreamApiUrl(source, 'get_vod_streams')),
    fetchJsonWithTimeout(createXtreamApiUrl(source, 'get_series')),
    fetchJsonWithTimeout(createXtreamApiUrl(source, 'get_live_streams'))
  ]);

  const vodCategoryMap = Object.fromEntries(vodCategories.map((entry) => [normalizeCategoryId(entry.category_id), entry.category_name]));
  const seriesCategoryMap = Object.fromEntries(seriesCategories.map((entry) => [normalizeCategoryId(entry.category_id), entry.category_name]));
  const liveCategoryMap = Object.fromEntries(liveCategories.map((entry) => [normalizeCategoryId(entry.category_id), entry.category_name]));

  const movies = vodStreams.map((item) => mapXtreamMovie(req, item, vodCategoryMap, source));
  const series = seriesStreams.map((item) => mapXtreamSeriesCard(req, item, seriesCategoryMap, source));
  const live = liveStreams.map((item) => mapXtreamLive(req, item, liveCategoryMap, source));

  return {
    meta: sanitizeSource(source),
    counts: { live: live.length, movies: movies.length, series: series.length },
    hero: {
      eyebrow: 'Xtream',
      title: source.label,
      summary: 'Varsayılan Xtream kaynağı sunucu tarafında yüklendi. Demo akışı kapalı.'
    },
    categories: {
      live: buildCategoryList(liveCategories, live),
      movies: buildCategoryList(vodCategories, movies),
      series: buildCategoryList(seriesCategories, series)
    },
    live,
    movies,
    series
  };
}

function mapKnownStatus(status) {
  if (status === 404) return '404 kaynak bulunamadı';
  if (status === 403) return '403 erişim reddi';
  if (status === 511) return '511 ağ doğrulaması gerekiyor';
  if (status === 401) return '401 yetkilendirme başarısız';
  if (status === 429) return '429 hız limiti';
  if (status >= 500) return `${status} upstream sunucu hatası`;
  return `${status} upstream hata`;
}

async function resolveMedia(req, source, targetUrl) {
  if (!targetUrl || !isHttpUrl(targetUrl)) {
    throw new Error('Valid media URL is required.');
  }

  const headers = new Headers({
    'user-agent': req.headers['user-agent'] || 'FIRATFLIX/2.0',
    'accept': '*/*'
  });

  if (sourceAllowsAuthHeaders(source, targetUrl)) {
    headers.set('x-xtream-user', source.username);
    headers.set('x-xtream-pass', source.password);
  }

  let probe;
  try {
    probe = await fetchWithRedirects(targetUrl, { method: 'HEAD', headers }, 6);
    if (!probe.response || probe.response.status >= 400) {
      probe = await fetchWithRedirects(targetUrl, { method: 'GET', headers }, 6);
    }
  } catch {
    probe = await fetchWithRedirects(targetUrl, { method: 'GET', headers }, 6);
  }

  const contentType = probe.response.headers.get('content-type') || '';
  const finalUrl = probe.response.url || probe.finalUrl || targetUrl;
  const type = mediaTypeFromUrl(finalUrl, contentType);
  try { await probe.response.body?.cancel?.(); } catch {}

  return {
    ok: probe.response.ok,
    status: probe.response.status,
    statusLabel: probe.response.ok ? 'ok' : mapKnownStatus(probe.response.status),
    type,
    targetUrl,
    finalUrl,
    contentType,
    viaProxyUrl: buildProxyUrl(req, finalUrl, source, 'stream'),
    redirectCount: probe.redirectCount || 0
  };
}

function rewritePlaylist(text, upstreamUrl, req, source) {
  const lines = String(text || '').split(/\r?\n/);
  const baseUrl = upstreamUrl;
  return lines.map((lineRaw) => {
    const line = lineRaw.trim();
    if (!line) return lineRaw;
    if (line.startsWith('#')) {
      return lineRaw.replace(/URI="([^"]+)"/g, (_match, value) => {
        const resolved = absoluteUrl(value, baseUrl);
        return `URI="${buildProxyUrl(req, resolved, source, 'stream')}"`;
      });
    }
    const resolved = absoluteUrl(line, baseUrl);
    return buildProxyUrl(req, resolved, source, 'stream');
  }).join('\n');
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type, Accept, Range'
  };
}

async function handleProxy(req) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const targetUrl = requestUrl.searchParams.get('url') || '';
  const sourceKind = requestUrl.searchParams.get('source') || '';
  let source = null;
  if (sourceKind === 'default') {
    source = getDefaultSource();
  } else if (requestUrl.searchParams.get('sourceType') === 'xtream') {
    source = {
      type: 'xtream',
      baseUrl: normalizeBaseUrl(requestUrl.searchParams.get('baseUrl') || ''),
      username: requestUrl.searchParams.get('username') || '',
      password: requestUrl.searchParams.get('password') || ''
    };
  }
  if (!targetUrl || !isHttpUrl(targetUrl)) {
    return safeJson({ error: 'Missing or invalid url query parameter.' }, 400);
  }

  const target = new URL(targetUrl);
  const headers = new Headers({
    'user-agent': req.headers['user-agent'] || 'FIRATFLIX/2.0',
    'accept': req.headers.accept || '*/*'
  });
  if (req.headers.range) headers.set('range', req.headers.range);
  if (sourceAllowsAuthHeaders(source, targetUrl)) {
    headers.set('x-xtream-user', source.username);
    headers.set('x-xtream-pass', source.password);
  }

  const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
  const upstream = await fetchWithRedirects(target.toString(), { method, headers }, 6);
  const responseHeaders = {
    ...corsHeaders(),
    'cache-control': upstream.response.headers.get('cache-control') || 'no-store',
    'content-type': upstream.response.headers.get('content-type') || 'application/octet-stream'
  };
  for (const name of ['accept-ranges', 'content-range', 'etag', 'last-modified', 'content-length']) {
    const value = upstream.response.headers.get(name);
    if (value) responseHeaders[name] = value;
  }

  const contentType = upstream.response.headers.get('content-type') || '';
  const finalUrl = upstream.response.url || upstream.finalUrl || targetUrl;
  console.log(`[proxy] ${method} ${redactSensitive(targetUrl)} -> ${upstream.response.status} ${redactSensitive(finalUrl)} (${contentType || 'unknown'})`);

  if (!upstream.response.ok && upstream.response.status !== 206) {
    let detail = '';
    try {
      detail = await upstream.response.text();
    } catch {}
    return safeJson({
      error: mapKnownStatus(upstream.response.status),
      status: upstream.response.status,
      finalUrl,
      detail: detail.slice(0, 300)
    }, upstream.response.status);
  }

  if (/application\/vnd\.apple\.mpegurl|application\/x-mpegurl/i.test(contentType) || finalUrl.toLowerCase().includes('.m3u8')) {
    const text = await upstream.response.text();
    return textResponse(rewritePlaylist(text, finalUrl, req, source), upstream.response.status, contentType || 'application/vnd.apple.mpegurl');
  }

  return {
    status: upstream.response.status,
    headers: responseHeaders,
    body: Buffer.from(await upstream.response.arrayBuffer())
  };
}

async function serveStatic(reqPath) {
  const cleanPath = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = normalize(join(DIST_DIR, cleanPath));
  if (!filePath.startsWith(DIST_DIR)) {
    return safeJson({ error: 'Invalid path' }, 400);
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      return serveStatic(join(cleanPath, 'index.html'));
    }
    const ext = extname(filePath).toLowerCase();
    return {
      status: 200,
      headers: { 'content-type': MIME_TYPES[ext] || 'application/octet-stream' },
      streamPath: filePath
    };
  } catch {
    const indexPath = join(DIST_DIR, 'index.html');
    return {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      streamPath: indexPath
    };
  }
}

async function routeRequest(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return noContent(204, corsHeaders());

  if (url.pathname === '/runtime-config.js') {
    const runtime = getRuntimeConfig(req);
    return textResponse(`window.FIRATFLIX_RUNTIME_CONFIG = ${JSON.stringify(runtime, null, 2)};`, 200, 'text/javascript; charset=utf-8');
  }

  if (url.pathname === '/api/default-source') {
    return safeJson({ source: sanitizeSource(getDefaultSource()) });
  }

  if (url.pathname === '/api/library' && req.method === 'GET') {
    try {
      const source = selectSource(req);
      const library = await loadLibrary(req, source);
      return safeJson(library);
    } catch (error) {
      return safeJson({ error: error.message || 'Library load failed.' }, 500);
    }
  }

  if (url.pathname === '/api/library' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const source = selectSource(req, payload);
      const library = await loadLibrary(req, source);
      return safeJson(library);
    } catch (error) {
      return safeJson({ error: error.message || 'Library load failed.' }, 500);
    }
  }

  if (url.pathname === '/api/series-info' && req.method === 'GET') {
    try {
      const source = selectSource(req);
      const seriesId = url.searchParams.get('seriesId') || '';
      if (!seriesId) return safeJson({ error: 'seriesId is required.' }, 400);
      if (source.type !== 'xtream') return safeJson({ error: 'Series detail is only available for Xtream sources.' }, 400);
      return safeJson(await loadXtreamSeriesDetail(req, source, seriesId));
    } catch (error) {
      return safeJson({ error: error.message || 'Series load failed.' }, 500);
    }
  }

  if (url.pathname === '/api/series-info' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const source = selectSource(req, payload);
      const seriesId = String(payload.seriesId || '').trim();
      if (!seriesId) return safeJson({ error: 'seriesId is required.' }, 400);
      if (source.type !== 'xtream') return safeJson({ error: 'Series detail is only available for Xtream sources.' }, 400);
      return safeJson(await loadXtreamSeriesDetail(req, source, seriesId));
    } catch (error) {
      return safeJson({ error: error.message || 'Series load failed.' }, 500);
    }
  }

  if (url.pathname === '/api/resolve-media') {
    try {
      const payload = req.method === 'POST' ? await parseRequestBody(req) : {};
      const source = selectSource(req, payload);
      const targetUrl = payload.url || url.searchParams.get('url') || '';
      return safeJson(await resolveMedia(req, source, targetUrl));
    } catch (error) {
      return safeJson({ error: error.message || 'Resolve failed.' }, 500);
    }
  }

  if (url.pathname === '/api/proxy') {
    return handleProxy(req);
  }

  return serveStatic(url.pathname);
}

createServer(async (req, res) => {
  try {
    const response = await routeRequest(req);
    res.statusCode = response.status;
    for (const [key, value] of Object.entries(response.headers || {})) {
      res.setHeader(key, value);
    }
    if (response.streamPath) {
      createReadStream(response.streamPath).pipe(res);
      return;
    }
    if (!response.body) {
      res.end();
      return;
    }
    res.end(response.body);
  } catch (error) {
    console.error('[server] fatal', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error.message || 'Internal server error.' }));
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`FIRATFLIX server listening on ${PORT}`);
});
