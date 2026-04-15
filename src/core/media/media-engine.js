// Python versiyonundaki player sistemini JavaScript'e çevir
import Hls from 'hls.js';
import { choosePlayback } from '../../services/direct-stream.js';
import { nextStream } from '../../services/multi-failover.js';

export class MediaEngine {
  constructor(videoElement) {
    this.video = videoElement;
    this.hls = null;
    this.currentStream = null;
    this.backupStreams = [];
    this.isDestroyed = false;
  }

  async load(streamUrl, backupUrls = []) {
    if (this.isDestroyed) return;

    this.currentStream = streamUrl;
    this.backupStreams = backupUrls;

    // Direct stream kontrolü
    const useDirect = await choosePlayback(streamUrl);
    if (useDirect) {
      return this.loadDirect(streamUrl);
    }

    // HLS stream
    return this.loadHLS(streamUrl);
  }

  async loadDirect(url) {
    if (this.isDestroyed) return;

    this.destroyHLS();
    this.video.src = url;
    this.video.load();

    return new Promise((resolve, reject) => {
      this.video.onloadeddata = () => resolve();
      this.video.onerror = () => {
        console.warn('Direct stream failed, trying HLS...');
        this.loadHLS(url).then(resolve).catch(reject);
      };
    });
  }

  async loadHLS(url) {
    if (this.isDestroyed) return;

    // HLS.js desteği kontrolü
    if (!Hls.isSupported()) {
      console.warn('HLS.js not supported, using native HLS');
      this.video.src = url;
      this.video.load();
      return;
    }

    this.destroyHLS();

    this.hls = new Hls({
      enableWorker: false,
      lowLatencyMode: true,
      backBufferLength: 90
    });

    return new Promise((resolve, reject) => {
      this.hls.loadSource(url);
      this.hls.attachMedia(this.video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        resolve();
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data);

        if (data.fatal) {
          this.handleFatalError(data);
        }
      });
    });
  }

  handleFatalError(data) {
    if (this.isDestroyed) return;

    console.log('Handling fatal error, trying next stream...');

    // Sonraki stream'i dene
    const nextUrl = nextStream(this.currentStream, this.backupStreams);
    if (nextUrl && nextUrl !== this.currentStream) {
      this.currentStream = nextUrl;
      this.loadHLS(nextUrl);
    } else {
      console.error('All streams failed');
      // Kullanıcıya hata göster
      this.showError('Stream playback failed');
    }
  }

  showError(message) {
    // Video elementinde hata göster
    if (this.video.parentElement) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'player-error';
      errorDiv.innerHTML = `
        <div class="error-message">
          <h3>Playback Error</h3>
          <p>${message}</p>
          <button onclick="location.reload()">Retry</button>
        </div>
      `;
      this.video.parentElement.appendChild(errorDiv);
    }
  }

  play() {
    if (this.video) {
      return this.video.play();
    }
  }

  pause() {
    if (this.video) {
      this.video.pause();
    }
  }

  destroy() {
    this.isDestroyed = true;
    this.destroyHLS();

    if (this.video) {
      this.video.src = '';
      this.video.load();
    }
  }

  destroyHLS() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }
}