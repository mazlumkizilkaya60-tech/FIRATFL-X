import { createApp } from './app.js';

const root = document.getElementById('app');

if (!root) {
  throw new Error('#app root bulunamadı.');
}

createApp(root).mount().catch((error) => {
  console.error('FIRATFLIX bootstrap failed:', error);
  root.innerHTML = `
    <section class="fatal-screen">
      <div class="fatal-card">
        <span class="eyebrow">FIRATFLIX</span>
        <h1>Uygulama başlatılamadı</h1>
        <p>Boş ekran yerine görünür hata gösteriliyor.</p>
        <pre>${String(error?.message || error)}</pre>
      </div>
    </section>
  `;
});
