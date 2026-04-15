import { createI18n } from '../core/i18n/translations.js';
import { escapeHtml } from '../core/utils/dom.js';
import { formatDuration } from '../core/utils/format.js';
import { buildRoute } from '../router/routes.js';

function favoriteBadge(isFavorite, language) {
  return isFavorite ? `<span class="media-card__favorite">${createI18n(language)('common_favorite')}</span>` : '';
}

export function renderMediaCard(item, options = {}) {
  const language = options.language || 'tr';
  const route = item.kind === 'series' ? buildRoute('detail', { kind: 'series', id: item.id }) : buildRoute('detail', { kind: 'movie', id: item.id });
  const meta = [item.year, item.rating ? `${item.rating} IMDb` : '', item.durationMinutes ? formatDuration(item.durationMinutes, language) : '']
    .filter(Boolean)
    .join(' • ');

  return `
    <a class="selector media-card" href="${route}" data-route-link>
      <div class="media-card__poster">
        <img src="${escapeHtml(item.poster || './images/poster-fallback.svg')}" alt="${escapeHtml(item.title)}" loading="lazy">
        ${favoriteBadge(options.isFavorite, language)}
      </div>
      <div class="media-card__meta">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(meta || item.category || '')}</span>
      </div>
    </a>
  `;
}

export function renderContinueCard(entry) {
  const target = entry.kind === 'episode'
    ? buildRoute('player', { kind: 'series', id: entry.id }, { parentId: entry.seriesId })
    : buildRoute('player', { kind: entry.kind === 'live' ? 'live' : 'movie', id: entry.id });

  return `
    <a class="selector media-card media-card--wide" href="${target}" data-route-link>
      <div class="media-card__poster media-card__poster--wide">
        <img src="${escapeHtml(entry.poster || './images/poster-fallback.svg')}" alt="${escapeHtml(entry.title)}" loading="lazy">
        <div class="media-card__progress">
          <span style="width:${Math.max(4, Math.min(100, Number(entry.progress || 0)))}%"></span>
        </div>
      </div>
      <div class="media-card__meta">
        <strong>${escapeHtml(entry.title)}</strong>
        <span>${escapeHtml(entry.subtitle || entry.seriesTitle || entry.category || '')}</span>
      </div>
    </a>
  `;
}

export function renderLiveMiniCard(channel) {
  return `
    <a class="selector live-mini-item" href="${buildRoute('player', { kind: 'live', id: channel.id })}" data-route-link>
      <div class="live-mini-item__logo">
        <img src="${escapeHtml(channel.logo || './images/channel-fallback.svg')}" alt="${escapeHtml(channel.title)}" loading="lazy">
      </div>
      <div class="live-mini-item__copy">
        <strong>${escapeHtml(channel.title)}</strong>
        <span>${escapeHtml(channel.nowProgram?.title || channel.description || '')}</span>
      </div>
    </a>
  `;
}

export function renderLiveRow(channel, options = {}) {
  const t = createI18n(options.language || 'tr');
  return `
    <button
      class="selector live-tv-item ${options.active ? 'is-active' : ''}"
      data-action="select-live-channel"
      data-value="${escapeHtml(channel.id)}"
    >
      <span class="live-tv-item__index">${escapeHtml(channel.number || '--')}</span>
      <span class="live-tv-item__logo">
        <img src="${escapeHtml(channel.logo || './images/channel-fallback.svg')}" alt="${escapeHtml(channel.title)}" loading="lazy">
      </span>
      <span class="live-tv-item__copy">
        <strong>${escapeHtml(channel.title)}</strong>
        <span>${escapeHtml(channel.nowProgram?.title || channel.description || t('live_broadcast'))}</span>
        <small>${escapeHtml(channel.nextProgram?.title || channel.category || '')}</small>
        <span class="live-tv-item__progress"><span style="width:${Math.max(0, Math.min(100, Number(channel.progress || 0)))}%"></span></span>
      </span>
      ${options.favorite ? '<span class="live-tv-item__flag">★</span>' : ''}
    </button>
  `;
}
