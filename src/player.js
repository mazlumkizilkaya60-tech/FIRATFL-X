import { api } from './api.js';
import { escapeHtml, formatDuration, mediaRank, qs } from './util.js';

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing && existing.dataset.loaded === 'true') {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Script failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Script failed to load.'));
    document.head.appendChild(script);
  });
}

async function ensureHls() {
  if (window.Hls) return window.Hls;
  await loadExternalScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js');
  return window.Hls;
}

function canPlayNativeHls(video) {
  return Boolean(video?.canPlayType?.('application/vnd.apple.mpegurl'));
}

function describeStatus(result = {}) {
  if (result.status === 404) return '404 kaynak yok';
  if (result.status === 403) return '403 erişim reddi';
  if (result.status === 511) return '511 ağ doğrulaması gerekli';
  if (result.status === 401) return '401 yetki hatası';
  if (result.type === 'mkv') return 'MKV TV/mobil tarayıcıda riskli';
  if (result.type === 'mpegts') return 'MPEG-TS düşük öncelikli fallback';
  return 'Kaynak hazırlanıyor';
}

export class Player {
  constructor({ app, mount, item, related = [] }) {
    this.app = app;
    this.mountNode = mount;
    this.item = item;
    this.related = related;
    this.video = null;
    this.hls = null;
    this.currentCandidateIndex = -1;
    this.candidates = [];
    this.channelDigits = '';
    this.channelTimer = 0;
    this.hideTimer = 0;
    this.boundKey = (event) => this.onKey(event);
  }

  render() {
    this.mountNode.innerHTML = `
      <section class="player-page">
        <div class="player-topbar">
          <button class="selector btn secondary" data-action="player-back">Geri</button>
          <div class="player-heading">
            <span class="eyebrow">${escapeHtml(this.item.kind === 'live' ? 'Canlı Yayın' : 'Oynatıcı')}</span>
            <h1>${escapeHtml(this.item.title)}</h1>
          </div>
          <button class="selector btn secondary" data-action="player-toggle-info">Bilgi</button>
        </div>
        <div class="player-stage">
          <video id="player-video" class="player-video" playsinline></video>
          <div class="player-overlay visible" id="player-overlay">
            <div class="player-error hidden" id="player-error"></div>
            <div class="player-meta" id="player-meta">
              <strong id="player-status">Kaynak hazırlanıyor</strong>
              <span id="player-detail">HLS öncelikli oynatma deneniyor</span>
            </div>
            <div class="player-controls">
              <button class="selector btn" data-action="player-play">Play/Pause</button>
              <button class="selector btn" data-action="player-rewind">-10sn</button>
              <button class="selector btn" data-action="player-forward">+10sn</button>
              <button class="selector btn" data-action="player-mute">Mute</button>
              <button class="selector btn" data-action="player-retry">Tekrar Dene</button>
            </div>
            <div class="player-progress-wrap">
              <span id="player-current">00:00</span>
              <input class="selector player-progress" id="player-progress" type="range" min="0" max="1000" value="0" />
              <span id="player-duration">00:00</span>
            </div>
            <div class="player-debug hidden" id="player-debug"></div>
          </div>
        </div>
      </section>
    `;

    this.video = qs('#player-video', this.mountNode);
    this.errorNode = qs('#player-error', this.mountNode);
    this.statusNode = qs('#player-status', this.mountNode);
    this.detailNode = qs('#player-detail', this.mountNode);
    this.currentNode = qs('#player-current', this.mountNode);
    this.durationNode = qs('#player-duration', this.mountNode);
    this.progressNode = qs('#player-progress', this.mountNode);
    this.debugNode = qs('#player-debug', this.mountNode);

    this.mountNode.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'player-back') return this.app.goBack();
      if (action === 'player-play') return this.togglePlay();
      if (action === 'player-rewind') return this.seekBy(-10);
      if (action === 'player-forward') return this.seekBy(10);
      if (action === 'player-mute') return this.toggleMute();
      if (action === 'player-retry') return this.load(true);
      if (action === 'player-toggle-info') return this.debugNode.classList.toggle('hidden');
    });

    this.video.addEventListener('timeupdate', () => this.syncProgress());
    this.video.addEventListener('loadedmetadata', () => this.syncProgress());
    this.video.addEventListener('error', () => {
      this.tryNextCandidate(this.describeVideoError());
    });
    this.progressNode.addEventListener('input', () => {
      if (!Number.isFinite(this.video.duration)) return;
      this.video.currentTime = (Number(this.progressNode.value) / 1000) * this.video.duration;
      this.syncProgress();
    });

    window.addEventListener('keydown', this.boundKey);
    this.load(false);
  }

  destroy() {
    window.removeEventListener('keydown', this.boundKey);
    window.clearTimeout(this.channelTimer);
    window.clearTimeout(this.hideTimer);
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
  }

  getCandidates() {
    const candidates = Array.isArray(this.item.sourceCandidates) ? [...this.item.sourceCandidates] : [];
    return candidates.sort((a, b) => mediaRank(a.type) - mediaRank(b.type));
  }

  async resolveCandidate(candidate) {
    try {
      const resolver = this.app.state.activeSource?.mode === 'default' ? api.resolveDefaultMedia : (url) => api.resolveManualMedia(this.app.state.activeSource.config, url);
      return await resolver(candidate.originalUrl || candidate.url);
    } catch (error) {
      return {
        ok: false,
        status: 500,
        statusLabel: String(error?.message || error),
        type: candidate.type || 'native',
        targetUrl: candidate.originalUrl || candidate.url,
        finalUrl: candidate.originalUrl || candidate.url,
        viaProxyUrl: candidate.url,
        contentType: ''
      };
    }
  }

  async load(force = false) {
    this.hideError();
    this.setStatus('Kaynak hazırlanıyor', 'HLS öncelikli akış deneniyor');
    this.candidates = this.getCandidates();
    this.currentCandidateIndex = -1;
    if (!this.candidates.length) {
      this.showError('Bu içerik için hiç kaynak bulunamadı.');
      return;
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    await this.tryNextCandidate(force ? 'Kullanıcı yeniden denedi' : 'İlk yükleme');
  }

  async tryNextCandidate(reason = '') {
    this.currentCandidateIndex += 1;
    const candidate = this.candidates[this.currentCandidateIndex];
    if (!candidate) {
      this.showError(`Oynatma başarısız. ${reason || 'Uygun aday kalmadı.'}`);
      return;
    }

    const resolution = await this.resolveCandidate(candidate);
    this.debugNode.textContent = JSON.stringify(resolution, null, 2);
    this.setStatus(candidate.label || 'Kaynak deneniyor', describeStatus(resolution));

    if (!resolution.ok) {
      this.showError(`Bu aday açılamadı: ${describeStatus(resolution)}. Sonraki aday deneniyor.`);
      return this.tryNextCandidate(resolution.statusLabel);
    }

    try {
      await this.attachResolvedSource(resolution);
    } catch (error) {
      this.showError(`Kaynak oynatılamadı: ${String(error?.message || error)}. Sonraki aday deneniyor.`);
      return this.tryNextCandidate(String(error?.message || error));
    }
  }

  async attachResolvedSource(resolution) {
    const type = resolution.type || 'native';
    const url = resolution.viaProxyUrl || resolution.finalUrl || resolution.targetUrl;
    if (!url) throw new Error('Final medya URL alınamadı.');

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (type === 'hls') {
      if (canPlayNativeHls(this.video)) {
        await this.attachNative(url);
        return;
      }
      const Hls = await ensureHls();
      if (!Hls?.isSupported?.()) {
        throw new Error('Bu cihaz HLS.js desteklemiyor.');
      }
      await new Promise((resolve, reject) => {
        this.hls = new Hls({ lowLatencyMode: this.item.kind === 'live' });
        this.hls.attachMedia(this.video);
        this.hls.on(Hls.Events.MEDIA_ATTACHED, () => this.hls.loadSource(url));
        this.hls.on(Hls.Events.MANIFEST_PARSED, async () => {
          try {
            await this.autoplay();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        this.hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data?.fatal) reject(new Error(data.details || data.type || 'HLS fatal error'));
        });
      });
      this.setStatus('Oynatma başladı', 'HLS akışı aktif');
      return;
    }

    if (type === 'mpegts') {
      throw new Error('MPEG-TS ana strateji değil. HLS/MP4 bekleniyor.');
    }

    await this.attachNative(url);
  }

  async attachNative(url) {
    this.video.src = url;
    this.video.load();
    await new Promise((resolve, reject) => {
      const onLoaded = async () => {
        cleanup();
        try {
          await this.autoplay();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      const onError = () => {
        cleanup();
        reject(new Error(this.describeVideoError()));
      };
      const cleanup = () => {
        this.video.removeEventListener('loadeddata', onLoaded);
        this.video.removeEventListener('error', onError);
      };
      this.video.addEventListener('loadeddata', onLoaded, { once: true });
      this.video.addEventListener('error', onError, { once: true });
    });
    this.setStatus('Oynatma başladı', 'Doğrudan medya akışı aktif');
  }

  async autoplay() {
    try {
      await this.video.play();
      return;
    } catch {
      this.video.muted = true;
      await this.video.play();
      this.setStatus('Oynatma başladı', 'Autoplay engeli için muted fallback uygulandı');
    }
  }

  describeVideoError() {
    const error = this.video.error;
    if (!error) return 'Medya açılamadı.';
    if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return 'The element has no supported sources';
    if (error.code === MediaError.MEDIA_ERR_DECODE) return 'Codec desteklenmiyor veya stream bozuk';
    if (error.code === MediaError.MEDIA_ERR_NETWORK) return 'Ağ hatası veya redirect çözülemedi';
    return error.message || 'Medya oynatım hatası';
  }

  setStatus(title, detail) {
    this.statusNode.textContent = title;
    this.detailNode.textContent = detail;
  }

  showError(message) {
    this.errorNode.textContent = message;
    this.errorNode.classList.remove('hidden');
  }

  hideError() {
    this.errorNode.classList.add('hidden');
    this.errorNode.textContent = '';
  }

  syncProgress() {
    this.currentNode.textContent = this.item.kind === 'live' ? 'LIVE' : formatDuration(this.video.currentTime || 0);
    this.durationNode.textContent = this.item.kind === 'live' ? 'LIVE' : formatDuration(this.video.duration || 0);
    if (!Number.isFinite(this.video.duration) || this.item.kind === 'live') {
      this.progressNode.value = '0';
      return;
    }
    this.progressNode.value = String(Math.round(((this.video.currentTime || 0) / this.video.duration) * 1000));
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play().catch((error) => this.showError(String(error?.message || error)));
      return;
    }
    this.video.pause();
  }

  seekBy(seconds) {
    if (this.item.kind === 'live') return;
    const next = Math.max(0, Math.min(this.video.duration || 0, (this.video.currentTime || 0) + seconds));
    this.video.currentTime = next;
    this.syncProgress();
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.setStatus('Ses güncellendi', this.video.muted ? 'Sessiz mod açık' : 'Sessiz mod kapalı');
  }

  stepLive(offset) {
    if (this.item.kind !== 'live' || !this.related.length) return;
    const index = this.related.findIndex((entry) => entry.id === this.item.id);
    const next = this.related[(index + offset + this.related.length) % this.related.length];
    if (next) this.app.openPlayer(next, this.related);
  }

  onKey(event) {
    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      this.app.goBack();
      return;
    }
    if (event.key === 'Enter' || event.key === 'MediaPlayPause') {
      event.preventDefault();
      this.togglePlay();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.item.kind === 'live' ? this.stepLive(-1) : this.seekBy(-10);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.item.kind === 'live' ? this.stepLive(1) : this.seekBy(10);
      return;
    }
    if (event.key === 'ArrowUp' && this.item.kind === 'live') {
      event.preventDefault();
      this.stepLive(1);
      return;
    }
    if (event.key === 'ArrowDown' && this.item.kind === 'live') {
      event.preventDefault();
      this.stepLive(-1);
      return;
    }
    if (/^[0-9]$/.test(event.key) && this.item.kind === 'live') {
      this.channelDigits += event.key;
      this.setStatus('Kanal atlama', `Numara: ${this.channelDigits}`);
      window.clearTimeout(this.channelTimer);
      this.channelTimer = window.setTimeout(() => {
        const target = this.related.find((entry) => String(entry.number || '').startsWith(this.channelDigits));
        this.channelDigits = '';
        if (target) this.app.openPlayer(target, this.related);
      }, 900);
    }
  }
}
