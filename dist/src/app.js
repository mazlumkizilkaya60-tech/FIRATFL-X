import { api } from './api.js';
import { FocusManager } from './focus.js';
import { Player } from './player.js';
import { debounce, escapeHtml, humanError, nowClock, qs } from './util.js';

function categoryFilter(items, key, value) {
  if (!value || value === 'all') return items;
  return items.filter((item) => String(item[key]) === String(value));
}

function buildSourceForm(existing = {}) {
  return `
    <form class="source-form" id="source-form">
      <div class="field-row">
        <label>Tür
          <select name="type" class="selector">
            <option value="xtream" ${existing.type === 'xtream' ? 'selected' : ''}>Xtream</option>
            <option value="m3u" ${existing.type === 'm3u' ? 'selected' : ''}>M3U</option>
          </select>
        </label>
        <label>Etiket
          <input class="selector" name="label" value="${escapeHtml(existing.label || '')}" placeholder="Örn. Ana kaynak" />
        </label>
      </div>
      <div class="field-row m3u-only">
        <label>M3U URL
          <input class="selector" name="playlistUrl" value="${escapeHtml(existing.playlistUrl || '')}" placeholder="https://.../playlist.m3u" />
        </label>
        <label>EPG URL
          <input class="selector" name="epgUrl" value="${escapeHtml(existing.epgUrl || '')}" placeholder="https://.../epg.xml" />
        </label>
      </div>
      <div class="field-row xtream-only">
        <label>Base URL
          <input class="selector" name="baseUrl" value="${escapeHtml(existing.baseUrl || '')}" placeholder="https://panel.example.com:port" />
        </label>
        <label>Kullanıcı
          <input class="selector" name="username" value="${escapeHtml(existing.username || '')}" />
        </label>
        <label>Şifre
          <input class="selector" name="password" value="${escapeHtml(existing.password || '')}" />
        </label>
      </div>
      <div class="field-row">
        <button class="selector btn" type="submit">Kaynağı Yükle</button>
        <button class="selector btn secondary" type="button" data-action="reset-default-source">Varsayılan Kaynağa Dön</button>
      </div>
    </form>
  `;
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
      detailCache: new Map()
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
        if (raw) {
          this.state.activeSource = { mode: 'manual', config: JSON.parse(raw) };
        }
      } catch {}
    },

    persistSource() {
      try {
        if (this.state.activeSource.mode === 'manual') {
          localStorage.setItem('firatflix.manualSource', JSON.stringify(this.state.activeSource.config));
        } else {
          localStorage.removeItem('firatflix.manualSource');
        }
      } catch {}
    },

    async bootstrapSource() {
      this.state.loading = true;
      this.state.error = null;
      this.renderBody();
      try {
        const library = this.state.activeSource.mode === 'manual'
          ? await api.loadManualLibrary(this.state.activeSource.config)
          : await api.loadDefaultLibrary();
        this.state.library = library;
        this.state.loading = false;
        this.state.error = null;
        this.renderBody();
      } catch (error) {
        this.state.loading = false;
        this.state.library = null;
        this.state.error = humanError(error?.message, 'Kaynak yüklenemedi.');
        this.renderBody();
      }
    },

    handleRouteChange() {
      const hash = String(window.location.hash || '#/').replace(/^#/, '');
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
      window.history.back();
    },

    handleGlobalKey(event) {
      if (this.player) return;
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
            <a class="brand selector" href="#/home">
              <img src="./brand/firatflix-logo.svg" alt="FIRATFLIX" />
            </a>
            <nav class="nav-list">
              <a class="selector nav-item" href="#/home">Ana Sayfa</a>
              <a class="selector nav-item" href="#/live">Canlı TV</a>
              <a class="selector nav-item" href="#/movies">Filmler</a>
              <a class="selector nav-item" href="#/series">Diziler</a>
            </nav>
            <div class="sidebar-footer">
              <span id="clock-date"></span>
              <strong id="clock-time"></strong>
            </div>
          </aside>
          <main class="app-main" id="app-main"></main>
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
            <button class="selector btn" data-action="retry-bootstrap">Tekrar Yükle</button>
            <button class="selector btn secondary" data-action="open-source-panel">Kaynak Ayarları</button>
          </div>
        </section>
      `;
    },

    routeHome() {
      const counts = this.state.library?.counts || { live: 0, movies: 0, series: 0 };
      const meta = this.state.library?.meta || {};
      return `
        <section class="hero-card">
          <span class="eyebrow">FIRATFLIX</span>
          <h1>${escapeHtml(this.state.library?.hero?.title || 'FIRATFLIX')}</h1>
          <p>${escapeHtml(this.state.library?.hero?.summary || 'Demo kapalı. Varsayılan kaynak veya manuel kaynak bekleniyor.')}</p>
          <div class="chips">
            <span class="chip">Canlı ${counts.live}</span>
            <span class="chip">Film ${counts.movies}</span>
            <span class="chip">Dizi ${counts.series}</span>
            <span class="chip">Kaynak ${escapeHtml(meta.type || 'yok')}</span>
          </div>
          <div class="cta-row">
            <a class="selector btn" href="#/live">Canlı TV Aç</a>
            <button class="selector btn secondary" data-action="open-source-panel">Kaynak Ayarları</button>
          </div>
        </section>
        <section class="panel-grid two-col">
          <article class="panel-card">
            <h3>Aktif kaynak</h3>
            <p><strong>${escapeHtml(meta.label || 'Tanımsız')}</strong></p>
            <p>Tür: ${escapeHtml(meta.type || '-')}</p>
            <p>Varsayılan sunucu kaynağı: ${meta.hasDefaultServerCredentials ? 'evet' : 'hayır'}</p>
          </article>
          <article class="panel-card">
            <h3>Render / proxy durumu</h3>
            <p>Proxy modu: ${escapeHtml(this.state.runtime.proxyMode || 'always')}</p>
            <p>Görseller proxy: ${this.state.runtime.forceProxyImages ? 'açık' : 'kapalı'}</p>
            <p>Stream proxy: ${this.state.runtime.forceProxyStreams ? 'açık' : 'kapalı'}</p>
          </article>
        </section>
        <section class="panel-card">
          <h3>Kaynak Ayarları</h3>
          ${buildSourceForm(this.state.activeSource.mode === 'manual' ? this.state.activeSource.config : {})}
          <p class="muted">Varsayılan kaynak yapılandırıldıysa uygulama otomatik onu açar. Demo asla kullanılmaz.</p>
        </section>
      `;
    },

    routeCatalog(kind) {
      const library = this.state.library || { categories: {}, [kind]: [] };
      const categoryId = this.state.filters[kind] || 'all';
      const items = categoryFilter(library[kind] || [], 'categoryId', categoryId);
      const categories = library.categories?.[kind] || [{ id: 'all', label: 'Tümü' }];
      if (!items.length) {
        return `
          <section class="page-section">
            <div class="chips">${categories.map((category) => `<button class="selector chip ${category.id === categoryId ? 'is-active' : ''}" data-action="set-filter" data-kind="${kind}" data-value="${category.id}">${escapeHtml(category.label)}</button>`).join('')}</div>
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
            <button class="selector btn secondary" data-action="open-source-panel">Kaynak Ayarları</button>
          </div>
          <div class="chips">${categories.map((category) => `<button class="selector chip ${category.id === categoryId ? 'is-active' : ''}" data-action="set-filter" data-kind="${kind}" data-value="${category.id}">${escapeHtml(category.label)}</button>`).join('')}</div>
          <div class="card-grid ${kind === 'live' ? 'live-grid' : ''}">
            ${items.map((item) => `
              <article class="media-card selector" tabindex="0" data-action="open-item" data-kind="${kind}" data-id="${item.id}">
                <div class="media-thumb ${kind === 'live' ? 'logo' : ''}"><img src="${escapeHtml(item.logo || item.poster || './brand/poster-placeholder.svg')}" alt="" loading="lazy"></div>
                <div class="media-copy">
                  <span>${escapeHtml(item.category || item.description || '')}</span>
                  <strong>${escapeHtml(item.title)}</strong>
                  ${kind === 'live' ? `<small>${escapeHtml(item.number || '')}</small>` : `<small>${escapeHtml(item.year || item.rating || '')}</small>`}
                </div>
              </article>
            `).join('')}
          </div>
        </section>
      `;
    },

    async routeDetail() {
      const id = this.state.route.params.id;
      const collection = this.state.library?.movies?.find((item) => item.id === id)
        || this.state.library?.series?.find((item) => item.id === id)
        || this.state.library?.live?.find((item) => item.id === id);
      if (!collection) {
        return this.showPaneError('İçerik bulunamadı', 'Katalogda bu öğe yer almıyor.');
      }
      if (collection.kind === 'series' && !collection.detailsLoaded) {
        try {
          const detail = this.state.activeSource.mode === 'default'
            ? await api.loadDefaultSeriesInfo(collection.streamId)
            : await api.loadManualSeriesInfo(this.state.activeSource.config, collection.streamId);
          this.state.detailCache.set(collection.id, detail);
        } catch (error) {
          return this.showPaneError('Dizi detayları yüklenemedi', humanError(error?.message));
        }
      }
      const detail = this.state.detailCache.get(collection.id) || collection;
      const episodes = detail.seasons?.flatMap((season) => season.episodes || []) || [];
      return `
        <section class="detail-layout">
          <div class="detail-hero">
            <img class="detail-poster" src="${escapeHtml(detail.poster || './brand/poster-placeholder.svg')}" alt="" />
            <div class="detail-copy">
              <span class="eyebrow">${escapeHtml(detail.kind)}</span>
              <h1>${escapeHtml(detail.title)}</h1>
              <p>${escapeHtml(detail.description || 'Açıklama yok.')}</p>
              <div class="chips">
                <span class="chip">${escapeHtml(detail.category || 'Kategori yok')}</span>
                <span class="chip">${escapeHtml(detail.rating || detail.year || 'Bilgi yok')}</span>
              </div>
              <div class="cta-row">
                <button class="selector btn" data-action="play-item" data-id="${detail.id}">Oynat</button>
                <button class="selector btn secondary" data-action="go-live">Canlı TV</button>
              </div>
            </div>
          </div>
          ${detail.kind === 'series' ? `
            <section class="panel-card">
              <h3>Bölümler</h3>
              <div class="episode-list">
                ${episodes.map((episode) => `<button class="selector episode-btn" data-action="play-episode" data-series-id="${detail.id}" data-id="${episode.id}">${escapeHtml(episode.title)}</button>`).join('') || '<p class="muted">Bölüm verisi yok.</p>'}
              </div>
            </section>
          ` : ''}
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
        if (action === 'retry-bootstrap') return this.bootstrapSource();
        if (action === 'open-source-panel') {
          window.location.hash = '#/home';
          return;
        }
        if (action === 'reset-default-source') {
          this.state.activeSource = { mode: 'default', config: null };
          this.persistSource();
          return this.bootstrapSource();
        }
        if (action === 'set-filter') {
          this.state.filters[target.dataset.kind] = target.dataset.value;
          return this.renderBody();
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
          if (kind === 'live' || item.kind === 'movie') return this.openPlayer(item, kind === 'live' ? this.state.library.live : []);
          window.location.hash = `#/detail/${id}`;
          return;
        }
        if (action === 'play-item') {
          const id = target.dataset.id;
          const movie = this.state.library.movies?.find((entry) => entry.id === id);
          const series = this.state.detailCache.get(id);
          if (movie) return this.openPlayer(movie, []);
          if (series?.seasons?.[0]?.episodes?.[0]) return this.openPlayer(series.seasons[0].episodes[0], series.seasons.flatMap((season) => season.episodes));
          return;
        }
        if (action === 'play-episode') {
          const seriesId = target.dataset.seriesId;
          const episodeId = target.dataset.id;
          const series = this.state.detailCache.get(seriesId);
          const allEpisodes = series?.seasons?.flatMap((season) => season.episodes) || [];
          const episode = allEpisodes.find((entry) => entry.id === episodeId);
          if (episode) this.openPlayer(episode, allEpisodes);
          return;
        }
      };

      const sourceForm = qs('#source-form', this.root);
      if (sourceForm) {
        const syncVisibility = () => {
          const type = sourceForm.type.value;
          this.root.querySelectorAll('.m3u-only').forEach((node) => node.style.display = type === 'm3u' ? 'grid' : 'none');
          this.root.querySelectorAll('.xtream-only').forEach((node) => node.style.display = type === 'xtream' ? 'grid' : 'none');
        };
        sourceForm.type.addEventListener('change', syncVisibility);
        syncVisibility();
        sourceForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const formData = new FormData(sourceForm);
          const config = Object.fromEntries(formData.entries());
          this.state.activeSource = { mode: 'manual', config };
          this.persistSource();
          await this.bootstrapSource();
          window.location.hash = '#/home';
        });
      }
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
          const item = forcePlayerItem
            || this.state.library.live?.find((entry) => entry.id === this.state.route.params.id)
            || this.state.library.movies?.find((entry) => entry.id === this.state.route.params.id)
            || [...this.state.detailCache.values()].flatMap((detail) => detail.seasons?.flatMap((season) => season.episodes) || []).find((entry) => entry.id === this.state.route.params.id);
          if (!item) {
            main.innerHTML = this.showPaneError('Oynatıcıya geçilemedi', 'Bu içerik artık katalogda görünmüyor veya bölüm verisi eksik.');
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
        main.innerHTML = this.showPaneError('Sayfa render edilemedi', humanError(error?.message, 'Beklenmeyen hata.'));
      }

      this.attachEvents();
      if (!this.player) {
        this.focus.refresh(main);
      }
    }
  };
}
