import { createKeyValueDatabase } from '../core/storage/indexed-db.js';
import { maybeProxyUrl, shouldUseProxy, isMixedContentRisk } from '../core/network/proxy.js';
import { createLogger } from '../core/utils/logger.js';
import { normalizeSearchTerm } from '../core/utils/format.js';
import { loadM3uSource } from './m3u/m3u-service.js';
import { tryParseXtreamCredentials } from './m3u/m3u-parser.js';
import { mergeEpg, loadEpg } from './epg/epg-service.js';
import { loadXtreamSeriesDetails, loadXtreamSource } from './xtream/xtream-service.js';

const logger = createLogger('source-manager');
const cacheDb = createKeyValueDatabase('firatflix-cache');
const CATALOG_CACHE_VERSION = 'v4-force-proxy-http';

const ADULT_PATTERNS = [
  /xxx/i,
  /adult/i,
  /porn(?:o)?/i,
  /erotic/i,
  /erotik/i,
  /(?:18\+|\+18)/i,
  /yetiskin/i,
  /playboy/i,
  /brazzers/i,
  /hustler/i,
];

function resolveSourceUrl(source) {
  return source.type === 'xtream' ? source.baseUrl : source.playlistUrl;
}

function getCatalogCacheKey(sourceId) {
  return `catalog:${CATALOG_CACHE_VERSION}:${sourceId}`;
}

function matchesAdultPattern(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  return ADULT_PATTERNS.some((pattern) => pattern.test(text));
}

function isAdultEntry(item = {}) {
  if (item.isAdult === true || item.adult === true) return true;
  if (String(item.isAdult || '') === '1' || String(item.adult || '') === '1') return true;

  return [
    item.title,
    item.category,
    item.group,
    item.description,
    ...(Array.isArray(item.genres) ? item.genres : []),
  ].some((value) => matchesAdultPattern(value));
}

function filterCategories(categories = [], items = []) {
  const activeIds = new Set(
    items.map((item) => String(item.categoryId || item.category || 'uncategorized')),
  );

  return categories.filter((category) => activeIds.has(String(category.id)));
}

function validateBrowserSource(source) {
  const candidate = resolveSourceUrl(source);
  if (!candidate) return;

  if (isMixedContentRisk(candidate) && !shouldUseProxy(source, candidate)) {
    throw new Error(
      'Site HTTPS üzerinde çalışıyor ama IPTV kaynağı HTTP kullanıyor. Proxy kapalı olduğu için tarayıcı bunu mixed content olarak engelliyor.',
    );
  }
}

function proxyCandidate(candidate, source) {
  if (!candidate) return candidate;

  return {
    ...candidate,
    url: maybeProxyUrl(candidate.url, {
      ...source,
      credentials: candidate.credentials || source.credentials || null,
      username:
        source.username ||
        candidate.username ||
        candidate.credentials?.username ||
        source.credentials?.username ||
        '',
      password:
        source.password ||
        candidate.password ||
        candidate.credentials?.password ||
        source.credentials?.password ||
        '',
    }),
  };
}

function proxyItemMedia(item, source) {
  if (!item || typeof item !== 'object') return item;

  const next = { ...item };

  for (const field of [
    'poster',
    'logo',
    'backdrop',
    'fanart',
    'thumbnail',
    'cover',
    'streamUrl',
    'previewUrl',
  ]) {
    if (next[field]) {
      next[field] = maybeProxyUrl(next[field], source);
    }
  }

  if (Array.isArray(next.sourceCandidates)) {
    next.sourceCandidates = next.sourceCandidates.map((candidate) =>
      proxyCandidate(candidate, source),
    );
  }

  if (Array.isArray(next.seasons)) {
    next.seasons = next.seasons.map((season) => ({
      ...season,
      episodes: Array.isArray(season.episodes)
        ? season.episodes.map((episode) =>
            proxyItemMedia(
              {
                ...episode,
                poster: episode.poster || next.poster,
                backdrop: episode.backdrop || next.backdrop,
                category: episode.category || next.category,
              },
              source,
            ),
          )
        : [],
    }));
  }

  return next;
}

function proxyCollection(items = [], source) {
  return items.map((item) => proxyItemMedia(item, source));
}

function normalizeLibraryMedia(source, library) {
  return {
    ...library,
    hero: Array.isArray(library.hero)
      ? proxyCollection(library.hero, source)
      : proxyItemMedia(library.hero, source),
    featured: proxyCollection(library.featured ?? [], source),
    movies: proxyCollection(library.movies ?? [], source),
    series: proxyCollection(library.series ?? [], source),
    live: proxyCollection(library.live ?? [], source),
  };
}

function createSearchIndex(library) {
  return [...library.movies, ...library.series, ...library.live].map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    poster: item.poster || item.logo || '',
    category: item.category || item.group || '',
    searchKey: normalizeSearchTerm(
      [item.title, item.category, item.group, item.description].join(' '),
    ),
  }));
}

function createLookup(library) {
  const lookup = {};

  library.movies.forEach((item) => {
    lookup[item.id] = item;
  });

  library.series.forEach((item) => {
    lookup[item.id] = item;

    item.seasons?.forEach((season) => {
      season.episodes?.forEach((episode) => {
        lookup[episode.id] = {
          ...episode,
          kind: 'episode',
          seriesId: item.id,
          seriesTitle: item.title,
          poster: episode.poster || item.poster,
          backdrop: episode.backdrop || item.backdrop,
          category: episode.category || item.category,
        };
      });
    });
  });

  library.live.forEach((item) => {
    lookup[item.id] = item;
  });

  return lookup;
}

function finalizeLibrary(source, library) {
  const normalized = normalizeLibraryMedia(source, library);

  const merged = {
    loadedAt: new Date().toISOString(),
    sourceType: normalized.sourceType || source.type,
    sourceLabel: normalized.sourceLabel || source.label,
    hero: normalized.hero,
    featured: normalized.featured ?? [],
    categories: normalized.categories,
    movies: normalized.movies ?? [],
    series: normalized.series ?? [],
    live: normalized.live ?? [],
    diagnostics: null,
  };

  merged.lookup = createLookup(merged);
  merged.searchIndex = createSearchIndex(merged);

  return merged;
}

function replaceSeriesInLibrary(library, nextSeriesItem) {
  const nextLibrary = {
    ...library,
    series: library.series.map((item) => (item.id === nextSeriesItem.id ? nextSeriesItem : item)),
  };

  nextLibrary.lookup = createLookup(nextLibrary);
  nextLibrary.searchIndex = createSearchIndex(nextLibrary);

  return nextLibrary;
}

function applyLibraryPreferences(library, preferences = {}) {
  const visible = structuredClone(library);

  if (!preferences.hideAdultContent) {
    visible.lookup = createLookup(visible);
    visible.searchIndex = createSearchIndex(visible);
    visible.diagnostics = null;
    return visible;
  }

  visible.featured = (visible.featured ?? []).filter((item) => !isAdultEntry(item));
  visible.movies = (visible.movies ?? []).filter((item) => !isAdultEntry(item));
  visible.series = (visible.series ?? []).filter((item) => !isAdultEntry(item));
  visible.live = (visible.live ?? []).filter((item) => !isAdultEntry(item));
  visible.categories = {
    movies: filterCategories(visible.categories?.movies, visible.movies),
    series: filterCategories(visible.categories?.series, visible.series),
    live: filterCategories(visible.categories?.live, visible.live),
  };

  visible.lookup = createLookup(visible);
  visible.searchIndex = createSearchIndex(visible);
  visible.diagnostics = null;

  return visible;
}

function getRuntimeConfig() {
  // First try window config (server-injected)
  const windowConfig = window.FIRATFLIX_RUNTIME_CONFIG || {};
  
  // Fallback to environment variables (like Python version)
  if (!windowConfig.defaultSource || !windowConfig.defaultSource.type) {
    return {
      backendBaseUrl: windowConfig.backendBaseUrl || '',
      proxyMode: windowConfig.proxyMode || 'always',
      forceProxyImages: windowConfig.forceProxyImages !== false,
      forceProxyStreams: windowConfig.forceProxyStreams !== false,
      forceProxyMetadata: windowConfig.forceProxyMetadata !== false,
      defaultSource: {
        type: windowConfig.defaultSource?.type || 'xtream',
        playlistUrl: windowConfig.defaultSource?.playlistUrl || '',
        epgUrl: windowConfig.defaultSource?.epgUrl || '',
        baseUrl: windowConfig.defaultSource?.baseUrl || 'http://xbluex5k.xyz:8080',
        username: windowConfig.defaultSource?.username || 'asan8442',
        password: windowConfig.defaultSource?.password || '6748442',
        label: windowConfig.defaultSource?.label || 'Default IPTV Source'
      }
    };
  }
  
  return windowConfig;
}

function createSourceFromRuntimeConfig(defaultSource) {
  if (!defaultSource || !defaultSource.type) return null;

  const source = {
    id: 'source-runtime',
    type: defaultSource.type === 'xtream' ? 'xtream' : 'm3u',
    label: defaultSource.label || 'Default IPTV Source',
    proxyMode: 'always',
    createdAt: new Date().toISOString(),
    epgUrl: defaultSource.epgUrl || ''
  };

  if (source.type === 'xtream') {
    if (!defaultSource.baseUrl) return null;
    return {
      ...source,
      baseUrl: defaultSource.baseUrl.replace(/\/$/, ''),
      username: defaultSource.username || '',
      password: defaultSource.password || ''
    };
  }

  if (!defaultSource.playlistUrl) return null;
  return {
    ...source,
    playlistUrl: defaultSource.playlistUrl,
  };
}

export class SourceManager {
  constructor(localStore) {
    this.localStore = localStore;
  }

  bootstrap() {
    const saved = this.localStore.read('sources', null);
    const runtimeSource = createSourceFromRuntimeConfig(getRuntimeConfig().defaultSource || {});
    const isSavedDemoOnly = saved?.list?.length && saved.list.every((source) => source.type === 'demo');

    if (saved?.list?.length && !isSavedDemoOnly) {
      return saved;
    }

    const seed = {
      list: runtimeSource ? [runtimeSource] : [],
      activeSourceId: runtimeSource ? runtimeSource.id : null,
      diagnostics: null,
      cacheStamp: null,
    };

    this.localStore.write('sources', seed);
    return seed;
  }

  persist(meta) {
    this.localStore.write('sources', meta);
    return meta;
  }

  getActiveSource(meta) {
    return meta.list.find((source) => source.id === meta.activeSourceId) ?? meta.list[0];
  }

  async loadLibrary(meta, { force = false, preferences = {} } = {}) {
    const activeSource = this.getActiveSource(meta);

    if (!activeSource) {
      throw new Error('Aktif kaynak bulunamadı.');
    }

    validateBrowserSource(activeSource);

    let baseLibrary = null;

    if (!force) {
      baseLibrary = await cacheDb.get(getCatalogCacheKey(activeSource.id));
    }

    if (!baseLibrary) {
      let library;

      if (activeSource.type === 'xtream') {
        library = await loadXtreamSource(activeSource);
      } else if (activeSource.type === 'm3u') {
        library = await loadM3uSource(activeSource);
      } else {
        throw new Error('Aktif kaynak tipi desteklenmiyor. Lütfen geçerli bir M3U veya Xtream kaynağı ekleyin.');
      }

      if (activeSource.epgUrl) {
        try {
          const epg = await loadEpg(activeSource.epgUrl, activeSource);
          library.live = mergeEpg(library.live, epg);
        } catch (error) {
          logger.warn('epg merge failed', error);
        }
      }

      baseLibrary = finalizeLibrary(activeSource, library);
      await cacheDb.set(getCatalogCacheKey(activeSource.id), baseLibrary);
    }

    const visibleLibrary = applyLibraryPreferences(baseLibrary, preferences);
    visibleLibrary.diagnostics = this.runDiagnostics(visibleLibrary);

    return visibleLibrary;
  }

  addXtreamSource(meta, payload) {
    const source = {
      id: `source-${crypto.randomUUID()}`,
      type: 'xtream',
      label: payload.label || `${payload.baseUrl} • Xtream`,
      baseUrl: payload.baseUrl.replace(/\/$/, ''),
      username: payload.username,
      password: payload.password,
      epgUrl: payload.epgUrl || '',
      proxyMode: 'always',
      createdAt: new Date().toISOString(),
    };

    return this.persist({
      ...meta,
      list: [source, ...meta.list.filter((item) => item.id !== source.id)],
      activeSourceId: source.id,
    });
  }

  addM3USource(meta, payload) {
    const credentials = tryParseXtreamCredentials(payload.playlistUrl);

    if (credentials) {
      return this.addXtreamSource(meta, {
        baseUrl: credentials.baseUrl,
        username: credentials.username,
        password: credentials.password,
        epgUrl: payload.epgUrl || credentials.epgUrl || '',
        label: payload.label || `${credentials.baseUrl} • Auto Xtream`,
      });
    }

    const source = {
      id: `source-${crypto.randomUUID()}`,
      type: 'm3u',
      label: payload.label || 'Custom M3U',
      playlistUrl: payload.playlistUrl,
      epgUrl: payload.epgUrl || '',
      proxyMode: 'always',
      createdAt: new Date().toISOString(),
    };

    return this.persist({
      ...meta,
      list: [source, ...meta.list.filter((item) => item.id !== source.id)],
      activeSourceId: source.id,
    });
  }

  setActiveSource(meta, sourceId) {
    return this.persist({
      ...meta,
      activeSourceId: sourceId,
    });
  }

  updateActiveEpg(meta, epgUrl) {
    return this.persist({
      ...meta,
      list: meta.list.map((item) =>
        item.id === meta.activeSourceId ? { ...item, epgUrl } : item,
      ),
    });
  }

  async clearCache(meta) {
    await cacheDb.clear();

    return this.persist({
      ...meta,
      cacheStamp: new Date().toISOString(),
    });
  }

  async hydrateSeries(meta, library, seriesId, preferences = {}) {
    const activeSource = this.getActiveSource(meta);

    if (!activeSource || activeSource.type !== 'xtream') {
      return library;
    }

    const cachedBaseLibrary = (await cacheDb.get(getCatalogCacheKey(activeSource.id))) || library;

    const target = cachedBaseLibrary.lookup?.[seriesId] || library.lookup?.[seriesId];

    if (!target || target.kind !== 'series' || target.detailsLoaded) {
      return library;
    }

    const enriched = proxyItemMedia(
      await loadXtreamSeriesDetails(activeSource, target),
      activeSource,
    );

    const nextBaseLibrary = replaceSeriesInLibrary(cachedBaseLibrary, enriched);

    await cacheDb.set(getCatalogCacheKey(activeSource.id), nextBaseLibrary);

    const visibleLibrary = applyLibraryPreferences(nextBaseLibrary, preferences);
    visibleLibrary.diagnostics = this.runDiagnostics(visibleLibrary);

    return visibleLibrary;
  }

  search(library, query) {
    const normalized = normalizeSearchTerm(query);

    if (!normalized || normalized.length < 2) return [];

    return library.searchIndex.filter((item) => item.searchKey.includes(normalized)).slice(0, 24);
  }

  async testSource(source) {
    try {
      validateBrowserSource(source);

      await fetch(maybeProxyUrl(resolveSourceUrl(source), source), {
        method: 'HEAD',
      });

      return {
        status: 'ok',
        message: shouldUseProxy(source, resolveSourceUrl(source))
          ? 'Kaynak backend proxy üzerinden erişilebilir.'
          : 'Kaynak tarayıcı tarafından erişilebilir.',
      };
    } catch (error) {
      return {
        status: 'warn',
        message:
          error?.message ||
          'Kaynak cevap veriyor olabilir, ancak tarayıcı CORS veya codec sınırları nedeniyle doğrulayamıyor.',
      };
    }
  }

  runDiagnostics(library) {
    const total = library.movies.length + library.series.length + library.live.length;
    const missingArtwork =
      library.movies.filter((item) => !item.poster).length +
      library.series.filter((item) => !item.poster).length +
      library.live.filter((item) => !item.logo).length;
    const liveWithEpg = library.live.filter((item) => item.nowProgram).length;

    return {
      totalItems: total,
      missingArtwork,
      liveWithEpg,
      liveWithoutEpg: library.live.length - liveWithEpg,
      sourceType: library.sourceType,
    };
  }
                   }
