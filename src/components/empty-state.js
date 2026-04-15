import { escapeHtml } from '../core/utils/dom.js';

export function renderEmptyState({
  eyebrow = 'Durum',
  title = 'İçerik bulunamadı',
  description = 'Seçili filtreye uygun veri yok.'
} = {}) {
  return `
    <section class="empty-state">
      <span>${escapeHtml(eyebrow)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </section>
  `;
}
