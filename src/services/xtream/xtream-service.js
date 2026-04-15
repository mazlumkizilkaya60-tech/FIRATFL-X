import { maybeProxyUrl, shouldUseProxy } from '../../core/network/proxy.js';

const XTREAM_TIMEOUT_MS = 9_000;

function createApiUrl(source, action, params = {}) {
  const baseUrl = new URL('/player_api.php', source.baseUrl.endsWith('/') ? source.baseUrl : `${source.baseUrl}/`);
  baseUrl.searchParams.set('username', source.username);
  baseUrl.searchParams.set('password', source.password);
  baseUrl.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') {
      baseUrl.searchParams.set(key, value);
    }
  });

  return baseUrl.toString();
}

function createStreamUrl(source, kind, streamId, extension) {
  const rawUrl = `${source.baseUrl}/${kind}/${source.username}/${source.password}/${streamId}.${extension}`;
  const cleanUrl = `${source.baseUrl}/${kind}/stream/${streamId}.${extension}`;
  const useProxy = shouldUseProxy(source);
  const resolvedUrl = useProxy ? maybeProxyUrl(cleanUrl, source) : rawUrl;
  return {
    rawUrl,
    proxiedUrl: useProxy ? resolvedUrl : '',
    resolvedUrl,
    credentials: {
      username: source.username,
      password: source.password
    }
  };
}

async function fetchJson(url, source, timeoutMs = XTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    const proxiedUrl = maybeProxyUrl(url, source);
    const fetchUrl = new URL(proxiedUrl);
    const usingProxy = proxiedUrl !== url;

    const headers = {};
    if (url.includes('player_api.php')) {
      const parsed = new URL(url);
      const username = parsed.searchParams.get('username');
      const password = parsed.searchParams.get('password');
      if (username && password && usingProxy) {
        headers['X-Xtream-User'] = username;
        headers['X-Xtream-Pass'] = password;
        fetchUrl.searchParams.delete('username');
        fetchUrl.searchParams.delete('password');
      }
    }

    const response = await fetch(fetchUrl.toString(), {
      signal: controller.signal,
      headers: Object.keys(headers).length > 0 ? headers : undefined
    });

    if (!response.ok) {
      throw new Error(`Xtream isteÄŸi baÅŸarÄ±sÄ±z (${response.status})`);
    }

    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Xtream isteÄŸi zaman aÅŸÄ±mÄ±na uÄŸradÄ±.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function normalizeCategoryId(value) {
  return String(value || 'uncategorized');
}

function mapMovie(item, categoryMap, source) {
  const categoryId = normalizeCategoryId(item.category_id);
  const category = categoryMap[categoryId] || 'Unsorted';
  const stream = createStreamUrl(source, 'movie', item.stream_id, item.container_extension || 'mp4');

  return {
    kind: 'movie',
    id: `movie-${item.stream_id}`,
    streamId: item.stream_id,
    title: item.name || 'Movie',
    description: item.plot || item.description || 'AÃ§Ä±klama bulunamadÄ±.',
    year: Number(item.year) || null,
    rating: item.rating || '',
    durationMinutes: Number(item.duration_secs) ? Math.round(item.duration_secs / 60) : null,
    genres: item.genre ? item.genre.split(',').map((part) => part.trim()) : [],
    categoryId,
    category,
    poster: item.stream_icon || '',
    backdrop: item.backdrop_path?.[0] || item.stream_icon || '',
    isAdult: item.is_adult === 1 || item.is_adult === '1' || item.adult === 1 || item.adult === '1',
    rawStreamUrl: stream.rawUrl,
    streamUrl: stream.resolvedUrl
  };
}

function mapSeries(item, categoryMap, source, details = {}) {
  const categoryId = normalizeCategoryId(item.category_id);
  const category = categoryMap[categoryId] || 'Unsorted';
  const seasons = Object.values(details.episodes ?? {}).map((episodes) => {
    const first = episodes[0] ?? {};
    const number = Number(first.season) || 1;
    return {
      id: `series-${item.series_id}-season-${number}`,
      number,
      title: `Sezon ${number}`,
      episodes: episodes.map((episode) => {
        const stream = createStreamUrl(source, 'series', episode.id, episode.container_extension || 'mp4');
        return {
          id: `series-${item.series_id}-season-${number}-episode-${episode.id}`,
          title: episode.title || `BÃ¶lÃ¼m ${episode.episode_num || ''}`.trim(),
          description: episode.info?.plot || 'AÃ§Ä±klama bulunamadÄ±.',
          durationMinutes: Number(episode.info?.duration_secs) ? Math.round(episode.info.duration_secs / 60) : null,
          rawStreamUrl: stream.rawUrl,
          streamUrl: stream.resolvedUrl
        };
      })
    };
  });

  return {
    kind: 'series',
    id: `series-${item.series_id}`,
    streamId: item.series_id,
    title: item.name || 'Series',
    description: details.info?.plot || item.plot || 'AÃ§Ä±klama bulunamadÄ±.',
    year: Number(details.info?.releaseDate?.slice(0, 4) || item.year) || null,
    rating: details.info?.rating || item.rating || '',
    genres: details.info?.genre ? details.info.genre.split(',').map((part) => part.trim()) : [],
    categoryId,
    category,
    poster: item.cover || '',
    backdrop: details.info?.backdrop_path?.[0] || item.cover || '',
    isAdult: item.is_adult === 1 || item.is_adult === '1' || item.adult === 1 || item.adult === '1',
    seasons,
    detailsLoaded: seasons.length > 0
  };
}

function mapLive(item, categoryMap, source) {
  const categoryId = normalizeCategoryId(item.category_id);
  const category = categoryMap[categoryId] || 'Unsorted';
  const extension = item.container_extension || 'm3u8';
  const stream = createStreamUrl(source, 'live', item.stream_id, extension);

  return {
    kind: 'live',
    id: `live-${item.stream_id}`,
    streamId: item.stream_id,
    number: item.num ? String(item.num) : '',
    title: item.name || 'Channel',
    group: category,
    categoryId,
    category,
    logo: item.stream_icon || '',
    description: category,
    isAdult: item.is_adult === 1 || item.is_adult === '1' || item.adult === 1 || item.adult === '1',
    rawStreamUrl: stream.rawUrl,
    streamUrl: stream.resolvedUrl,
    tvgId: item.epg_channel_id || '',
    tvgName: item.name || ''
  };
}

function buildCategories(categoryEntries = [], items = []) {
  const categories = [];
  const seen = new Set();

  categoryEntries.forEach((entry) => {
    const id = normalizeCategoryId(entry.category_id || entry.id);
    const label = entry.category_name || entry.label || '';
    if (!label || seen.has(id)) return;
    seen.add(id);
    categories.push({ id, label });
  });

  items.forEach((item) => {
    const id = normalizeCategoryId(item.categoryId || item.category);
    const label = item.category || 'Unsorted';
    if (seen.has(id)) return;
    seen.add(id);
    categories.push({ id, label });
  });

  return categories;
}

export async function loadXtreamSeriesDetails(source, seriesItem) {
  const details = await fetchJson(createApiUrl(source, 'get_series_info', { series_id: seriesItem.streamId }), source);

  return mapSeries(
    {
      series_id: seriesItem.streamId,
      name: seriesItem.title,
      plot: seriesItem.description,
      year: seriesItem.year,
      rating: seriesItem.rating,
      cover: seriesItem.poster,
      category_id: seriesItem.categoryId
    },
    {
      [normalizeCategoryId(seriesItem.categoryId)]: seriesItem.category || 'Unsorted'
    },
    source,
    details
  );
}

export async function loadXtreamSource(source) {
  const [vodCategories, seriesCategories, liveCategories] = await Promise.all([
    fetchJson(createApiUrl(source, 'get_vod_categories'), source),
    fetchJson(createApiUrl(source, 'get_series_categories'), source),
    fetchJson(createApiUrl(source, 'get_live_categories'), source)
  ]);

  const vodCategoryMap = Object.fromEntries(vodCategories.map((item) => [normalizeCategoryId(item.category_id), item.category_name]));
  const seriesCategoryMap = Object.fromEntries(seriesCategories.map((item) => [normalizeCategoryId(item.category_id), item.category_name]));
  const liveCategoryMap = Object.fromEntries(liveCategories.map((item) => [normalizeCategoryId(item.category_id), item.category_name]));

  const [movieStreams, seriesStreams, liveStreams] = await Promise.all([
    fetchJson(createApiUrl(source, 'get_vod_streams'), source),
    fetchJson(createApiUrl(source, 'get_series'), source),
    fetchJson(createApiUrl(source, 'get_live_streams'), source)
  ]);

  const movies = movieStreams.map((item) => mapMovie(item, vodCategoryMap, source));
  const series = seriesStreams.map((item) => mapSeries(item, seriesCategoryMap, source, {}));
  const live = liveStreams.map((item) => mapLive(item, liveCategoryMap, source));

  return {
    sourceType: 'xtream',
    sourceLabel: source.label,
    hero: {
      eyebrow: 'Xtream Source',
      title: source.label,
      summary: 'Xtream panelinden alÄ±nan canlÄ± kanal, film ve dizi kataloÄŸu.',
      primaryAction: { label: 'KaynaÄŸÄ± AÃ§', route: 'home' }
    },
    featured: [...movies.slice(0, 3), ...series.slice(0, 2)],
    categories: {
      movies: buildCategories(vodCategories, movies),
      series: buildCategories(seriesCategories, series),
      live: buildCategories(liveCategories, live)
    },
    movies,
    series,
    live
  };
}
