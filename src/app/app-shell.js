import { qs } from '../core/utils/dom.js';
import { formatDateLabel, formatClock, humanizeError } from '../core/utils/format.js';
import { createI18n } from '../core/i18n/translations.js';
import { renderLeftDrawer, renderRightDrawer, renderSearchDrawer } from '../components/drawers.js';
import { renderHomePage } from '../pages/home-page.js';
import { renderCatalogPage } from '../pages/catalog-page.js';
import { renderLivePage } from '../pages/live-page.js';
import { renderDetailPage } from '../pages/detail-page.js';
import { renderPlayerPage } from '../pages/player-page.js';
import { LivePreviewController } from './live-preview-controller.js';
import { PlayerController } from './player-controller.js';

export class AppShell {
  constructor({ root, store, router, focus, remote, sourceManager, localStore, sessionStore }) {
    this.root = root;
    this.store = store;
    this.router = router;
    this.focus = focus;
    this.remote = remote;
    this.sourceManager = sourceManager;
    this.localStore = localStore;
    this.sessionStore = sessionStore;
    this.pageController = null;
    this.liveHoverFrame = null;
    this.channelTimer = 0;
    this.toastTimer = 0;
    this.pendingSeriesHydrations = new Set();

    this.handleClick = this.handleClick.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handlePointerFocus = this.handlePointerFocus.bind(this);
    this.handleRemote = this.handleRemote.bind(this);
    this.handleStateChange = this.handleStateChange.bind(this);
    this.renderQueued = false;
    this.rendering = false;
    this.needsAnotherRender = false;
  }

  mount() {
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('input', this.handleInput);
    this.root.addEventListener('submit', this.handleSubmit);
    this.root.addEventListener('mouseover', this.handlePointerFocus);
    this.root.addEventListener('focusin', this.handlePointerFocus);

    this.store.subscribe(this.handleStateChange);
    this.remote.subscribe(this.handleRemote);
    this.scheduleRender();
  }

  routeSignature(route) {
    return JSON.stringify({
      name: route?.name,
      params: route?.params,
      query: route?.query
    });
  }

  arraysEqual(left = [], right = []) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
  }

  hasLibraryContent(library) {
    if (!library) return false;
    return Boolean(library.movies?.length || library.series?.length || library.live?.length);
  }

  setToast(message, timeout = 4200) {
    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = 0;
    }

    this.store.update((draft) => {
      draft.app.toast = message;
    });

    if (!message) return;

    this.toastTimer = window.setTimeout(() => {
      this.store.update((draft) => {
        if (draft.app.toast === message) {
          draft.app.toast = null;
        }
      });
      this.toastTimer = 0;
    }, timeout);
  }

  handleStateChange(next, previous) {
    if (!previous) {
      this.scheduleRender();
      return;
    }

    const routeChanged = this.routeSignature(next.app.route) !== this.routeSignature(previous.app.route);
    const playerStableUpdate =
      !routeChanged &&
      next.app.route.name === 'player' &&
      previous.app.route.name === 'player' &&
      next.app.loading === previous.app.loading &&
      next.app.error === previous.app.error;

    if (playerStableUpdate) {
      return;
    }

    const liveSelectionOnly =
      !routeChanged &&
      next.app.route.name === 'live' &&
      previous.app.route.name === 'live' &&
      next.app.selectedLiveId !== previous.app.selectedLiveId &&
      next.app.filters.liveCategory === previous.app.filters.liveCategory &&
      next.app.filters.liveCollection === previous.app.filters.liveCollection &&
      this.arraysEqual(next.user.favorites.live, previous.user.favorites.live);

    if (liveSelectionOnly) {
      this.pageController?.selectChannel?.(next.app.selectedLiveId);
      return;
    }

    const clockOnly =
      !routeChanged &&
      (next.app.clock.dateLabel !== previous.app.clock.dateLabel ||
        next.app.clock.timeLabel !== previous.app.clock.timeLabel) &&
      next.app.loading === previous.app.loading &&
      next.app.error === previous.app.error;

    if (clockOnly) {
      qs('.topbar__status span', this.root)?.replaceChildren(document.createTextNode(next.app.clock.dateLabel));
      qs('.topbar__status strong', this.root)?.replaceChildren(document.createTextNode(next.app.clock.timeLabel));
      return;
    }

    this.scheduleRender();
  }

  scheduleRender() {
    if (this.rendering) {
      this.needsAnotherRender = true;
      return;
    }

    if (this.renderQueued) return;
    this.renderQueued = true;

    queueMicrotask(async () => {
      this.renderQueued = false;
      this.rendering = true;
      try {
        await this.render();
      } finally {
        this.rendering = false;
        if (this.needsAnotherRender) {
          this.needsAnotherRender = false;
          this.scheduleRender();
        }
      }
    });
  }

  async destroyPageController() {
    if (!this.pageController) return;
    await this.pageController.destroy?.();
    this.pageController = null;
  }

  resolveRouteContext(state) {
    const { route } = state.app;
    const { library } = state;

    if (route.name === 'detail') {
      const kind = route.params.kind === 'series' ? 'series' : 'movie';
      const item = library.lookup[route.params.id] || null;
      return {
        kind,
        item
      };
    }

    if (route.name === 'player') {
      const kind = route.params.kind;
      const item = library.lookup[route.params.id] || null;
      let related = [];

      if (kind === 'live') {
        related = this.getVisibleLiveChannels(state);
      } else if (kind === 'series') {
        const parent = item?.seriesId ? library.lookup[item.seriesId] : library.lookup[route.query.parentId];
        related =
          parent?.seasons?.flatMap((season) =>
            season.episodes.map((episode) => ({
              ...episode,
              kind: 'episode'
            }))
          ) ?? [];
      }

      return {
        kind,
        item,
        related
      };
    }

    return {};
  }

  renderTopbar(state) {
    const routeName = state.app.route.name;
    const t = createI18n(state.preferences.language);
    return `
      <header class="topbar">
        <div class="topbar__main">
          <button class="selector topbar__menu-btn" data-action="toggle-left-drawer">☰</button>
          <a class="brand brand--top" href="#/" data-route-link>
            <span class="brand__mark"><img src="./brand/firatflix-mark.svg" alt="FIRATFLIX"></span>
            <span class="brand__copy">
              <strong>FIRATFLIX</strong>
              <small>VISUAL ACOUSTIC STREAM</small>
            </span>
          </a>
          <div class="topbar__actions">
            <div class="topbar__status">
              <span>${state.app.clock.dateLabel}</span>
              <strong>${state.app.clock.timeLabel}</strong>
            </div>
            <button class="selector topbar__menu-btn" data-action="toggle-right-drawer">☰</button>
          </div>
        </div>
        <nav class="topbar__nav">
          <a class="selector topbar__nav-item ${routeName === 'home' ? 'is-active' : ''}" href="#/" data-route-link>${t('nav_home')}</a>
          <a class="selector topbar__nav-item ${routeName === 'movies' ? 'is-active' : ''}" href="#/movies" data-route-link>${t('nav_movies')}</a>
          <a class="selector topbar__nav-item ${routeName === 'series' ? 'is-active' : ''}" href="#/series" data-route-link>${t('nav_series')}</a>
          <a class="selector topbar__nav-item ${routeName === 'live' ? 'is-active' : ''}" href="#/live" data-route-link>${t('nav_live')}</a>
        </nav>
      </header>
    `;
  }

  resolvePreferredFocus(state, scope) {
    if (scope !== document && scope !== this.root) {
      return qs('.selector', scope);
    }

    switch (state.app.route.name) {
      case 'movies':
      case 'series':
        return qs('.category-chip.is-active', this.root) || qs('.poster-grid .selector', this.root) || qs('.page-frame .selector', this.root);
      case 'live':
        return (
          qs('.category-chip.is-active', this.root) ||
          qs('.live-tv-shell__filters .pill-btn--primary', this.root) ||
          qs('.live-tv-item.is-active', this.root) ||
          qs('.live-tv-list .selector', this.root)
        );
      case 'detail':
        return qs('.detail-stage .selector', this.root) || qs('.page-frame .selector', this.root);
      case 'home':
        return qs('.hero-stage .selector', this.root) || qs('.page-frame .selector', this.root);
      default:
        return qs('.page-frame .selector', this.root) || qs('.topbar__nav-item.is-active', this.root) || qs('.selector', this.root);
    }
  }

  async hydrateSeriesIfNeeded(routeState) {
    const activeSource = this.sourceManager.getActiveSource(routeState.sources);
    if (activeSource?.type !== 'xtream') return;

    const route = routeState.app.route;
    let seriesId = null;

    if (route.name === 'detail' && route.params.kind === 'series') {
      const seriesItem = routeState.library.lookup[route.params.id];
      if (seriesItem?.kind === 'series' && !seriesItem.detailsLoaded) {
        seriesId = seriesItem.id;
      }
    }

    if (route.name === 'player' && route.params.kind === 'series') {
      const episode = routeState.library.lookup[route.params.id];
      const parentId = route.query.parentId;
      const parent = parentId ? routeState.library.lookup[parentId] : null;

      if (!episode && parent?.kind === 'series' && !parent.detailsLoaded) {
        seriesId = parent.id;
      }
    }

    if (!seriesId || this.pendingSeriesHydrations.has(seriesId)) return;

    this.pendingSeriesHydrations.add(seriesId);

    try {
      const nextLibrary = await this.sourceManager.hydrateSeries(routeState.sources, routeState.library, seriesId, routeState.preferences);
      if (nextLibrary !== routeState.library) {
        this.store.update((draft) => {
          draft.library = nextLibrary;
        });
      }
    } catch (error) {
      console.warn(error);
    } finally {
      this.pendingSeriesHydrations.delete(seriesId);
    }
  }

  renderPage(state) {
    const route = state.app.route;
    const library = state.library;
    const context = this.resolveRouteContext(state);
    const language = state.preferences.language;

    if (state.app.loading) {
      return language === 'en'
        ? '<section class="empty-state"><span>Booting</span><h3>Preparing catalog</h3><p>Please wait a few seconds while the sources load.</p></section>'
        : '<section class="empty-state"><span>Başlatılıyor</span><h3>Katalog hazırlanıyor</h3><p>Kaynaklar yüklenirken birkaç saniye bekleyin.</p></section>';
    }

    if (state.app.error) {
      return language === 'en'
        ? `<section class="empty-state"><span>Error</span><h3>Source could not be loaded</h3><p>${state.app.error}</p></section>`
        : `<section class="empty-state"><span>Hata</span><h3>Kaynak yüklenemedi</h3><p>${state.app.error}</p></section>`;
    }

    switch (route.name) {
      case 'movies':
        return renderCatalogPage({ state, library, kind: 'movies', language });
      case 'series':
        return renderCatalogPage({ state, library, kind: 'series', language });
      case 'live':
        return renderLivePage({ state, library, language });
      case 'detail':
        return renderDetailPage({ state, item: context.item, kind: context.kind, route, language });
      case 'player':
        if (route.params.kind === 'series' && !context.item && route.query.parentId && this.pendingSeriesHydrations.has(route.query.parentId)) {
          return language === 'en'
            ? '<section class="empty-state"><span>Player</span><h3>Loading episode data</h3><p>Series detail is being requested from the Xtream source.</p></section>'
            : '<section class="empty-state"><span>Player</span><h3>Bölüm verisi yükleniyor</h3><p>Dizi detayı Xtream kaynağından isteniyor.</p></section>';
        }
        return renderPlayerPage({ item: context.item, related: context.related, language });
      default:
        return renderHomePage({ state, library, language });
    }
  }

  renderShell(state) {
    const t = createI18n(state.preferences.language);
    const diagnostics = state.library.diagnostics || state.sources.diagnostics;
    const sourceMeta = {
      list: state.sources.list,
      activeSourceId: state.sources.activeSourceId,
      label: state.library.sourceLabel || state.sources.list.find((item) => item.id === state.sources.activeSourceId)?.label,
      type: state.library.sourceType || state.sources.list.find((item) => item.id === state.sources.activeSourceId)?.type,
      epgUrl: state.sources.list.find((item) => item.id === state.sources.activeSourceId)?.epgUrl || ''
    };

    return `
      <div class="app-shell-root">
        <div class="tv-shell">
          <div class="app-frame">
            ${this.renderTopbar(state)}
            <main class="page-frame">${this.renderPage(state)}</main>
            ${renderLeftDrawer(state.app.drawers, state.preferences.language)}
            ${renderRightDrawer(state, sourceMeta, diagnostics, state.app.lastHealthCheck, state.preferences.language)}
            ${renderSearchDrawer(state, state.preferences.language)}
            ${
              state.app.overlays.channelDigitsVisible
                ? `<div class="channel-overlay"><span>${t('player_channel_jump')}</span><strong>${state.app.overlays.channelDigits}</strong></div>`
                : ''
            }
            ${state.app.toast ? `<div class="toast">${state.app.toast}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  async render() {
    const state = this.store.getState();
    void this.hydrateSeriesIfNeeded(state);
    document.documentElement.setAttribute('data-theme', state.preferences.theme);
    document.documentElement.lang = state.preferences.language;
    document.body.classList.toggle('compact-cards', state.preferences.compactCards);

    await this.destroyPageController();

    if (state.app.route.name === 'player') {
      this.root.innerHTML = this.renderPage(state);
    } else {
      this.root.innerHTML = this.renderShell(state);
    }

    await this.mountRouteController();

    const scope =
      qs('.drawer--search.is-open', this.root) ||
      qs('.drawer--right.is-open', this.root) ||
      qs('.drawer--left.is-open', this.root) ||
      document;
    const preferred = this.resolvePreferredFocus(state, scope);

    requestAnimationFrame(() => {
      this.focus.refresh(scope, preferred);
      if (state.app.drawers.search) {
        qs('#search-input', this.root)?.focus();
      }
    });
  }

  async mountRouteController() {
    const state = this.store.getState();
    const route = state.app.route;

    if (route.name === 'live') {
      const channels = this.getVisibleLiveChannels(state);
      const selected = channels.find((item) => item.id === state.app.selectedLiveId) || channels[0] || state.library.live[0] || null;
      if (!selected) return;

      this.pageController = new LivePreviewController(this.root, {
        channel: selected,
        channels,
        profile: state.preferences.liveProfile,
        language: state.preferences.language,
        muted: state.preferences.previewMuted,
        favorites: state.user.favorites.live
      });
      try {
        await this.pageController.mount();
      } catch (error) {
        console.warn(error);
      }
      return;
    }

    if (route.name === 'player') {
      const context = this.resolveRouteContext(state);
      if (!context.item) return;
      this.pageController = new PlayerController(this.root, {
        item: context.item,
        related: context.related,
        profile: state.preferences.liveProfile,
        language: state.preferences.language,
        playerState: state.player,
        remote: this.remote,
        focus: this.focus,
        onPlayerStateChange: (patch) => this.updatePlayerState(patch),
        onStart: (item) => {
          if (item.kind === 'live') {
            this.addRecentChannel(item);
          }
        },
        onProgress: (entry) => {
          this.pushContinueWatching(entry);
        }
      });
      try {
        await this.pageController.mount();
      } catch (error) {
        console.warn(error);
      }
    }
  }

  addRecentChannel(item) {
    this.store.update((draft) => {
      draft.user.recentChannels = [
        {
          id: item.id,
          title: item.title,
          number: item.number,
          logo: item.logo
        },
        ...draft.user.recentChannels.filter((channel) => channel.id !== item.id)
      ].slice(0, 12);
    });
  }

  pushContinueWatching(entry) {
    this.store.update((draft) => {
      draft.user.continueWatching = [
        entry,
        ...draft.user.continueWatching.filter((item) => item.id !== entry.id)
      ].slice(0, 24);
    });
  }

  updatePlayerState(patch = {}) {
    this.store.update((draft) => {
      draft.player = {
        ...draft.player,
        ...patch
      };
    });
  }

  handlePointerFocus(event) {
    const target = event.target.closest('[data-action="select-live-channel"]');
    if (!target) return;

    if (this.liveHoverFrame) cancelAnimationFrame(this.liveHoverFrame);
    this.liveHoverFrame = requestAnimationFrame(() => {
      const channelId = target.getAttribute('data-value');
      if (!channelId) return;
      if (this.store.getState().app.route.name === 'live' && this.pageController?.selectChannel) {
        this.pageController.selectChannel(channelId);
      }
    });
  }

  getVisibleLiveChannels(state = this.store.getState()) {
    let items = state.library.live;

    if (state.app.filters.liveCategory !== 'all') {
      const active = state.library.categories.live.find((category) => category.id === state.app.filters.liveCategory);
      if (active) {
        items = items.filter(
          (item) => String(item.categoryId || item.category) === String(active.id) || item.category === active.label
        );
      }
    }

    if (state.app.filters.liveCollection === 'favorites') {
      items = items.filter((item) => state.user.favorites.live.includes(item.id));
    }

    if (state.app.filters.liveCollection === 'recent') {
      items = items.filter((item) => state.user.recentChannels.some((channel) => channel.id === item.id));
    }

    return items;
  }

  syncSelectedLiveChannel() {
    const state = this.store.getState();
    const visibleChannels = this.getVisibleLiveChannels(state);
    if (!visibleChannels.length) return;

    if (visibleChannels.some((channel) => channel.id === state.app.selectedLiveId)) {
      return;
    }

    this.store.update((draft) => {
      draft.app.selectedLiveId = visibleChannels[0].id;
    });
  }

  queueLiveDigits(digit) {
    this.store.update((draft) => {
      draft.app.overlays.channelDigits += digit;
      draft.app.overlays.channelDigitsVisible = true;
    });

    if (this.channelTimer) window.clearTimeout(this.channelTimer);
    this.channelTimer = window.setTimeout(() => {
      const state = this.store.getState();
      const digits = state.app.overlays.channelDigits;
      const target = this.getVisibleLiveChannels(state).find((channel) => String(channel.number || '').startsWith(digits));

      this.store.update((draft) => {
        draft.app.overlays.channelDigits = '';
        draft.app.overlays.channelDigitsVisible = false;
        if (target) {
          draft.app.selectedLiveId = target.id;
        }
      });

      this.channelTimer = 0;
    }, 900);
  }

  handleClick(event) {
    const routeLink = event.target.closest('[data-route-link]');
    if (routeLink) {
      event.preventDefault();
      const href = routeLink.getAttribute('href');
      if (href) {
        window.location.hash = href.replace(/^#/, '#');
      }
      return;
    }

    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;

    event.preventDefault();
    const action = actionTarget.getAttribute('data-action');
    const value = actionTarget.getAttribute('data-value');

    if (this.pageController?.handleAction(action, value)) {
      return;
    }

    this.handleAction(action, value, actionTarget);
  }

  handleInput(event) {
    if (event.target.id !== 'search-input') return;
    const value = event.target.value;
    this.store.update((draft) => {
      draft.app.searchQuery = value;
      draft.app.searchResults = this.sourceManager.search(draft.library, value);
    });
  }

  async handleSubmit(event) {
    const form = event.target.closest('[data-form]');
    if (!form) return;

    event.preventDefault();
    const payload = Object.fromEntries(
      [...new FormData(form).entries()].map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    );
    const state = this.store.getState();

    if (form.dataset.form === 'xtream') {
      const sources = this.sourceManager.addXtreamSource(state.sources, payload);
      this.store.update((draft) => {
        draft.sources = sources;
        draft.app.drawers.right = false;
      });
      this.setToast(this.store.getState().preferences.language === 'en' ? 'Source saved. Testing browser access...' : 'Kaynak kaydedildi. Tarayıcı erişimi test ediliyor...');
      await this.reloadLibrary(true);
      return;
    }

    if (form.dataset.form === 'm3u') {
      const sources = this.sourceManager.addM3USource(state.sources, payload);
      this.store.update((draft) => {
        draft.sources = sources;
        draft.app.drawers.right = false;
      });
      this.setToast(this.store.getState().preferences.language === 'en' ? 'Playlist saved. Testing browser access...' : 'Playlist kaydedildi. Tarayıcı erişimi test ediliyor...');
      await this.reloadLibrary(true);
      return;
    }

    if (form.dataset.form === 'epg') {
      const sources = this.sourceManager.updateActiveEpg(state.sources, payload.epgUrl);
      this.store.update((draft) => {
        draft.sources = sources;
        draft.app.drawers.right = false;
      });
      await this.reloadLibrary(true);
    }
  }

  async handleAction(action, value, actionTarget) {
    const state = this.store.getState();

    if (action === 'toggle-left-drawer') {
      this.store.update((draft) => {
        draft.app.drawers.left = !draft.app.drawers.left;
        draft.app.drawers.right = false;
        draft.app.drawers.search = false;
      });
      return;
    }

    if (action === 'toggle-right-drawer') {
      this.store.update((draft) => {
        draft.app.drawers.right = !draft.app.drawers.right;
        draft.app.drawers.left = false;
        draft.app.drawers.search = false;
      });
      return;
    }

    if (action === 'toggle-search') {
      this.store.update((draft) => {
        draft.app.drawers.search = !draft.app.drawers.search;
        draft.app.drawers.left = false;
        draft.app.drawers.right = false;
      });
      return;
    }

    if (action === 'set-utility-panel') {
      this.store.update((draft) => {
        draft.app.utilityPanel = value;
        draft.app.drawers.right = true;
      });
      return;
    }

    if (action === 'set-theme') {
      this.store.update((draft) => {
        draft.preferences.theme = value;
      });
      return;
    }

    if (action === 'set-language') {
      this.store.update((draft) => {
        draft.preferences.language = value;
      });
      this.updateClock();
      this.setToast(createI18n(value)(value === 'en' ? 'toast_language_en' : 'toast_language_tr'));
      return;
    }

    if (action === 'set-live-profile') {
      this.store.update((draft) => {
        draft.preferences.liveProfile = value;
      });
      await this.reloadLibrary(true);
      return;
    }

    if (action === 'toggle-compact') {
      this.store.update((draft) => {
        draft.preferences.compactCards = !draft.preferences.compactCards;
      });
      return;
    }

    if (action === 'toggle-adult-filter') {
      const nextValue = !state.preferences.hideAdultContent;
      this.store.update((draft) => {
        draft.preferences.hideAdultContent = nextValue;
      });
      this.setToast(
        createI18n(this.store.getState().preferences.language)(
          nextValue ? 'toast_adult_filter_on' : 'toast_adult_filter_off'
        )
      );
      await this.reloadLibrary(false);
      return;
    }

    if (action === 'filter-movies-category' || action === 'filter-series-category' || action === 'filter-live-category') {
      this.store.update((draft) => {
        if (action === 'filter-movies-category') draft.app.filters.moviesCategory = value;
        if (action === 'filter-series-category') draft.app.filters.seriesCategory = value;
        if (action === 'filter-live-category') draft.app.filters.liveCategory = value;
      });
      if (action === 'filter-live-category') {
        this.syncSelectedLiveChannel();
      }
      return;
    }

    if (action === 'set-live-collection') {
      this.store.update((draft) => {
        draft.app.filters.liveCollection = value;
      });
      this.syncSelectedLiveChannel();
      return;
    }

    if (action === 'select-live-channel') {
      this.store.update((draft) => {
        draft.app.selectedLiveId = value;
      });
      return;
    }

    if (action === 'toggle-preview-audio') {
      this.store.update((draft) => {
        draft.preferences.previewMuted = !draft.preferences.previewMuted;
      });
      return;
    }

    if (action === 'toggle-favorite') {
      const kind = actionTarget?.dataset.kind;
      if (!kind) return;
      this.store.update((draft) => {
        const list = draft.user.favorites[kind] || [];
        if (list.includes(value)) {
          draft.user.favorites[kind] = list.filter((item) => item !== value);
        } else {
          draft.user.favorites[kind] = [value, ...list].slice(0, 60);
        }
      });
      return;
    }

    if (action === 'set-active-source') {
      const sources = this.sourceManager.setActiveSource(state.sources, value);
      this.store.update((draft) => {
        draft.sources = sources;
        draft.app.drawers.right = false;
      });
      await this.reloadLibrary(true);
      return;
    }

    if (action === 'run-health-check') {
      const result = await this.sourceManager.testSource(this.sourceManager.getActiveSource(state.sources));
      this.store.update((draft) => {
        draft.app.lastHealthCheck = result;
      });
      return;
    }

    if (action === 'clear-cache') {
      const sources = await this.sourceManager.clearCache(state.sources);
      this.store.update((draft) => {
        draft.sources = sources;
      });
      await this.reloadLibrary(true);
    }
  }

  handleRemote(action) {
    const state = this.store.getState();
    if (state.app.route.name === 'player') return false;

    if (/^digit:\d$/.test(action) && state.app.route.name === 'live') {
      this.queueLiveDigits(action.split(':')[1]);
      return true;
    }

    if (action === 'menu') {
      this.store.update((draft) => {
        draft.app.drawers.right = !draft.app.drawers.right;
        draft.app.drawers.left = false;
        draft.app.drawers.search = false;
      });
      return true;
    }

    if (action === 'home') {
      this.router.navigate('home');
      return true;
    }

    if (action === 'search') {
      this.store.update((draft) => {
        draft.app.drawers.search = !draft.app.drawers.search;
        draft.app.drawers.left = false;
        draft.app.drawers.right = false;
      });
      return true;
    }

    if (action === 'info') {
      this.store.update((draft) => {
        draft.app.utilityPanel = 'health';
        draft.app.drawers.right = true;
        draft.app.drawers.left = false;
        draft.app.drawers.search = false;
      });
      return true;
    }

    if (action === 'back') {
      if (state.app.drawers.search || state.app.drawers.left || state.app.drawers.right) {
        this.store.update((draft) => {
          draft.app.drawers.search = false;
          draft.app.drawers.left = false;
          draft.app.drawers.right = false;
        });
        return true;
      }

      if (state.app.route.name !== 'home') {
        window.history.back();
        return true;
      }
    }

    return false;
  }

  async reloadLibrary(force = false) {
    const beforeLoad = this.store.getState();
    const previousLibrary = beforeLoad.library;

    this.store.update((draft) => {
      draft.app.loading = true;
      draft.app.error = null;
    });

    try {
      const meta = this.store.getState().sources;
      const library = await this.sourceManager.loadLibrary(meta, {
        force,
        preferences: this.store.getState().preferences
      });
      this.store.update((draft) => {
        draft.library = {
          ...draft.library,
          ...library,
          status: 'ready'
        };
        draft.app.loading = false;
        draft.app.ready = true;
        draft.app.toast = null;
        draft.app.selectedLiveId = library.live.some((item) => item.id === draft.app.selectedLiveId)
          ? draft.app.selectedLiveId
          : library.live[0]?.id || null;
      });
    } catch (error) {
      const message = humanizeError(error, this.store.getState().preferences.language);

      if (this.hasLibraryContent(previousLibrary)) {
        this.store.update((draft) => {
          draft.app.loading = false;
          draft.app.error = null;
        });
        this.setToast(`${message} Son katalog ekranda tutuldu.`);
        return;
      }

      const currentSources = this.store.getState().sources;
      const activeSource = this.sourceManager.getActiveSource(currentSources);

      if (activeSource?.type !== 'demo') {
        try {
          const fallbackSources = this.sourceManager.ensureDemoSource(currentSources);
          const fallbackLibrary = await this.sourceManager.loadLibrary(fallbackSources, { force: false });

          this.store.update((draft) => {
            draft.sources = fallbackSources;
            draft.library = {
              ...draft.library,
              ...fallbackLibrary,
              status: 'ready'
            };
            draft.app.loading = false;
            draft.app.ready = true;
            draft.app.error = null;
            draft.app.selectedLiveId = fallbackLibrary.live[0]?.id || null;
          });
          this.setToast(`${message} Demo kaynak devreye alındı.`);
          return;
        } catch (fallbackError) {
          this.store.update((draft) => {
            draft.app.loading = false;
            draft.app.error = humanizeError(fallbackError);
            draft.app.error = humanizeError(fallbackError, this.store.getState().preferences.language);
          });
          return;
        }
      }

      this.store.update((draft) => {
        draft.app.loading = false;
        draft.app.error = message;
      });
    }
  }

  updateClock() {
    if (this.store.getState().app.route.name === 'player') {
      return;
    }
    this.store.update((draft) => {
      draft.app.clock.dateLabel = formatDateLabel(new Date(), draft.preferences.language === 'en' ? 'en-US' : 'tr-TR');
      draft.app.clock.timeLabel = formatClock(new Date(), draft.preferences.language === 'en' ? 'en-US' : 'tr-TR');
    });
  }
}
