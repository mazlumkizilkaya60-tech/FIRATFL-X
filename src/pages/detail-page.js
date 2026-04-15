import { createI18n } from '../core/i18n/translations.js';
import { buildRoute } from '../router/routes.js';
import { formatDuration } from '../core/utils/format.js';

function renderFacts(item, t, language) {
  return `
    <div class="detail-stage__facts">
      <div class="detail-stage__fact"><small>${t('detail_year')}</small><strong>${item.year || '—'}</strong></div>
      <div class="detail-stage__fact"><small>${t('detail_rating')}</small><strong>${item.rating || '—'}</strong></div>
      <div class="detail-stage__fact"><small>${t('detail_category')}</small><strong>${item.category || '—'}</strong></div>
      <div class="detail-stage__fact"><small>${t('detail_duration')}</small><strong>${item.durationMinutes ? formatDuration(item.durationMinutes, language) : item.seasons ? `${item.seasons.length} ${t('detail_seasons').toLowerCase()}` : '—'}</strong></div>
    </div>
  `;
}

export function renderDetailPage({ state, item, kind, route, language = 'tr' }) {
  const t = createI18n(language);

  if (!item) {
    return `<section class="empty-state"><span>${t('detail_missing_eyebrow')}</span><h3>${t('detail_missing_title')}</h3><p>${t('detail_missing_description')}</p></section>`;
  }

  const isSeries = kind === 'series';
  const panel = route.query.panel || 'overview';
  const favorites = state.user.favorites[isSeries ? 'series' : 'movies'];
  const isFavorite = favorites.includes(item.id);
  const seasons = item.seasons ?? [];
  const currentSeason = seasons.find((season) => `season-${season.number}` === panel) || seasons[0] || null;
  const firstEpisodeId = currentSeason?.episodes?.[0]?.id || null;
  const seriesDetailsPending = isSeries && !item.detailsLoaded;
  const loadingLabel = t('player_loading');
  const loadingEpisodesDescription =
    language === 'en' ? 'Episode list is loading from the Xtream panel.' : 'Bölüm listesi Xtream panelinden yükleniyor.';

  return `
    <section class="detail-stage">
      <div class="detail-stage__frame">
        <aside class="detail-stage__sidebar">
          <div class="detail-stage__poster">
            <img src="${item.poster || './images/poster-fallback.svg'}" alt="${item.title}">
          </div>
          <div class="detail-stage__copy">
            <div class="detail-stage__eyebrow">${isSeries ? t('detail_series') : t('detail_movie')}</div>
            <h1>${item.title}</h1>
            <div class="detail-pills">
              ${(item.genres || []).map((genre) => `<span>${genre}</span>`).join('')}
            </div>
          </div>
          <div class="detail-stage__actions">
            ${
              isSeries
                ? firstEpisodeId
                  ? `<a class="selector pill-btn pill-btn--primary" href="${buildRoute('player', { kind: 'series', id: firstEpisodeId }, { parentId: item.id })}" data-route-link>${t('common_watch')}</a>`
                  : `<button class="selector pill-btn pill-btn--primary" disabled>${seriesDetailsPending ? loadingLabel : t('detail_no_episode_button')}</button>`
                : `<a class="selector pill-btn pill-btn--primary" href="${buildRoute('player', { kind: 'movie', id: item.id })}" data-route-link>${t('common_watch')}</a>`
            }
            <button class="selector pill-btn" data-action="toggle-favorite" data-value="${item.id}" data-kind="${isSeries ? 'series' : 'movies'}">${isFavorite ? t('common_remove_favorite') : t('common_add_favorite')}</button>
            ${
              isSeries
                ? `<a class="selector pill-btn" href="${buildRoute('detail', { kind: 'series', id: item.id }, { panel: 'seasons' })}" data-route-link>${t('detail_go_episodes')}</a>`
                : ''
            }
          </div>
        </aside>
        <section class="detail-stage__content">
          ${
            !isSeries || panel === 'overview'
              ? `
                <article class="detail-stage__panel is-active">
                  <div class="detail-stage__panel-head">
                    <div>
                      <div class="detail-stage__eyebrow">${t('common_overview')}</div>
                      <h2>${item.title}</h2>
                    </div>
                  </div>
                  <p class="detail-desc">${item.description || ''}</p>
                  ${renderFacts(item, t, language)}
                </article>
              `
              : ''
          }
          ${
            isSeries
              ? `
                <article class="detail-stage__panel ${panel !== 'overview' ? 'is-active' : ''}">
                  <div class="detail-stage__panel-head">
                    <div>
                      <div class="detail-stage__eyebrow">${t('detail_seasons')}</div>
                      <h2>${t('detail_episode_flow')}</h2>
                    </div>
                    <div class="detail-stage__panel-actions">
                      <a class="selector pill-btn" href="${buildRoute('detail', { kind: 'series', id: item.id }, { panel: 'overview' })}" data-route-link>${t('common_overview')}</a>
                    </div>
                  </div>
                  ${
                    seriesDetailsPending
                      ? `<div class="empty-state empty-state--inline"><span>${t('detail_series')}</span><h3>${loadingLabel}</h3><p>${loadingEpisodesDescription}</p></div>`
                      : seasons.length
                      ? `
                        <div class="season-grid">
                          ${seasons
                            .map(
                              (season) => `
                                <a class="selector season-tile ${currentSeason?.id === season.id ? 'is-active' : ''}" href="${buildRoute('detail', { kind: 'series', id: item.id }, { panel: `season-${season.number}` })}" data-route-link>
                                  <small>${t('detail_season')}</small>
                                  <strong>${season.number}</strong>
                                  <span>${season.episodes.length} ${t('detail_episode').toLowerCase()}</span>
                                </a>
                              `
                            )
                            .join('')}
                        </div>
                        ${
                          currentSeason
                            ? `
                              <div class="episode-grid">
                                ${currentSeason.episodes
                                  .map(
                                    (episode) => `
                                      <a class="selector episode-card" href="${buildRoute('player', { kind: 'series', id: episode.id }, { parentId: item.id })}" data-route-link>
                                        <div class="episode-card__kicker">${t('detail_episode')}</div>
                                        <div class="episode-card__title">${episode.title}</div>
                                        <div class="episode-card__desc">${episode.description || ''}</div>
                                      </a>
                                    `
                                  )
                                  .join('')}
                              </div>
                            `
                            : ''
                        }
                      `
                      : `<div class="empty-state empty-state--inline"><span>${t('detail_series')}</span><h3>${t('detail_no_episode_title')}</h3><p>${t('detail_no_episode_description')}</p></div>`
                  }
                </article>
              `
              : ''
          }
        </section>
      </div>
    </section>
  `;
}
