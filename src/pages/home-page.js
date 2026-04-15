import { createI18n } from '../core/i18n/translations.js';
import { renderContinueCard, renderLiveMiniCard, renderMediaCard } from '../components/cards.js';
import { buildRoute } from '../router/routes.js';

export function renderHomePage({ state, library, language = 'tr' }) {
  const t = createI18n(language);
  const heroItem = library.featured[0] || library.movies[0] || library.series[0];
  const continueWatching = state.user.continueWatching.slice(0, 6);
  const movieRail = library.movies.slice(0, 8);
  const seriesRail = library.series.slice(0, 6);
  const liveRail = library.live.slice(0, 4);

  return `
    <section class="dashboard-stack">
      <section class="hero-stage">
        <article class="hero-stage__feature">
          <div class="hero-stage__backdrop">
            <img src="${heroItem?.backdrop || heroItem?.poster || './images/poster-fallback.svg'}" alt="${heroItem?.title || 'Hero'}">
          </div>
          <div class="hero-stage__overlay"></div>
          <div class="hero-stage__content">
            <span class="hero-stage__eyebrow">${library.hero?.eyebrow || t('home_default_eyebrow')}</span>
            <h1>${library.hero?.title || t('home_default_title')}</h1>
            <p>${library.hero?.summary || ''}</p>
            <div class="hero-stage__meta">
              <span>${t('home_movies_count', { count: library.movies.length })}</span>
              <span>${t('home_series_count', { count: library.series.length })}</span>
              <span>${t('home_live_count', { count: library.live.length })}</span>
            </div>
            <div class="hero-stage__actions">
              <a class="selector pill-btn pill-btn--primary" href="${buildRoute(library.hero?.primaryAction?.route || 'live')}" data-route-link>
                ${library.hero?.primaryAction?.label || t('home_live_action')}
              </a>
              <a class="selector pill-btn" href="${buildRoute(library.hero?.secondaryAction?.route || 'movies')}" data-route-link>
                ${library.hero?.secondaryAction?.label || t('home_movies_action')}
              </a>
            </div>
          </div>
        </article>
        <aside class="hero-stage__rail">
          <div class="hero-stage__stat">
            <small>${t('home_active_source')}</small>
            <strong>${library.sourceLabel}</strong>
          </div>
          <div class="hero-stage__stat">
            <small>${t('home_live_profile')}</small>
            <strong>${state.preferences.liveProfile === 'latency' ? t('home_profile_latency') : t('home_profile_stable')}</strong>
          </div>
          <div class="hero-stage__live">
            <div class="hero-stage__live-head">
              <div>
                <small>${t('home_quick_look')}</small>
                <h3>${t('home_live_cards')}</h3>
              </div>
            </div>
            <div class="hero-stage__live-list">
              ${liveRail.map(renderLiveMiniCard).join('')}
            </div>
          </div>
        </aside>
      </section>

      ${
        continueWatching.length
          ? `
            <section class="dashboard-panel">
              <div class="section-head">
                <div>
                  <span class="section-head__eyebrow">${t('home_continue')}</span>
                  <h2>${t('home_continue_title')}</h2>
                </div>
              </div>
              <div class="poster-rail">
                ${continueWatching.map(renderContinueCard).join('')}
              </div>
            </section>
          `
          : ''
      }

      <section class="dashboard-panel">
        <div class="section-head">
          <div>
            <span class="section-head__eyebrow">${t('home_movies_eyebrow')}</span>
            <h2>${t('home_movies_title')}</h2>
          </div>
        </div>
        <div class="poster-rail">
          ${movieRail
            .map((item) =>
              renderMediaCard(item, {
                isFavorite: state.user.favorites.movies.includes(item.id),
                language
              })
            )
            .join('')}
        </div>
      </section>

      <section class="dashboard-panel">
        <div class="section-head">
          <div>
            <span class="section-head__eyebrow">${t('home_series_eyebrow')}</span>
            <h2>${t('home_series_title')}</h2>
          </div>
        </div>
        <div class="poster-rail">
          ${seriesRail
            .map((item) =>
              renderMediaCard(item, {
                isFavorite: state.user.favorites.series.includes(item.id),
                language
              })
            )
            .join('')}
        </div>
      </section>
    </section>
  `;
}
