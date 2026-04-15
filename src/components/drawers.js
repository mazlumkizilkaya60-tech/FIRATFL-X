import { createI18n } from '../core/i18n/translations.js';
import { escapeHtml } from '../core/utils/dom.js';

export function renderLeftDrawer(drawers, language = 'tr') {
  const t = createI18n(language);

  return `
    <aside class="drawer drawer--left ${drawers.left ? 'is-open' : ''}">
      <div class="drawer__head">
        <div>
          <span>${t('drawer_navigation_eyebrow')}</span>
          <h3>${t('drawer_navigation_title')}</h3>
        </div>
        <button class="selector pill-btn" data-action="toggle-left-drawer">${t('common_close')}</button>
      </div>
      <nav class="drawer__stack">
        <a class="selector utility-item" href="#/" data-route-link>${t('nav_home')}</a>
        <a class="selector utility-item" href="#/movies" data-route-link>${t('nav_movies')}</a>
        <a class="selector utility-item" href="#/series" data-route-link>${t('nav_series')}</a>
        <a class="selector utility-item" href="#/live" data-route-link>${t('nav_live')}</a>
      </nav>
    </aside>
  `;
}

function renderUtilityPanel(panel, state, sourceMeta, diagnostics, lastTest, language) {
  const t = createI18n(language);

  if (panel === 'theme') {
    return `
      <div class="drawer__panel">
        <button class="selector utility-item" data-action="set-theme" data-value="aurora">${t('drawer_theme_aurora')}</button>
        <button class="selector utility-item" data-action="set-theme" data-value="graphite">${t('drawer_theme_graphite')}</button>
      </div>
    `;
  }

  if (panel === 'language') {
    return `
      <div class="drawer__panel">
        <button class="selector utility-item" data-action="set-language" data-value="tr">${t('drawer_language_turkish')}</button>
        <button class="selector utility-item" data-action="set-language" data-value="en">${t('drawer_language_english')}</button>
      </div>
    `;
  }

  if (panel === 'm3u') {
    return `
      <form class="drawer__form" data-form="m3u">
        <input class="selector drawer__input" name="label" placeholder="${t('drawer_form_label_optional')}">
        <input class="selector drawer__input" name="playlistUrl" placeholder="${t('drawer_form_m3u_url')}" required>
        <input class="selector drawer__input" name="epgUrl" placeholder="${t('drawer_form_epg_url')}">
        <button class="selector pill-btn pill-btn--primary" type="submit">${t('drawer_form_add_m3u')}</button>
      </form>
    `;
  }

  if (panel === 'api') {
    return `
      <form class="drawer__form" data-form="xtream">
        <input class="selector drawer__input" name="label" placeholder="${t('drawer_form_label_optional')}">
        <input class="selector drawer__input" name="baseUrl" placeholder="${t('drawer_form_base_url')}" required>
        <input class="selector drawer__input" name="username" placeholder="${t('drawer_form_username')}" required>
        <input class="selector drawer__input" name="password" placeholder="${t('drawer_form_password')}" required>
        <input class="selector drawer__input" name="epgUrl" placeholder="${t('drawer_form_epg_url')}">
        <button class="selector pill-btn pill-btn--primary" type="submit">${t('drawer_form_add_api')}</button>
      </form>
    `;
  }

  if (panel === 'epg') {
    return `
      <form class="drawer__form" data-form="epg">
        <input class="selector drawer__input" name="epgUrl" placeholder="${t('drawer_form_epg_url')}" required>
        <button class="selector pill-btn pill-btn--primary" type="submit">${t('drawer_form_update_epg')}</button>
      </form>
    `;
  }

  if (panel === 'settings') {
    return `
      <div class="drawer__panel">
        <button class="selector utility-item" data-action="set-live-profile" data-value="stable">${t('drawer_settings_stable')}</button>
        <button class="selector utility-item" data-action="set-live-profile" data-value="latency">${t('drawer_settings_latency')}</button>
        <button class="selector utility-item" data-action="toggle-adult-filter">${state.preferences.hideAdultContent ? t('drawer_settings_adult_on') : t('drawer_settings_adult_off')}</button>
        <button class="selector utility-item" data-action="toggle-compact">${t('drawer_settings_compact')}</button>
      </div>
    `;
  }

  if (panel === 'health') {
    return `
      <div class="drawer__panel">
        <button class="selector pill-btn pill-btn--primary" data-action="run-health-check">${t('drawer_health_run')}</button>
        <div class="drawer__note">${escapeHtml(lastTest?.message || t('drawer_health_idle'))}</div>
      </div>
    `;
  }

  if (panel === 'cache') {
    return `
      <div class="drawer__panel">
        <button class="selector pill-btn" data-action="clear-cache">${t('common_clear_cache')}</button>
      </div>
    `;
  }

  if (panel === 'diagnostics') {
    return `
      <div class="drawer__panel drawer__facts">
        <div><small>${t('drawer_total_items')}</small><strong>${diagnostics?.totalItems ?? 0}</strong></div>
        <div><small>${t('drawer_missing_artwork')}</small><strong>${diagnostics?.missingArtwork ?? 0}</strong></div>
        <div><small>${t('drawer_live_with_epg')}</small><strong>${diagnostics?.liveWithEpg ?? 0}</strong></div>
        <div><small>${t('drawer_live_without_epg')}</small><strong>${diagnostics?.liveWithoutEpg ?? 0}</strong></div>
      </div>
    `;
  }

  return `
    <div class="drawer__panel">
      <div class="drawer__note">
        <strong>${escapeHtml(sourceMeta?.label || t('drawer_source_unselected'))}</strong><br>
        ${escapeHtml(sourceMeta?.type?.toUpperCase() || 'DEMO')} • ${escapeHtml(sourceMeta?.epgUrl || t('drawer_no_epg'))}
      </div>
      <div class="drawer__stack drawer__stack--tight">
        ${(sourceMeta?.list || [])
          .map(
            (source) => `
              <button class="selector utility-item" data-action="set-active-source" data-value="${escapeHtml(source.id)}">
                ${escapeHtml(source.label)} ${source.id === sourceMeta.activeSourceId ? `• ${t('drawer_active')}` : ''}
              </button>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

export function renderRightDrawer(state, sourceMeta, diagnostics, lastTest, language = 'tr') {
  const t = createI18n(language);

  return `
    <aside class="drawer drawer--right ${state.app.drawers.right ? 'is-open' : ''}">
      <div class="drawer__head">
        <div>
          <span>${t('drawer_utility_eyebrow')}</span>
          <h3>${t('drawer_utility_title')}</h3>
        </div>
        <button class="selector pill-btn" data-action="toggle-right-drawer">${t('common_close')}</button>
      </div>
      <div class="drawer__stack drawer__stack--grid">
        <button class="selector utility-item" data-action="toggle-search">${t('common_search')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="settings">${t('common_settings')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="theme">${t('common_theme')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="language">${t('common_language')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="health">${t('common_connection_test')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="api">${t('common_add_api')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="m3u">${t('common_add_m3u')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="epg">${t('common_add_epg')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="status">${t('common_active_source')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="cache">${t('common_clear_cache')}</button>
        <button class="selector utility-item" data-action="set-utility-panel" data-value="diagnostics">${t('common_diagnostics')}</button>
      </div>
      ${renderUtilityPanel(state.app.utilityPanel, state, sourceMeta, diagnostics, lastTest, language)}
    </aside>
  `;
}

export function renderSearchDrawer(state, language = 'tr') {
  const t = createI18n(language);
  const results = state.app.searchResults
    .map(
      (item) => `
        <a class="selector search-result" href="#/${item.kind === 'series' ? `detail/series/${item.id}` : item.kind === 'movie' ? `detail/movie/${item.id}` : `player/live/${item.id}`}" data-route-link>
          <img src="${escapeHtml(item.poster || './images/poster-fallback.svg')}" alt="${escapeHtml(item.title)}">
          <div>
            <div class="search-result__title">${escapeHtml(item.title)}</div>
            <div class="search-result__meta">${escapeHtml(item.category || item.kind)}</div>
          </div>
        </a>
      `
    )
    .join('');

  return `
    <aside class="drawer drawer--search ${state.app.drawers.search ? 'is-open' : ''}">
      <div class="drawer__head">
        <div>
          <span>${t('search_eyebrow')}</span>
          <h3>${t('search_title')}</h3>
        </div>
        <button class="selector pill-btn" data-action="toggle-search">${t('common_close')}</button>
      </div>
      <div class="drawer__panel">
        <input class="selector drawer__input" id="search-input" placeholder="${t('search_placeholder')}" value="${escapeHtml(state.app.searchQuery)}">
        <div class="search-drawer__results">
          ${results || `<div class="drawer__note">${t('search_min_chars')}</div>`}
        </div>
      </div>
    </aside>
  `;
}
