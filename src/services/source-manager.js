import { createKeyValueDatabase } from '../core/storage/indexed-db.js';
import { maybeProxyUrl, shouldUseProxy, isMixedContentRisk } from '../core/network/proxy.js';
import { createLogger } from '../core/utils/logger.js';
import { normalizeSearchTerm } from '../core/utils/format.js';
import { loadDemoLibrary } from './demo/demo-service.js';
import { loadM3uSource } from './m3u/m3u-service.js';
import { tryParseXtreamCredentials } from './m3u/m3u-parser.js';
import { mergeEpg, loadEpg } from './epg/epg-service.js';
import { loadXtreamSeriesDetails, loadXtreamSource } from './xtream/xtream-service.js';

const logger = createLogger('source-manager');
const cacheDb = createKeyValueDatabase('firatflix-cache');
const CATALOG_CACHE_VERSION = 'v3-parental-filter';
const ADULT_PATTERNS = [
  /\bxxx\b/i,
  /\badult\b/i,
  /\bporn(?:o)?\b/i,
  /\berotic\b/i,
  /\berotik\b/i,
  /\b(?:18\+|\+18)\b/i,
  /\byetiskin\b/i,
  /\bplayboy\b/i,
  /\bbrazzers\b/i,
  /\bhustler\b/i
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
    ...(Array.isArray(item.genres) ? item.genres : [])
  ].some((value) => matchesAdultPattern(value));
}

function filterCategories(categories = [], items = []) {
  const activeIds = new Set(items.map((item) => String(item.categoryId || item.category || 'uncategorized')));
  return categories.filter((category) => activeIds.has(String(category.id)));
}

function validateBrowserSource(source) {
  const candidate = resolveSourceUrl(source);
  if (!candidate) return;

  if (isMixedContentRisk(candidate) && !shouldUseProxy(source)) {
    throw new Error('Site HTTPS uzerinde calisiyor ama IPTV kaynagi HTTP kullaniyor. Tarayici bunu mixed content olarak engelliyor.');
  }
}

function createSearchIndex(library) {
  return [...library.movies, ...library.series, ...library.live].map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    poster: item.poster || item.logo || '',
    category: item.category || item.group || '',
    searchKey: normalizeSearchTerm([item.title, item.category, item.group, item.description].join(' '))
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
          poster: item.poster,
          backdrop: item.backdrop,
          category: item.category
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
  const merged = {
    loadedAt: new Date().toISOString(),
    sourceType: library.sourceType || source.type,
    sourceLabel: library.sourceLabel || source.label,
    hero: library.hero,
    featured: library.featured ?? [],
    categories: library.categories,
    movies: library.movies ?? [],
    series: library.series ?? [],
    live: library.live ?? [],
    diagnostics: null
  };

  merged.lookup = createLookup(merged);
  merged.searchIndex = createSearchIndex(merged);
  return merged;
}

function replaceSeriesInLibrary(library, nextSeriesItem) {
  const nextLibrary = {
    ...library,
    series: library.series.map((item) => (item.id === nextSeriesItem.id ? nextSeriesItem : item))
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
    live: filterCategories(visible.categories?.live, visible.live)
  };
  visible.lookup = createLookup(visible);
  visible.searchIndex = createSearchIndex(visible);
  visible.diagnostics = null;
  return visible;
}

function createDefaultSource() {
  return {
    id: 'source-demo',
    type: 'demo',
    label: 'FIRATFLIX Demo',
    proxyMode: 'off',
    createdAt: new Date().toISOString(),
    epgUrl: './demo/guide.xml'
  };
}

export class SourceManager {
  constructor(localStore) {
    this.localStore = localStore;
  }

  bootstrap() {
    const saved = this.localStore.read('sources', null);
    if (saved?.list?.length) {
      return saved;
    }
    const seed = {
      list: [createDefaultSource()],
      activeSourceId: 'source-demo',
      diagnostics: null,
      cacheStamp: null
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

  ensureDemoSource(meta) {
    const existingDemo = meta.list.find((source) => source.type === 'demo');
    const demoSource = existingDemo ?? createDefaultSource();
    const list = existingDemo ? meta.list : [demoSource, ...meta.list];

    return this.persist({
      ...meta,
      list,
      activeSourceId: demoSource.id
    });
  }

  async loadLibrary(meta, { force = false, preferences = {} } = {}) {
    const activeSource = this.getActiveSource(meta);
    if (!activeSource) {
      throw new Error('Aktif kaynak bulunamadi.');
    }

    validateBrowserSource(activeSource);

    let baseLibrary = null;
    if (!force) {
      baseLibrary = await cacheDb.get(getCatalogCacheKey(activeSource.id));
    }

    if (!baseLibrary) {
      let library;
      if (activeSource.type === 'demo') {
        library = await loadDemoLibrary();
      } else if (activeSource.type === 'xtream') {
        library = await loadXtreamSource(activeSource);
      } else {
        library = await loadM3uSource(activeSource);
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
      proxyMode: 'auto',
      createdAt: new Date().toISOString()
    };

    return this.persist({
      ...meta,
      list: [source, ...meta.list.filter((item) => item.id !== source.id)],
      activeSourceId: source.id
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
        label: payload.label || `${credentials.baseUrl} • Auto Xtream`
      });
    }

    const source = {
      id: `source-${crypto.randomUUID()}`,
      type: 'm3u',
      label: payload.label || 'Custom M3U',
      playlistUrl: payload.playlistUrl,
      epgUrl: payload.epgUrl || '',
      proxyMode: 'auto',
      createdAt: new Date().toISOString()
    };

    return this.persist({
      ...meta,
      list: [source, ...meta.list.filter((item) => item.id !== source.id)],
      activeSourceId: source.id
    });
  }

  setActiveSource(meta, sourceId) {
    return this.persist({
      ...meta,
      activeSourceId: sourceId
    });
  }

  updateActiveEpg(meta, epgUrl) {
    return this.persist({
      ...meta,
      list: meta.list.map((item) =>
        item.id === meta.activeSourceId
          ? {
              ...item,
              epgUrl
            }
          : item
      )
    });
  }

  async clearCache(meta) {
    await cacheDb.clear();
    return this.persist({
      ...meta,
      cacheStamp: new Date().toISOString()
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

    const enriched = await loadXtreamSeriesDetails(activeSource, target);
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
      if (source.type === 'demo') {
        return {
          status: 'ok',
          message: 'Bundled demo source hazir.'
        };
      }

      validateBrowserSource(source);

      await fetch(maybeProxyUrl(resolveSourceUrl(source), source), {
        method: 'HEAD'
      });

      return {
        status: 'ok',
        message: shouldUseProxy(source)
          ? 'Kaynak backend proxy uzerinden erisilebilir.'
          : 'Kaynak tarayici tarafindan erisilebilir.'
      };
    } catch (error) {
      return {
        status: 'warn',
        message: error?.message || 'Kaynak cevap veriyor olabilir, ancak tarayici CORS veya codec sinirlari nedeniyle dogrulayamiyor.'
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
      sourceType: library.sourceType
    };
  }
}
