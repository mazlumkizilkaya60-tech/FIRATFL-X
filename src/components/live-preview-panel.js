import { createI18n } from '../core/i18n/translations.js';
import { escapeHtml } from '../core/utils/dom.js';

export function renderLivePreviewPanel(channel, { muted = true, favorite = false, language = 'tr' } = {}) {
  const t = createI18n(language);

  if (!channel) {
    return `
      <section class="live-tv-preview">
        <div class="live-tv-preview__frame">
          <div class="empty-state">
            <span>${t('live_preview_eyebrow')}</span>
            <h3>${t('live_preview_empty_title')}</h3>
            <p>${t('live_preview_empty_description')}</p>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="live-tv-preview">
      <div class="live-tv-preview__frame">
        <div class="live-tv-preview__screen-shell">
          <div class="live-tv-preview__signal">
            <div class="live-tv-preview__eyebrow" id="live-preview-eyebrow">${escapeHtml(channel.number || '')} â€¢ ${escapeHtml(channel.category || channel.group || t('live_label'))}</div>
            <span class="live-tv-preview__badge">${t('live_preview_eyebrow')}</span>
          </div>
          <div class="live-tv-preview__screen">
            <video id="live-preview-video" class="live-tv-preview__video" playsinline muted="${muted ? 'muted' : ''}"></video>
          </div>
        </div>

        <div class="live-tv-preview__body">
          <div class="live-tv-preview__meta">
            <h2 id="live-preview-title">${escapeHtml(channel.title)}</h2>
            <p id="live-preview-description">${escapeHtml(channel.description || t('live_preview_no_info'))}</p>
          </div>

          <div class="live-tv-preview__programs">
            <div>
              <small>${t('live_preview_now')}</small>
              <strong id="live-preview-now-title">${escapeHtml(channel.nowProgram?.title || t('live_preview_epg_pending'))}</strong>
              <span id="live-preview-now-description">${escapeHtml(channel.nowProgram?.description || '')}</span>
            </div>
            <div>
              <small>${t('live_preview_next')}</small>
              <strong id="live-preview-next-title">${escapeHtml(channel.nextProgram?.title || t('live_preview_no_plan'))}</strong>
              <span id="live-preview-next-description">${escapeHtml(channel.nextProgram?.description || '')}</span>
            </div>
          </div>
        </div>

        <div class="live-tv-preview__actions">
          <button class="selector pill-btn" id="live-preview-audio" data-action="toggle-preview-audio">${muted ? t('live_preview_unmute') : t('live_preview_mute')}</button>
          <button class="selector pill-btn" id="live-preview-favorite" data-action="toggle-favorite" data-value="${escapeHtml(channel.id)}" data-kind="live">${favorite ? t('common_remove_favorite') : t('common_add_favorite')}</button>
          <a class="selector pill-btn pill-btn--primary" id="live-preview-play" href="#/player/live/${escapeHtml(channel.id)}" data-route-link>${t('common_play')}</a>
        </div>
      </div>
    </section>
  `;
}
