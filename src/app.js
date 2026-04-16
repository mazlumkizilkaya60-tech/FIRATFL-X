import { api } from './api.js';
import { FocusManager } from './focus.js';
import { Player } from './player.js';
import { escapeHtml, humanError, nowClock, qs, safeArray } from './util.js';

function categoryFilter(items, key, value) {
  if (!value || value === 'all') {
    return items;
  }

  return items.filter((item) => String(item[key]) === String(value));
}

function normalizeManualSource(config = {}) {
  const type = String(config.type || 'm3u').trim().toLowerCase();

  if (type === 'xtream') {
    return {
      type,
      label: String(config.label || '').trim(),
      baseUrl: String(config.baseUrl || '').trim(),
      username: String(config.username || '').trim(),
      password: String(config.password || '').trim(),
      epgUrl: String(config.epgUrl || '').trim(),
    };
  }

  return {
    type: 'm3u',
    label: String(config.label || '').trim(),
    playlistUrl: String(config.playlistUrl || '').trim(),
    epgUrl: String(config.epgUrl || '').trim(),
  };
}

function buildSourceForm(existing = {}) {
  const type = String(existing.type || 'm3u').trim().toLowerCase();

  return `
    <form id="source-form" class="source-form">
      <div class="field-row">
        <label>
          Tür
          <select class="selector" name="type">
            <option value="xtream" ${type === 'xtream' ? 'selected' : ''}>Xtream</option>
            <option value="m3u" ${type === 'm3u' ? 'selected' : ''}>M3U</option>
          </select>
        </label>

        <label>
          Etiket
          <input class="selector" name="label" value="${escapeHtml(existing.label || '')}" placeholder="Örn: Ev Sunucusu">
        </label>
      </div>

      <div class="field-row m3u-only">
        <label>
          M3U URL
          <input class="selector" name="playlistUrl" value="${escapeHtml(existing.playlistUrl || '')}" placeholder="https://example.com/list.m3u">
        </label>

        <label>
          EPG URL
          <input class="selector" name="epgUrl" value="${escapeHtml(existing.epgUrl || '')}" placeholder="https://example.com/epg.xml">
        </label>
      </div>

      <div class="field-row xtream-only">
        <label>
          Base URL
          <input class="selector" name="baseUrl" value="${escapeHtml(existing.baseUrl || '')}" placeholder="https://panel.example.com:port">
        </label>

        <label>
          Kullanıcı
          <input class="selector" name="username" value="${escapeHtml(existing.username || '')}" placeholder="username">
        </label>

        <label>
          Şifre
          <input class="selector" name="password" value="${escapeHtml(existing.password || '')}" placeholder="password" type="password">
        </label>
      </div>

      <div class="cta-row">
        <button class="btn selector" type="submit">Kaynağı Yükle</button>
        <button class="btn secondary selector" type="button" data-action="reset-default-source">Varsayılan Kaynağa Dön</button>
      </div>
    </form>
  `;
}

function buildImage(url, alt, isLogo = false) {
  if (!url) {
    return `<div class="media-thumb ${isLogo ? 'logo' : ''}"></div>`;
  }

  return `
    <div class="media-thumb ${isLogo ? 'logo' : ''}">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy">
    </div>
  `;
}

function buildMediaCard(kind, item) {
  const image = kind === 'live'
    ? buildImage(item.logo || item.poster || item.backdrop, item.title, true)
    : buildImage(item.poster || item.backdrop, item.title);

  return `
    <article class="media-card selector" data-action="open-item" data-kind="${escapeHtml(kind)}" data-id="${escapeHtml(item.id)}">
      ${image}
      <div class="media-copy">
        <span>${escapeHtml(item.category || item.description || 'İçerik')}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(kind === 'live' ? item.number || 'TV' : item.year || item.rating || '-')}</small>
      </div>
    </article>
  `;
}

function buildCategoryChips(kind, categories, activeCategory) {
  return `
    <div class="chips">
      ${categories
        .map(
          (category) => `
            <button
              class="chip selector ${String(activeCategory) === String(category.id) ? 'is-active' : ''}"
              data-action="set-filter"
              data-kind="${escapeHtml(kind)}"
              data-value="${escapeHtml(category.id)}"
            >
              ${escapeHtml(category.label)}
            </button>
          `,
        )
        .join('')}
    </div>
  `;
}

function flattenSeriesEpisodes(detailCache) {
  return Array.from(detailCache.values()).flatMap((detail) =>
    safeArray(detail.seasons).flatMap((season) => safeArray(season.episodes)),
  );
}

export function createApp(root) {
  return {
    root,
    focus: new FocusManager(root),
    player: null,
    state: {
      route: { name: 'home', params: {} },
      runtime: api.runtime(),
      library: null,
      error: null,
      loading: true,
      activeSource: { mode: 'default', config: null },
      filters: { live: 'all', movies: 'all', series: 'all' },
      detailCache: new Map(),
      health: null,
    },

    async mount() {
      this.restoreSource();
      window.addEventListener('hashchange', () => this.handleRouteChange());
      window.addEventListener('keydown', (event) => this.handleGlobalKey(event));
      this.renderShell();
      this.tickClock();
      window.setInterval(() => this.tickClock(), 60000);
      await this.bootstrapSource();
      this.handleRouteChange();
    },

    tickClock() {
      const clock = nowClock('tr-TR');
      const dateNode = qs('#clock-date', this.root);
      const timeNode = qs('#clock-time', this.root);
      if (dateNode) dateNode.textContent = clock.date;
      if (timeNode) timeNode.textContent = clock.time;
    },

    restoreSource() {
      try {
        const raw = localStorage.getItem('firatflix.manualSource');
        if (!raw) return;

        this.state.activeSource = {
          mode: 'manual',
          config: normalizeManualSource(JSON.parse(raw)),
        };
      } catch {}
    },

    persistSource() {
      try {
        if (this.state.activeSource.mode === 'manual') {
          localStorage.setItem(
            'firatflix.manualSource',
            JSON.stringify(normalizeManualSource(this.state.activeSource.config)),
          );
          return;
        }

        localStorage.removeItem('firatflix.manualSource');
      } catch {}
    },

    async bootstrapSource() {
      this.state.loading = true;
      this.state.error = null;
      this.renderBody();

      try {
        const library =
          this.state.activeSource.mode === 'manual'
            ? await api.loadManualLibrary(this.state.activeSource.config)
            : await api.loadDefaultLibrary();

        this.state.library = library;
        this.state.loading = false;
        this.state.error = null;
        this.state.health = {
          status: 'ok',
          message: 'Kaynak başarıyla yüklendi.',
        };
      } catch (error) {
        this.state.loading = false;
        this.state.library = null;
        this.state.error = humanError(error?.message, 'Kaynak yüklenemedi.');
        this.state.health = {
          status: 'error',
          message: this.state.error,
        };
      }

      this.renderBody();
    },

    handleRouteChange() {
      const hash = String(window.location.hash || '#/home').replace(/^#/, '');
      const parts = hash.split('/').filter(Boolean);
      const [name = 'home', id = ''] = parts;
      this.state.route = { name, params: { id } };
      this.renderBody();
    },

    goBack() {
      if (window.location.hash.startsWith('#/player/')) {
        window.location.hash = '#/live';
        return;
      }

      if (this.state.route.name !== 'home') {
        window.history.back();
      }
    },

    handleGlobalKey(event) {
      if (this.player) {
        return;
      }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        this.focus.move(event.key.replace('Arrow', '').toLowerCase());
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        this.focus.click();
        return;
      }

      if ((event.key === 'Escape' || event.key === 'Backspace') && this.state.route.name !== 'home') {
        event.preventDefault();
        window.location.hash = '#/home';
      }
    },

    renderShell() {
      this.root.innerHTML = `
        <div class="app-shell">
          <aside class="sidebar">
            <a class="brand selector" href="#/home" data-preferred-focus="true">
              <img src="/brand/logo.svg" alt="FIRATFLIX">
            </a>

            <nav class="nav-list">
              <a class="nav-item selector" href="#/home">Ana Sayfa</a>
              <a class="nav-item selector" href="#/live">Canlı TV</a>
              <a class="nav-item selector" href="#/movies">Filmler</a>
              <a class="nav-item selector" href="#/series">Diziler</a>
            </nav>

            <div class="sidebar-footer">
              <span id="clock-date">--</span>
              <strong id="clock-time">--:--</strong>
              <small>${escapeHtml(this.state.runtime.proxyMode || 'always')} proxy</small>
            </div>
          </aside>

          <main id="app-main" class="app-main"></main>
        </div>
      `;

      this.renderBody();
    },

    setActiveNav() {
      const active = this.state.route.name;
      this.root.querySelectorAll('.nav-item').forEach((node) => {
        const href = node.getAttribute('href') || '';
        node.classList.toggle('is-active', href === `#/${active}` || (active === 'home' && href === '#/home'));
      });
    },

    showPaneError(title, detail) {
      return `
        <section class="error-pane">
          <span class="eyebrow">Hata</span>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(detail)}</p>
          <div class="error-actions">
            <button class="btn selector" data-action="retry-bootstrap">Tekrar Yükle</button>
            <button class="btn secondary selector" data-action="open-source-panel">Kaynak Ayarları</button>
          </div>
        </section>
      `;
    },

    routeHome() {
      const counts = this.state.library?.counts || { live: 0, movies: 0, series: 0 };
      const meta = this.state.library?.meta || {};
      const hero = this.state.library?.hero || {};

      return `
        <section class="page-section">
          <article class="hero-card">
            <span class="eyebrow">FIRATFLIX</span>
            <h1>${escapeHtml(hero.title || 'FIRATFLIX')}</h1>
            <p>${escapeHtml(hero.summary || 'Demo kapalı. Varsayılan kaynak veya manuel kaynak bekleniyor.')}</p>

            <div class="chips">
              <span class="chip">Canlı ${escapeHtml(counts.live)}</span>
              <span class="chip">Film ${escapeHtml(counts.movies)}</span>
              <span class="chip">Dizi ${escapeHtml(counts.series)}</span>
              <span class="chip">Kaynak ${escapeHtml(meta.type || 'yok')}</span>
            </div>

            <div class="cta-row" style="margin-top: 16px;">
              <button class="btn selector" data-action="go-live">Canlı TV Aç</button>
              <button class="btn secondary selector" data-action="open-source-panel">Kaynak Ayarları</button>
            </div>
          </article>

          <div class="panel-grid two-col">
            <article class="panel-card">
              <span class="eyebrow">Aktif kaynak</span>
              <h3>${escapeHtml(meta.label || 'Tanımsız')}</h3>
              <p>Tür: ${escapeHtml(meta.type || '-')}</p>
              <p>Varsayılan sunucu kaynağı: ${meta.hasDefaultServerCredentials ? 'evet' : 'hayır'}</p>
            </article>

            <article class="panel-card">
              <span class="eyebrow">Render / proxy durumu</span>
              <h3>${escapeHtml(this.state.runtime.proxyMode || 'always')}</h3>
              <p>Görseller proxy: ${this.state.runtime.forceProxyImages ? 'açık' : 'kapalı'}</p>
              <p>Stream proxy: ${this.state.runtime.forceProxyStreams ? 'açık' : 'kapalı'}</p>
            </article>
          </div>

          <article class="panel-card">
            <span class="eyebrow">Kaynak Ayarları</span>
            ${buildSourceForm(this.state.activeSource.mode === 'manual' ? this.state.activeSource.config : {})}
            <p class="muted">Varsayılan kaynak yapılandırıldıysa uygulama otomatik onu açar. Demo asla kullanılmaz.</p>
          </article>
        </section>
      `;
    },

    routeCatalog(kind) {
      const library = this.state.library || { categories: {}, [kind]: [] };
      const categoryId = this.state.filters[kind] || 'all';
      const categories = library.categories?.[kind] || [{ id: 'all', label: 'Tümü' }];
      const items = categoryFilter(library[kind] || [], 'categoryId', categoryId);

      if (!items.length) {
        return `
          <section class="page-section">
            ${buildCategoryChips(kind, categories, categoryId)}
            ${this.showPaneError('İçerik bulunamadı', 'Bu kategoride içerik yok veya kaynak cevap vermedi.')}
          </section>
        `;
      }

      return `
        <section class="page-section">
          <div class="page-header-row">
            <div>
              <span class="eyebrow">${kind === 'live' ? 'Canlı TV' : kind === 'movies' ? 'Filmler' : 'Diziler'}</span>
              <h2>${items.length} içerik</h2>
            </div>
            <button class="btn secondary selector" data-action="open-source-panel">Kaynak Ayarları</button>
          </div>

          ${buildCategoryChips(kind, categories, categoryId)}

          <div class="card-grid ${kind === 'live' ? 'live-grid' : ''}">
            ${items.map((item) => buildMediaCard(kind, item)).join('')}
          </div>
        </section>
      `;
    },

    async routeDetail() {
      const id = this.state.route.params.id;
      const collection =
        this.state.library?.movies?.find((item) => item.id === id) ||
        this.state.library?.series?.find((item) => item.id === id) ||
        this.state.library?.live?.find((item) => item.id === id);

      if (!collection) {
        return this.showPaneError('İçerik bulunamadı', 'Katalogda bu öğe yer almıyor.');
      }

      if (collection.kind === 'series' && !collection.detailsLoaded && !this.state.detailCache.has(collection.id)) {
        try {
          const detail =
            this.state.activeSource.mode === 'default'
              ? await api.loadDefaultSeriesInfo(collection.streamId)
              : await api.loadManualSeriesInfo(this.state.activeSource.config, collection.streamId);

          this.state.detailCache.set(collection.id, detail);
        } catch (error) {
          return this.showPaneError('Dizi detayları yüklenemedi', humanError(error?.message));
        }
      }

      const detail = this.state.detailCache.get(collection.id) || collection;
      const episodes = safeArray(detail.seasons).flatMap((season) => safeArray(season.episodes));

      return `
        <section class="detail-layout">
          <article class="hero-card detail-hero">
            <div class="detail-poster">
              ${buildImage(detail.poster || detail.backdrop, detail.title)}
            </div>

            <div class="detail-copy">
              <span class="eyebrow">${escapeHtml(detail.kind || 'detay')}</span>
              <h1>${escapeHtml(detail.title)}</h1>
              <p>${escapeHtml(detail.description || 'Açıklama yok.')}</p>
              <div class="chips">
                <span class="chip">${escapeHtml(detail.category || 'Kategori yok')}</span>
                <span class="chip">${escapeHtml(detail.rating || detail.year || 'Bilgi yok')}</span>
              </div>

              <div class="cta-row" style="margin-top: 16px;">
                <button class="btn selector" data-action="play-item" data-id="${escapeHtml(detail.id)}">Oynat</button>
                <button class="btn secondary selector" data-action="go-live">Canlı TV</button>
              </div>
            </div>
          </article>

          ${
            detail.kind === 'series'
              ? `
                <article class="panel-card">
                  <span class="eyebrow">Bölümler</span>
                  <div class="episode-list">
                    ${
                      episodes.length
                        ? episodes
                            .map(
                              (episode) => `
                                <button
                                  class="episode-btn selector"
                                  data-action="play-episode"
                                  data-series-id="${escapeHtml(detail.id)}"
                                  data-id="${escapeHtml(episode.id)}"
                                >
                                  ${escapeHtml(episode.title)}
                                </button>
                              `,
                            )
                            .join('')
                        : '<div class="muted">Bölüm verisi yok.</div>'
                    }
                  </div>
                </article>
              `
              : ''
          }
        </section>
      `;
    },

    openPlayer(item, related = []) {
      this.state.route = { name: 'player', params: { id: item.id } };
      window.location.hash = `#/player/${item.id}`;
      this.renderBody(item, related);
    },

    attachEvents() {
      this.root.onclick = async (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        if (action === 'retry-bootstrap') {
          await this.bootstrapSource();
          return;
        }

        if (action === 'open-source-panel') {
          window.location.hash = '#/home';
          return;
        }

        if (action === 'reset-default-source') {
          this.state.activeSource = { mode: 'default', config: null };
          this.persistSource();
          await this.bootstrapSource();
          return;
        }

        if (action === 'set-filter') {
          this.state.filters[target.dataset.kind] = target.dataset.value;
          this.renderBody();
          return;
        }

        if (action === 'go-live') {
          window.location.hash = '#/live';
          return;
        }

        if (action === 'open-item') {
          const kind = target.dataset.kind;
          const id = target.dataset.id;
          const item = this.state.library?.[kind]?.find((entry) => entry.id === id);

          if (!item) return;

          if (kind === 'live' || item.kind === 'movie') {
            this.openPlayer(item, kind === 'live' ? this.state.library.live : []);
            return;
          }

          window.location.hash = `#/detail/${id}`;
          return;
        }

        if (action === 'play-item') {
          const id = target.dataset.id;
          const movie = this.state.library.movies?.find((entry) => entry.id === id);
          const series = this.state.detailCache.get(id);

          if (movie) {
            this.openPlayer(movie, []);
            return;
          }

          const firstEpisode = safeArray(series?.seasons).flatMap((season) => safeArray(season.episodes))[0];
          if (firstEpisode) {
            this.openPlayer(firstEpisode, safeArray(series?.seasons).flatMap((season) => safeArray(season.episodes)));
          }
          return;
        }

        if (action === 'play-episode') {
          const seriesId = target.dataset.seriesId;
          const episodeId = target.dataset.id;
          const series = this.state.detailCache.get(seriesId);
          const allEpisodes = safeArray(series?.seasons).flatMap((season) => safeArray(season.episodes));
          const episode = allEpisodes.find((entry) => entry.id === episodeId);

          if (episode) {
            this.openPlayer(episode, allEpisodes);
          }
        }
      };

      const sourceForm = qs('#source-form', this.root);
      if (!sourceForm) return;

      const syncVisibility = () => {
        const type = sourceForm.type.value;
        this.root.querySelectorAll('.m3u-only').forEach((node) => {
          node.style.display = type === 'm3u' ? 'flex' : 'none';
        });
        this.root.querySelectorAll('.xtream-only').forEach((node) => {
          node.style.display = type === 'xtream' ? 'flex' : 'none';
        });
      };

      sourceForm.type.addEventListener('change', syncVisibility);
      syncVisibility();

      sourceForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(sourceForm);
        const config = normalizeManualSource(Object.fromEntries(formData.entries()));
        this.state.activeSource = { mode: 'manual', config };
        this.persistSource();
        await this.bootstrapSource();
        window.location.hash = '#/home';
      });
    },

    async renderBody(forcePlayerItem = null, forceRelated = null) {
      this.setActiveNav();

      const main = qs('#app-main', this.root);
      if (!main) return;

      if (this.player) {
        this.player.destroy();
        this.player = null;
      }

      if (this.state.loading) {
        main.innerHTML = `
          <section class="loading-pane">
            <div class="spinner"></div>
            <h2>Kaynak yükleniyor</h2>
            <p>Demo açılmayacak. Varsayılan veya seçilen IPTV kaynağı bekleniyor.</p>
          </section>
        `;
        this.focus.refresh(main);
        return;
      }

      if (this.state.error) {
        main.innerHTML = this.showPaneError('Kaynak yüklenemedi', this.state.error);
        this.attachEvents();
        this.focus.refresh(main);
        return;
      }

      try {
        const route = this.state.route.name;

        if (route === 'home') {
          main.innerHTML = this.routeHome();
        } else if (route === 'live') {
          main.innerHTML = this.routeCatalog('live');
        } else if (route === 'movies') {
          main.innerHTML = this.routeCatalog('movies');
        } else if (route === 'series') {
          main.innerHTML = this.routeCatalog('series');
        } else if (route === 'detail') {
          main.innerHTML = await this.routeDetail();
        } else if (route === 'player') {
          const item =
            forcePlayerItem ||
            this.state.library.live?.find((entry) => entry.id === this.state.route.params.id) ||
            this.state.library.movies?.find((entry) => entry.id === this.state.route.params.id) ||
            flattenSeriesEpisodes(this.state.detailCache).find(
              (entry) => entry.id === this.state.route.params.id,
            );

          if (!item) {
            main.innerHTML = this.showPaneError(
              'Oynatıcıya geçilemedi',
              'Bu içerik artık katalogda görünmüyor veya bölüm verisi eksik.',
            );
          } else {
            const related = forceRelated || (item.kind === 'live' ? this.state.library.live : []);
            this.player = new Player({ app: this, mount: main, item, related });
            this.player.render();
          }
        } else {
          main.innerHTML = this.routeHome();
        }
      } catch (error) {
        console.error('Render error:', error);
        main.innerHTML = this.showPaneError(
          'Sayfa render edilemedi',
          humanError(error?.message, 'Beklenmeyen hata.'),
        );
      }

      this.attachEvents();

      if (!this.player) {
        this.focus.refresh(main);
      }
    },
  };
}
