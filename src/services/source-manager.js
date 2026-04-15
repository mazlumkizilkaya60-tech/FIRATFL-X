// Python source_manager.py'yi JavaScript'e çevir
import { providers } from '../core/provider-engine.js';
import { chooseStream } from './stream-failover.js';

export class SourceManager {
  constructor() {
    this._cache = new Map();
  }

  async initialize(config) {
    await providers.initialize(config);
  }

  async getCategories(type = 'live') {
    const cacheKey = `categories_${type}`;

    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    const categories = [];

    // Xtream provider'dan kategorileri al
    const xtreamProvider = providers.get('xtream');
    if (xtreamProvider) {
      const xtreamCategories = await xtreamProvider.getCategories();
      categories.push(...xtreamCategories);
    }

    // TMDB provider'dan kategorileri al (film/dizi için)
    const tmdbProvider = providers.get('tmdb');
    if (tmdbProvider && type === 'movie') {
      categories.push({
        id: 'tmdb_movies',
        name: 'Popüler Filmler',
        type: 'movie'
      });
    }

    if (tmdbProvider && type === 'series') {
      categories.push({
        id: 'tmdb_series',
        name: 'Popüler Diziler',
        type: 'series'
      });
    }

    this._cache.set(cacheKey, categories);
    return categories;
  }

  async getStreams(categoryId, type = 'live') {
    const cacheKey = `streams_${categoryId}_${type}`;

    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    let streams = [];

    if (categoryId.startsWith('tmdb_')) {
      // TMDB provider'dan stream'leri al
      const tmdbProvider = providers.get('tmdb');
      if (tmdbProvider) {
        if (categoryId === 'tmdb_movies') {
          streams = await tmdbProvider.getPopularMovies();
        } else if (categoryId === 'tmdb_series') {
          streams = await tmdbProvider.getPopularSeries();
        }
      }
    } else {
      // Xtream provider'dan stream'leri al
      const xtreamProvider = providers.get('xtream');
      if (xtreamProvider) {
        streams = await xtreamProvider.getStreams(categoryId);
      }
    }

    this._cache.set(cacheKey, streams);
    return streams;
  }

  async getStreamUrl(streamId, type = 'live') {
    // Xtream için direkt URL döndür
    const xtreamProvider = providers.get('xtream');
    if (xtreamProvider) {
      return await xtreamProvider.getStreamUrl(streamId);
    }

    return null;
  }

  clearCache() {
    this._cache.clear();
  }
}

// Global source manager instance
export const sourceManager = new SourceManager();