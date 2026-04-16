import { api } from './api.js';
import {
  escapeHtml,
  formatDuration,
  mediaRank,
  normalizeMediaType,
  playbackProfile,
  qs,
  safeArray,
  uniqueBy,
} from './util.js';

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';
const MPEGTS_CDN = 'https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.min.js';

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);

    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Script failed to load.')), {
        once: true,
      });
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
  if (window.Hls) {
    return window.Hls;
  }

  await loadExternalScript(HLS_CDN);
  return window.Hls;
}

async function ensureMpegts() {
  if (window.mpegts) {
    return window.mpegts;
  }

  await loadExternalScript(MPEGTS_CDN);
  return window.mpegts;
}

function canPlayNativeHls(video) {
  return Boolean(video?.canPlayType?.('application/vnd.apple.mpegurl'));
}

function describeResolution(result = {}) {
  if (!result.ok) {
    return result.statusLabel || `Kaynak hatası (${result.status || 'bilinmiyor'})`;
  }

  if (result.type === 'hls') return 'HLS hazır';
  if (result.type === 'mpegts') return 'MPEG-TS hazır';
  if (result.type === 'mp4') return 'MP4 hazır';

  return 'Kaynak hazır';
}

function deriveSwapVariants(url = '') {
  const variants = [];
  if (/\.ts(\?|$)/i.test(url)) {
    variants.push({ type: 'hls', url: url.replace(/\.ts(\?.*)?$/i, '.m3u8$1') });
  } else if (/\.m3u8(\?|$)/i.test(url)) {
    variants.push({ type: 'mpegts', url: url.replace(/\.m3u8(\?.*)?$/i, '.ts$1') });
  }
  return variants;
}

function buildCandidates(item = {}, profile = 'cloud') {
  const explicit = safeArray(item.sourceCandidates).map((candidate, index) => ({
    id: candidate.id || `${item.id || 'item'}-${index}`,
    label: candidate.label || `Kaynak ${index + 1}`,
    originalUrl: candidate.originalUrl || candidate.url,
    url: candidate.url,
    type: normalizeMediaType(candidate.type, candidate.url),
  }));

  const baseUrl = item.streamUrl || item.url || '';
  const derived = [];

  if (baseUrl) {
    derived.push({
      id: `${item.id || 'item'}-primary`,
      label: 'Primary',
      originalUrl: baseUrl,
      url: baseUrl,
      type: normalizeMediaType('', baseUrl),
    });

    for (const variant of deriveSwapVariants(baseUrl)) {
      derived.push({
        id: `${item.id || 'item'}-${variant.type}`,
        label: variant.type === 'hls' ? 'HLS varyant' : 'MPEG-TS varyant',
        originalUrl: variant.url,
        url: variant.url,
        type: variant.type,
      });
    }
  }

  return uniqueBy([...explicit, ...derived], (candidate) => candidate.url).sort(
    (left, right) => mediaRank(left.type, profile) - mediaRank(right.type, profile),
  );
}

export class Player {
  constructor({ app, mount, item, related = [] }) {
    this.app = app;
    this.mountNode = mount;
    this.item = item;
    this.related = related;
    this.video = null;
    this.hls = null;
    this.mpegts = null;
    this.audioTracks = [];
    this.currentAudioIndex = 0;
    this.currentCandidateIndex = -1;
    this.candidates = [];
    this.profile = playbackProfile(app.state.runtime, item);
    this.channelDigits = '';
    this.channelTimer = 0;
    this.boundKey = (event) => this.onKey(event);
  }

  render() {
    this.mountNode.innerHTML = `
      <section class="player-page">
        <div class="player-topbar">
          <button class="btn secondary selector" data-action="player-back" data-preferred-focus="true">Geri</button>
          <div class="player-heading">
            <span class="eyebrow">${escapeHtml(this.item.kind === 'live' ? 'Canlı Yayın' : 'Oynatıcı')}</span>
            <h1>${escapeHtml(this.item.title)}</h1>
          </div>
          <button class="btn secondary selector" data-action="player-toggle-info">Bilgi</button>
        </div>

        <div class="player-stage">
          <video id="player-video" class="player-video" playsinline></video>

          <div class="player-overlay">
            <div class="player-meta">
              <span id="player-status">Kaynak hazırlanıyor</span>
              <strong id="player-detail">Profil: ${escapeHtml(this.profile)}</strong>
              <div id="player-error" class="player-error hidden"></div>
            </div>

            <div class="player-controls">
              <button class="btn selector" data-action="player-play">Play/Pause</button>
              <button class="btn secondary selector" data-action="player-rewind">-10sn</button>
              <button class="btn secondary selector" data-action="player-forward">+10sn</button>
              <button class="btn secondary selector" data-action="player-mute">Mute</button>
              <button class="btn secondary selector" data-action="player-audio">Ses</button>
              <button class="btn secondary selector" data-action="player-fullscreen">Fullscreen</button>
              <button class="btn secondary selector" data-action="player-retry">Tekrar Dene</button>
            </div>

            <div class="player-progress-wrap">
              <span id="player-current">00:00</span>
              <input id="player-progress" class="player-progress" type="range" min="0" max="1000" value="0">
              <span id="player-duration">00:00</span>
            </div>
          </div>
        </div>

        <pre id="player-debug" class="player-debug hidden"></pre>
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
      if (action === 'player-back') this.app.goBack();
      if (action === 'player-play') this.togglePlay();
      if (action === 'player-rewind') this.seekBy(-10);
      if (action === 'player-forward') this.seekBy(10);
      if (action === 'player-mute') this.toggleMute();
      if (action === 'player-audio') this.cycleAudioTrack();
      if (action === 'player-fullscreen') this.toggleFullscreen();
      if (action === 'player-retry') this.load(true);
      if (action === 'player-toggle-info') this.debugNode.classList.toggle('hidden');
    });

    this.video.addEventListener('timeupdate', () => this.syncProgress());
    this.video.addEventListener('loadedmetadata', () => this.syncProgress());
    this.video.addEventListener('volumechange', () => this.syncStatusLabel());
    this.video.addEventListener('error', () => {
      this.tryNextCandidate(this.describeVideoError());
    });
    this.progressNode.addEventListener('input', () => {
      if (!Number.isFinite(this.video.duration) || this.item.kind === 'live') {
        return;
      }

      this.video.currentTime = (Number(this.progressNode.value) / 1000) * this.video.duration;
      this.syncProgress();
    });

    window.addEventListener('keydown', this.boundKey);
    this.load(false);
  }

  destroy() {
    window.removeEventListener('keydown', this.boundKey);
    window.clearTimeout(this.channelTimer);
    this.teardownPlayback();
  }

  teardownPlayback() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (this.mpegts) {
      try {
        this.mpegts.pause();
        this.mpegts.unload();
        this.mpegts.detachMediaElement();
      } catch {}
      this.mpegts.destroy();
      this.mpegts = null;
    }

    if (this.video) {
      try {
        this.video.pause();
      } catch {}
      this.video.removeAttribute('src');
      this.video.srcObject = null;
      this.video.load();
    }
  }

  getResolver() {
    return this.app.state.activeSource?.mode === 'default'
      ? api.resolveDefaultMedia
      : (url) => api.resolveManualMedia(this.app.state.activeSource.config, url);
  }

  async resolveCandidate(candidate) {
    try {
      return await this.getResolver()(candidate.originalUrl || candidate.url);
    } catch (error) {
      return {
        ok: false,
        status: 500,
        statusLabel: String(error?.message || error),
        type: candidate.type || 'native',
        targetUrl: candidate.originalUrl || candidate.url,
        finalUrl: candidate.originalUrl || candidate.url,
        viaProxyUrl: candidate.url,
        contentType: '',
      };
    }
  }

  async load(force = false) {
    this.hideError();
    this.teardownPlayback();
    this.candidates = buildCandidates(this.item, this.profile);
    this.currentCandidateIndex = -1;
    this.setStatus(
      'Kaynak hazırlanıyor',
      `${this.profile === 'local' ? 'Local/LAN' : 'Cloud/HTTPS'} profili uygulanıyor`,
    );

    if (!this.candidates.length) {
      this.showError('Bu içerik için hiç kaynak bulunamadı.');
      return;
    }

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
    this.debugNode.textContent = JSON.stringify(
      {
        profile: this.profile,
        candidate,
        resolution,
      },
      null,
      2,
    );

    this.setStatus(candidate.label || 'Kaynak deneniyor', describeResolution(resolution));

    if (!resolution.ok) {
      this.showError(`Bu aday açılamadı: ${describeResolution(resolution)}. Sonraki aday deneniyor.`);
      await this.tryNextCandidate(resolution.statusLabel || reason);
      return;
    }

    try {
      await this.attachResolvedSource(resolution);
    } catch (error) {
      this.showError(
        `Kaynak oynatılamadı: ${String(error?.message || error)}. Sonraki aday deneniyor.`,
      );
      await this.tryNextCandidate(String(error?.message || error));
    }
  }

  async attachResolvedSource(resolution) {
    const type = normalizeMediaType(resolution.type, resolution.finalUrl || resolution.viaProxyUrl);
    const url = resolution.viaProxyUrl || resolution.finalUrl || resolution.targetUrl;

    if (!url) {
      throw new Error('Final medya URL alınamadı.');
    }

    this.teardownPlayback();

    if (type === 'hls') {
      await this.attachHls(url);
      this.setStatus('Oynatma başladı', 'HLS akışı aktif');
      return;
    }

    if (type === 'mpegts') {
      if (this.profile !== 'local') {
        throw new Error('MPEG-TS sadece local/LAN profilde fallback olarak denenir.');
      }
      await this.attachMpegts(url);
      this.setStatus('Oynatma başladı', 'MPEG-TS fallback aktif');
      return;
    }

    await this.attachNative(url);
    this.setStatus('Oynatma başladı', type === 'mp4' ? 'MP4 akışı aktif' : 'Native oynatma aktif');
  }

  async attachNative(url) {
    this.video.src = url;
    this.video.load();
    await new Promise((resolve, reject) => {
      const onLoaded = async () => {
        cleanup();
        try {
          await this.autoplay();
          this.syncAudioTracks();
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
  }

  async attachHls(url) {
    if (canPlayNativeHls(this.video)) {
      await this.attachNative(url);
      return;
    }

    const Hls = await ensureHls();

    if (!Hls?.isSupported?.()) {
      throw new Error('Bu cihaz HLS.js desteklemiyor.');
    }

    await new Promise((resolve, reject) => {
      this.hls = new Hls({
        lowLatencyMode: this.item.kind === 'live',
        enableWorker: true,
      });

      this.hls.attachMedia(this.video);
      this.hls.on(Hls.Events.MEDIA_ATTACHED, () => this.hls.loadSource(url));
      this.hls.on(Hls.Events.MANIFEST_PARSED, async () => {
        try {
          await this.autoplay();
          this.syncAudioTracks();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => this.syncAudioTracks());
      this.hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) {
          reject(new Error(data.details || data.type || 'HLS fatal error'));
        }
      });
    });
  }

  async attachMpegts(url) {
    const mpegts = await ensureMpegts();

    if (!mpegts?.isSupported?.()) {
      throw new Error('Bu cihaz MPEG-TS MSE desteklemiyor.');
    }

    await new Promise((resolve, reject) => {
      this.mpegts = mpegts.createPlayer(
        {
          type: 'mpegts',
          isLive: this.item.kind === 'live',
          url,
        },
        {
          enableWorker: false,
          lazyLoad: false,
          autoCleanupSourceBuffer: true,
        },
      );

      this.mpegts.attachMediaElement(this.video);
      this.mpegts.load();

      this.mpegts.on(mpegts.Events.MEDIA_INFO, async () => {
        try {
          await this.autoplay();
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.mpegts.on(mpegts.Events.ERROR, (type, detail) => {
        reject(new Error(detail || type || 'MPEG-TS error'));
      });
    });
  }

  async autoplay() {
    try {
      await this.video.play();
      return;
    } catch {}

    this.video.muted = true;
    this.syncStatusLabel();

    try {
      await this.video.play();
    } catch (error) {
      throw new Error(`Autoplay başarısız: ${String(error?.message || error)}`);
    }
  }

  describeVideoError() {
    const error = this.video?.error;

    if (!error) {
      return 'Medya oynatılamadı.';
    }

    if (error.code === MediaError.MEDIA_ERR_DECODE) {
      return 'Codec çözülemedi.';
    }

    if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      return 'Kaynak bu cihazda desteklenmiyor.';
    }

    return error.message || 'Medya oynatılamadı.';
  }

  syncProgress() {
    const currentTime = Number(this.video?.currentTime || 0);
    const duration = Number(this.video?.duration || 0);
    const canSeek = Number.isFinite(duration) && duration > 0 && this.item.kind !== 'live';

    this.currentNode.textContent = formatDuration(currentTime);
    this.durationNode.textContent = canSeek ? formatDuration(duration) : 'LIVE';
    this.progressNode.disabled = !canSeek;
    this.progressNode.value = canSeek ? String(Math.round((currentTime / duration) * 1000)) : '1000';
  }

  syncStatusLabel() {
    const volumeLabel = this.video?.muted ? 'Muted' : 'Ses açık';
    const trackLabel = this.audioTracks.length ? `Ses izi: ${this.audioTracks.length}` : 'Ses izi yok';
    this.detailNode.textContent = `${this.profile} • ${volumeLabel} • ${trackLabel}`;
  }

  syncAudioTracks() {
    this.audioTracks = [];

    if (this.hls?.audioTracks?.length) {
      this.audioTracks = this.hls.audioTracks.map((track, index) => ({
        index,
        label: track.name || track.lang || `Track ${index + 1}`,
      }));
      this.currentAudioIndex = Math.max(0, this.hls.audioTrack || 0);
    } else if (this.video?.audioTracks?.length) {
      this.audioTracks = Array.from(this.video.audioTracks).map((track, index) => ({
        index,
        label: track.label || track.language || `Track ${index + 1}`,
      }));
      this.currentAudioIndex = this.audioTracks.findIndex(
        (_, index) => this.video.audioTracks[index]?.enabled,
      );
      if (this.currentAudioIndex < 0) {
        this.currentAudioIndex = 0;
      }
    }

    this.syncStatusLabel();
  }

  cycleAudioTrack() {
    if (!this.audioTracks.length) {
      this.showError('Bu kaynakta seçilebilir ses izi bulunamadı.');
      return;
    }

    this.currentAudioIndex = (this.currentAudioIndex + 1) % this.audioTracks.length;

    if (this.hls) {
      this.hls.audioTrack = this.currentAudioIndex;
    } else if (this.video?.audioTracks?.length) {
      Array.from(this.video.audioTracks).forEach((track, index) => {
        track.enabled = index === this.currentAudioIndex;
      });
    }

    const active = this.audioTracks[this.currentAudioIndex];
    this.hideError();
    this.syncStatusLabel();
    this.setStatus('Ses izi değişti', active?.label || `Track ${this.currentAudioIndex + 1}`);
  }

  togglePlay() {
    if (!this.video) return;
    if (this.video.paused) {
      this.video.play().catch(() => {});
      return;
    }
    this.video.pause();
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.syncStatusLabel();
  }

  seekBy(seconds) {
    if (this.item.kind === 'live' || !Number.isFinite(this.video.duration)) {
      return;
    }

    const nextTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
    this.video.currentTime = nextTime;
    this.syncProgress();
  }

  async toggleFullscreen() {
    if (!document.fullscreenElement) {
      await this.mountNode.requestFullscreen?.();
      return;
    }

    await document.exitFullscreen?.();
  }

  queueChannelDigit(digit) {
    if (this.item.kind !== 'live') return;

    this.channelDigits = `${this.channelDigits}${digit}`.slice(-3);
    this.setStatus('Kanal numarası', this.channelDigits);
    window.clearTimeout(this.channelTimer);
    this.channelTimer = window.setTimeout(() => {
      const target = safeArray(this.related).find(
        (entry) => String(entry.number || '').trim() === this.channelDigits,
      );
      this.channelDigits = '';

      if (target) {
        this.app.openPlayer(target, this.related);
      } else {
        this.showError('Girilen kanal numarası bulunamadı.');
      }
    }, 1000);
  }

  onKey(event) {
    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      this.app.goBack();
      return;
    }

    if (event.key === ' ') {
      event.preventDefault();
      this.togglePlay();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.seekBy(-10);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.seekBy(10);
      return;
    }

    if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      this.toggleMute();
      return;
    }

    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.toggleFullscreen();
      return;
    }

    if (event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.cycleAudioTrack();
      return;
    }

    if (this.item.kind === 'live' && /^\d$/.test(event.key)) {
      event.preventDefault();
      this.queueChannelDigit(event.key);
      return;
    }

    if (this.item.kind === 'live' && event.key === 'ArrowUp') {
      event.preventDefault();
      this.switchRelativeChannel(-1);
      return;
    }

    if (this.item.kind === 'live' && event.key === 'ArrowDown') {
      event.preventDefault();
      this.switchRelativeChannel(1);
    }
  }

  switchRelativeChannel(offset) {
    const list = safeArray(this.related);
    if (!list.length) return;

    const currentIndex = list.findIndex((entry) => entry.id === this.item.id);
    if (currentIndex < 0) return;

    const nextIndex = (currentIndex + offset + list.length) % list.length;
    const nextItem = list[nextIndex];
    if (nextItem) {
      this.app.openPlayer(nextItem, list);
    }
  }

  hideError() {
    this.errorNode.classList.add('hidden');
    this.errorNode.textContent = '';
  }

  showError(message) {
    this.errorNode.classList.remove('hidden');
    this.errorNode.textContent = message;
  }

  setStatus(status, detail) {
    this.statusNode.textContent = status;
    this.detailNode.textContent = detail;
  }
}
