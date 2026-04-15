import { canUseNativeHls, detectSourceType, loadHls, loadMpegts } from './media-capabilities.js';
import { buildSourceCandidates } from './source-candidates.js';
import { formatRuntimeSeconds } from '../utils/format.js';

const resolvedCandidateCache = new Map();

function detectSourceTypeFromResponse(url, contentType = '') {
  const normalizedType = String(contentType).toLowerCase();
  if (normalizedType.includes('application/vnd.apple.mpegurl') || normalizedType.includes('application/x-mpegurl')) {
    return 'hls';
  }
  if (normalizedType.includes('video/mp2t')) {
    return 'mpegts';
  }
  return detectSourceType(url);
}

export class MediaEngine extends EventTarget {
  constructor(video, options = {}) {
    super();
    this.video = video;
    this.options = {
      live: false,
      profile: 'stable',
      autoplay: true,
      ...options
    };
    this.hls = null;
    this.mpegts = null;
    this.candidates = [];
    this.currentIndex = -1;
    this.audioProbeTimer = 0;
    this.boundEvents = false;

    this.bindVideoEvents();
  }

  bindVideoEvents() {
    if (this.boundEvents) return;
    this.boundEvents = true;

    this.video.addEventListener('play', () => {
      this.emit('status', {
        state: 'playing',
        message: this.options.live ? 'Canlı yayın oynuyor' : 'Oynatma sürüyor'
      });
    });

    this.video.addEventListener('pause', () => {
      this.emit('status', {
        state: 'paused',
        message: 'Oynatma duraklatıldı'
      });
    });

    this.video.addEventListener('timeupdate', () => {
      this.emit('progress', {
        currentTime: this.video.currentTime ?? 0,
        duration: this.video.duration ?? 0,
        label: formatRuntimeSeconds(this.video.currentTime ?? 0)
      });
    });

    this.video.addEventListener('error', () => {
      this.tryNextCandidate(this.describeVideoError());
    });

    this.video.addEventListener('loadedmetadata', () => {
      this.emit('tracks', {
        audioTracks: this.getAudioTracks()
      });
    });

    this.video.addEventListener('volumechange', () => {
      this.emit('volume', {
        muted: this.video.muted,
        volume: this.video.volume
      });
    });
  }

  async load(item, options = {}) {
    this.options = {
      ...this.options,
      ...options,
      live: options.live ?? item.kind === 'live'
    };
    this.item = item;
    this.candidates = buildSourceCandidates(item);
    this.currentIndex = -1;

    if (!this.candidates.length) {
      const error = new Error('Bu içerik için kullanılabilir kaynak bulunamadı.');
      this.emit('fatal', { error });
      throw error;
    }

    await this.attachCandidate(0, options.startTime ?? 0);
  }

  async resolveCandidate(candidate) {
    if (
      this.options.live ||
      !candidate?.url ||
      candidate.url.startsWith('blob:') ||
      candidate.url.includes('/api/proxy')
    ) {
      return candidate;
    }

    const cached = resolvedCandidateCache.get(candidate.url);
    if (cached) {
      return {
        ...candidate,
        ...cached
      };
    }

    let response;
    try {
      response = await fetch(candidate.url, {
        method: 'GET',
        redirect: 'follow'
      });

      const resolved = {
        url: response.url || candidate.url,
        type: detectSourceTypeFromResponse(response.url || candidate.url, response.headers.get('content-type') || '')
      };

      resolvedCandidateCache.set(candidate.url, resolved);

      return {
        ...candidate,
        ...resolved
      };
    } catch (_error) {
      return candidate;
    } finally {
      try {
        await response?.body?.cancel?.();
      } catch (_error) {
        // no-op
      }
    }
  }

  async attachCandidate(index, startTime = 0) {
    const candidate = await this.resolveCandidate(this.candidates[index]);
    if (!candidate) {
      const error = new Error('Alternatif kaynak kalmadı.');
      this.emit('fatal', { error });
      throw error;
    }

    this.currentIndex = index;
    await this.reset();

    this.emit('candidatechange', {
      candidate,
      index,
      total: this.candidates.length
    });

    const sourceType = candidate.type ?? detectSourceType(candidate.url);
    this.emit('status', {
      state: 'loading',
      message: `${candidate.label} yükleniyor`
    });

    if (sourceType === 'hls') {
      await this.attachHls(candidate.url, startTime, candidate.credentials);
      return;
    }

    if (sourceType === 'mpegts') {
      await this.attachMpegts(candidate.url, startTime, candidate.credentials);
      return;
    }

    this.attachNative(candidate.url, startTime);
  }

  async attachHls(url, startTime, credentials = {}) {
    if (canUseNativeHls(this.video)) {
      this.attachNative(url, startTime);
      return;
    }

    const Hls = await loadHls();
    if (!Hls?.isSupported?.()) {
      await this.tryNextCandidate('Tarayıcı HLS akışını desteklemiyor.');
      return;
    }

    const config = {
      enableWorker: true,
      lowLatencyMode: this.options.live && this.options.profile === 'latency',
      liveSyncDurationCount: this.options.live ? (this.options.profile === 'latency' ? 2 : 4) : undefined,
      liveMaxLatencyDurationCount: this.options.live ? (this.options.profile === 'latency' ? 4 : 8) : undefined
    };

    if (credentials.username && credentials.password) {
      config.requestHeaders = {
        'X-Xtream-User': credentials.username,
        'X-Xtream-Pass': credentials.password
      };
    }

    this.hls = new Hls(config);

    this.hls.attachMedia(this.video);
    this.hls.on(Hls.Events.MEDIA_ATTACHED, () => this.hls.loadSource(url));
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (startTime > 0 && !this.options.live) {
        this.video.currentTime = startTime;
      }
      this.autoplay();
      this.scheduleAudioProbe();
      this.emit('tracks', { audioTracks: this.getAudioTracks() });
    });
    this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      this.emit('tracks', { audioTracks: this.getAudioTracks() });
    });
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data?.fatal) return;
      this.tryNextCandidate(this.describeHlsError(data));
    });
  }

  async attachMpegts(url, startTime, credentials = {}) {
    let mpegts;
    try {
      mpegts = await loadMpegts();
    } catch (error) {
      await this.tryNextCandidate('MPEG-TS runtime modülü yüklenemedi.');
      return;
    }
    if (!mpegts?.getFeatureList?.()?.mseLivePlayback) {
      await this.tryNextCandidate('Tarayıcı MPEG-TS akışını MSE üzerinden oynatamıyor.');
      return;
    }

    const config = {
      type: 'mpegts',
      url,
      isLive: this.options.live,
      headers: {}
    };

    if (credentials.username && credentials.password) {
      config.headers['X-Xtream-User'] = credentials.username;
      config.headers['X-Xtream-Pass'] = credentials.password;
    }

    this.mpegts = mpegts.createPlayer(
      config,
      {
        enableWorker: false,
        lazyLoad: false,
        enableStashBuffer: true,
        stashInitialSize: this.options.profile === 'latency' ? 256 * 1024 : 768 * 1024,
        autoCleanupSourceBuffer: true
      }
    );

    this.mpegts.attachMediaElement(this.video);
    this.mpegts.load();
    this.mpegts.on(mpegts.Events.MEDIA_INFO, () => {
      if (startTime > 0 && !this.options.live) {
        this.video.currentTime = startTime;
      }
      this.autoplay();
      this.scheduleAudioProbe();
    });
    this.mpegts.on(mpegts.Events.ERROR, (type, detail) => {
      this.tryNextCandidate(`MPEG-TS akışı açılamadı: ${detail || type || 'bilinmeyen hata'}`);
    });
  }

  attachNative(url, startTime) {
    this.video.src = url;
    this.video.load();
    this.video.onloadeddata = () => {
      if (startTime > 0 && !this.options.live) {
        this.video.currentTime = startTime;
      }
      this.autoplay();
      this.scheduleAudioProbe();
      this.video.onloadeddata = null;
    };
  }

  autoplay() {
    if (!this.options.autoplay) return;
    this.video
      .play()
      .catch(() => {
        this.video.muted = true;
        return this.video.play();
      })
      .catch(() => {
        this.emit('status', {
          state: 'blocked',
          message: 'Tarayıcı otomatik oynatmayı engelledi. Play ile başlatın.'
        });
      });
  }

  describeHlsError(data) {
    if (data?.details?.includes('audio')) {
      return 'HLS akışındaki ses izi tarayıcı tarafından çözülemedi.';
    }
    return data?.details || data?.type || 'HLS akışı açılırken hata oluştu.';
  }

  describeVideoError() {
    const error = this.video.error;
    if (!error) return 'Medya oynatılamadı.';
    if (error.code === MediaError.MEDIA_ERR_DECODE) {
      return 'Tarayıcı bu kaynağın codec bileşimini çözemedi.';
    }
    if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      return 'Kaynak formatı bu tarayıcıda desteklenmiyor.';
    }
    return error.message || 'Medya oynatılamadı.';
  }

  async tryNextCandidate(reason) {
    this.clearAudioProbe();
    const nextIndex = this.currentIndex + 1;

    if (nextIndex < this.candidates.length) {
      this.emit('fallback', {
        reason,
        nextCandidate: this.candidates[nextIndex]
      });
      await this.attachCandidate(nextIndex, this.video.currentTime || 0);
      return;
    }

    this.emit('fatal', { error: new Error(reason) });
  }

  getAudioTracks() {
    if (this.hls?.audioTracks?.length) {
      return this.hls.audioTracks.map((track, index) => ({
        id: String(index),
        label: track.name || track.lang || `Track ${index + 1}`,
        selected: this.hls.audioTrack === index
      }));
    }

    const nativeTracks = this.video.audioTracks;
    if (!nativeTracks?.length) return [];

    return Array.from(nativeTracks).map((track, index) => ({
      id: String(index),
      label: track.label || track.language || `Track ${index + 1}`,
      selected: track.enabled
    }));
  }

  selectAudioTrack(trackId) {
    const index = Number(trackId);
    if (Number.isNaN(index)) return;

    if (this.hls) {
      this.hls.audioTrack = index;
      this.emit('tracks', { audioTracks: this.getAudioTracks() });
      return;
    }

    const nativeTracks = this.video.audioTracks;
    if (!nativeTracks?.length) return;

    Array.from(nativeTracks).forEach((track, position) => {
      track.enabled = position === index;
    });

    this.emit('tracks', { audioTracks: this.getAudioTracks() });
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    return this.video.muted;
  }

  setMuted(value) {
    this.video.muted = Boolean(value);
  }

  togglePlayback() {
    if (this.video.paused) return this.video.play();
    this.video.pause();
    return Promise.resolve();
  }

  setPlaybackRate(rate) {
    this.video.playbackRate = rate;
    return rate;
  }

  seekBy(seconds) {
    if (this.options.live) return;
    const duration = this.video.duration || 0;
    this.video.currentTime = Math.max(0, Math.min(duration, (this.video.currentTime || 0) + seconds));
  }

  seekToRatio(ratio) {
    if (this.options.live) return;
    const duration = this.video.duration || 0;
    this.video.currentTime = duration * ratio;
  }

  scheduleAudioProbe() {
    this.clearAudioProbe();
    this.audioProbeTimer = window.setTimeout(() => {
      this.audioProbeTimer = 0;
      if (this.video.paused || this.options.live) return;
      if ('webkitAudioDecodedByteCount' in this.video && Number(this.video.webkitAudioDecodedByteCount) === 0) {
        this.tryNextCandidate('Aktif kaynakta çözülebilen bir ses izi bulunamadı.');
      }
    }, 3200);
  }

  clearAudioProbe() {
    if (!this.audioProbeTimer) return;
    window.clearTimeout(this.audioProbeTimer);
    this.audioProbeTimer = 0;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async reset() {
    this.clearAudioProbe();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.mpegts) {
      try {
        this.mpegts.pause();
        this.mpegts.unload();
        this.mpegts.detachMediaElement();
      } catch (error) {
        // no-op
      }
      this.mpegts.destroy();
      this.mpegts = null;
    }
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }

  async destroy() {
    await this.reset();
  }
}
