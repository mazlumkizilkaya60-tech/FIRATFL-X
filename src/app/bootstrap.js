// Python main.py'yi JavaScript'e çevir - basit bootstrap
import { sourceManager } from '../services/source-manager.js';

export async function initializeApp() {
  try {
    // Config'i yükle
    const config = window.FIRATFLIX_RUNTIME_CONFIG || {};

    // Provider'ları initialize et
    const providerConfig = {
      xtream: config.defaultSource ? {
        baseUrl: config.defaultSource.baseUrl,
        username: config.defaultSource.username,
        password: config.defaultSource.password
      } : null,
      tmdb: config.tmdb ? {
        apiKey: config.tmdb.apiKey
      } : null
    };

    await sourceManager.initialize(providerConfig);

    console.log('FIRATFLIX initialized successfully');
    return true;

  } catch (error) {
    console.error('Failed to initialize FIRATFLIX:', error);
    return false;
  }
}

// Sayfa yüklendiğinde initialize et
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});