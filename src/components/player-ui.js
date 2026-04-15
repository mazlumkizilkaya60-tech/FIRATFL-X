import { createI18n } from '../core/i18n/translations.js';
import { escapeHtml } from '../core/utils/dom.js';
import { buildRoute } from '../router/routes.js';

export function renderPlayerUi(item, related = [], language = 'tr') {
  const t = createI18n(language);
  const itemKindLabel = item.kind === 'live' ? t('player_live') : item.kind === 'episode' ? t('player_episode') : t('player_vod');
  const drawerLabel = item.kind === 'live' ? t('player_channel_drawer') : t('player_related');
  const currentIndex = item.kind === 'episode' ? related.findIndex((entry) => entry.id === item.id) : -1;
  const previousEpisode = currentIndex > 0 ? related[currentIndex - 1] : null;
  const nextEpisode = currentIndex >= 0 && currentIndex < related.length - 1 ? related[currentIndex + 1] : null;
  const episodeRoute = (entry) =>
    buildRoute(
      'player',
      { kind: 'series', id: entry.id },
      { parentId: entry.seriesId || item.seriesId }
    );

  return `
    <section class="player-shell">
      <video id="player-video" class="player-video" playsinline></video>
      <header class="player-top" id="player-top">
        <button class="selector pill-btn" data-action="player-back">${t('player_back')}</button>
        <div class="player-top__copy">
          <span>${escapeHtml(itemKindLabel)}</span>
          <h1>${escapeHtml(item.title)}</h1>
        </div>
      </header>
      <section class="player-overlay" id="player-overlay">
        <div class="player-progress-row">
          <span class="player-time-badge" id="player-current">00:00</span>
          <div class="player-progress-wrap">
            <div class="player-progress selector" id="player-progress" tabindex="0" role="slider" aria-label="${t('player_play_pause')}">
              <span class="player-progress__sheen"></span>
              <span class="player-progress__buffer" id="player-buffer"></span>
              <span class="player-progress__bar" id="player-bar"></span>
              <span class="player-progress__thumb" id="player-thumb"></span>
            </div>
          </div>
          <span class="player-time-badge" id="player-duration">${item.kind === 'live' ? 'LIVE' : '00:00'}</span>
        </div>
        <div class="player-control-row">
          <div class="player-actions player-actions--primary">
            <div class="player-transport-cluster">
              <button class="selector player-control-btn player-control-btn--seek" data-action="player-seek" data-value="-30" aria-label="${t('player_seek_back')} 30">
                <span class="player-control-btn__glyph" aria-hidden="true">&lt;&lt;</span>
                <span class="player-control-btn__value">30</span>
              </button>
              <button class="selector player-control-btn player-control-btn--play" data-action="player-toggle-play" aria-label="${t('player_play_pause')}">
                <span class="player-control-btn__glyph player-control-btn__glyph--play" aria-hidden="true">&gt;</span>
                <span class="player-control-btn__text">${t('player_play_pause')}</span>
              </button>
              <button class="selector player-control-btn player-control-btn--seek" data-action="player-seek" data-value="30" aria-label="${t('player_seek_forward')} 30">
                <span class="player-control-btn__value">30</span>
                <span class="player-control-btn__glyph" aria-hidden="true">&gt;&gt;</span>
              </button>
            </div>
            <button class="selector player-control-btn player-control-btn--soft" data-action="player-mute">${t('player_mute')}</button>
          </div>
          <div class="player-brand-dock" aria-hidden="true">
            <img class="player-brand-dock__logo" src="./brand/firatflix-logo.svg" alt="">
          </div>
          <div class="player-actions player-actions--secondary">
            <button class="selector player-control-btn player-control-btn--ghost" data-action="player-open-audio">${t('player_audio')}</button>
            <button class="selector player-control-btn player-control-btn--ghost" data-action="player-open-drawer">${drawerLabel}</button>
            <button class="selector player-control-btn player-control-btn--ghost" data-action="player-fullscreen">${t('player_fullscreen')}</button>
          </div>
        </div>
        ${
          item.kind === 'episode'
            ? `
              <div class="player-episode-nav">
                ${
                  previousEpisode
                    ? `<a class="selector player-episode-link" href="${episodeRoute(previousEpisode)}" data-route-link>
                        <span class="player-episode-link__eyebrow">${t('player_previous_episode')}</span>
                        <strong>${escapeHtml(previousEpisode.title)}</strong>
                      </a>`
                    : `<button class="player-episode-link is-disabled" type="button" disabled>
                        <span class="player-episode-link__eyebrow">${t('player_previous_episode')}</span>
                        <strong>${t('common_unknown')}</strong>
                      </button>`
                }
                ${
                  nextEpisode
                    ? `<a class="selector player-episode-link player-episode-link--next" href="${episodeRoute(nextEpisode)}" data-route-link>
                        <span class="player-episode-link__eyebrow">${t('player_next_episode')}</span>
                        <strong>${escapeHtml(nextEpisode.title)}</strong>
                      </a>`
                    : `<button class="player-episode-link player-episode-link--next is-disabled" type="button" disabled>
                        <span class="player-episode-link__eyebrow">${t('player_next_episode')}</span>
                        <strong>${t('common_unknown')}</strong>
                      </button>`
                }
              </div>
            `
            : ''
        }
        <div class="player-status-inline">
          <strong id="player-status-label">${t('player_loading')}</strong>
          <span id="player-status-detail">${t('player_preparing')}</span>
        </div>
        <small id="player-audio-note" hidden>${t('player_audio_hint_default')}</small>
      </section>
      <aside class="player-zap" id="player-zap" hidden>
        <span>${t('player_channel_jump')}</span>
        <strong id="player-zap-value"></strong>
      </aside>
      <aside class="player-drawer" id="player-drawer" hidden>
        <div class="player-drawer__head">
          <span>${drawerLabel}</span>
          <button class="selector pill-btn" data-action="player-close-drawer">${t('common_close')}</button>
        </div>
        <div class="player-drawer__list">
          ${related
            .map(
              (entry) => `
                <a class="selector utility-item player-drawer__item ${entry.id === item.id ? 'is-active' : ''}" href="${entry.kind === 'episode' ? episodeRoute(entry) : `#/player/${entry.kind}/${escapeHtml(entry.id)}`}" data-route-link data-focus-id="player-drawer-${escapeHtml(entry.id)}">
                  ${escapeHtml(entry.number ? `${entry.number} • ${entry.title}` : entry.title)}
                </a>
              `
            )
            .join('')}
        </div>
      </aside>
      <aside class="player-modal" id="player-audio-modal" hidden>
        <div class="player-modal__card">
          <div class="player-modal__head">
            <span>${t('player_audio_tracks')}</span>
            <button class="selector pill-btn" data-action="player-close-audio">${t('common_close')}</button>
          </div>
          <div id="player-audio-note-modal" class="drawer__note">${t('player_audio_hint_default')}</div>
          <div id="player-audio-list" class="player-modal__list"></div>
        </div>
      </aside>
    </section>
  `;
}
