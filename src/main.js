// Ana uygulama giriş noktası
import './app/bootstrap.js';
import { Router } from './router.js';

// Uygulama başlatma
async function startApp() {
  try {
    // Router'ı başlat
    const router = new Router();
    router.init();

    console.log('FIRATFLIX started successfully');
  } catch (error) {
    console.error('Failed to start FIRATFLIX:', error);
  }
}

// Sayfa hazır olduğunda başlat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}