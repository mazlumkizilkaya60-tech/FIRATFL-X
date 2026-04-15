// Python app.py'yi JavaScript'e çevir - basit API wrapper
import { sourceManager } from './services/source-manager.js';

export async function getHomeData() {
  try {
    // Kategorileri al
    const categories = await sourceManager.getCategories('live');

    // İlk kategoriden stream'leri al
    let liveChannels = [];
    if (categories.length > 0) {
      liveChannels = await sourceManager.getStreams(categories[0].id, 'live');
      liveChannels = liveChannels.slice(0, 10); // İlk 10 kanal
    }

    // TMDB'den popüler içerik al
    const movies = await sourceManager.getStreams('tmdb_movies', 'movie');
    const series = await sourceManager.getStreams('tmdb_series', 'series');

    return {
      hero_items: liveChannels.slice(0, 5),
      latest_movies: movies.slice(0, 10),
      trending_movies: movies.slice(10, 20),
      popular_series: series.slice(0, 10),
      live_channels: liveChannels
    };

  } catch (error) {
    console.error('Error getting home data:', error);
    return {
      hero_items: [],
      latest_movies: [],
      trending_movies: [],
      popular_series: [],
      live_channels: []
    };
  }
}

export async function getBrowseData(type, categoryId = null) {
  try {
    if (categoryId) {
      // Kategori stream'leri
      const streams = await sourceManager.getStreams(categoryId, type);
      return {
        items: streams,
        category: categoryId
      };
    } else {
      // Kategoriler
      const categories = await sourceManager.getCategories(type);
      return {
        items: categories,
        type: type
      };
    }
  } catch (error) {
    console.error('Error getting browse data:', error);
    return {
      items: [],
      category: categoryId,
      type: type
    };
  }
}

export async function buildStreamUrl(streamId, type = 'live') {
  return await sourceManager.getStreamUrl(streamId, type);
}
