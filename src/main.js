import { bootstrapApp } from './app/bootstrap.js';

const root = document.getElementById('app');

if (!root) {
  throw new Error('#app root bulunamadı.');
}

bootstrapApp(root).catch((error) => {
  console.error('FIRATFLIX bootstrap hatası:', error);
  root.innerHTML = `
    <div style="padding:24px;font-family:system-ui,sans-serif;">
      <h2>Uygulama başlatılamadı</h2>
      <pre style="white-space:pre-wrap;">${error?.message || error}</pre>
    </div>
  `;
});
