// Basit player page
import { getBrowseData, buildStreamUrl } from '../app.js';
import { MediaEngine } from '../core/media/media-engine.js';

export class PlayerPage {
  constructor(container) {
    this.container = container;
    this.player = null;
    this.currentItem = null;
    this.isLoading = false;
  }

  async load(mode, id) {
    if (this.isLoading) return;
    this.isLoading = true;

    this.showLoading();

    try {
      const data = await getBrowseData(mode);
      const item = data.items.find(i => i.id == id);

      if (!item) {
        this.showError('Content not found');
        return;
      }

      this.currentItem = item;
      this.render();
      this.initializePlayer();

    } catch (error) {
      console.error('Error loading player page:', error);
      this.showError('Failed to load content');
    } finally {
      this.isLoading = false;
    }
  }

  showLoading() {
    this.container.innerHTML = '<div class="loading"><p>Loading player...</p></div>';
  }

  showError(message) {
    this.container.innerHTML = '<div class="error"><h2>Error</h2><p>' + message + '</p><button onclick="window.location.hash=\'#\'">Back</button></div>';
  }

  render() {
    if (!this.currentItem) return;

    const title = this.currentItem.name || this.currentItem.title || 'Unknown';

    this.container.innerHTML = '<div class="player-page"><h1>' + title + '</h1><div class="player-container"><video id="main-video" controls></video></div><button onclick="window.location.hash=\'#\'">Back</button></div>';
  }

  async initializePlayer() {
    try {
      const videoElement = document.getElementById('main-video');
      if (!videoElement) return;

      const streamUrl = await buildStreamUrl(this.currentItem.id, 'live');

      if (!streamUrl) {
        this.showError('Stream URL not available');
        return;
      }

      this.player = new MediaEngine(videoElement);
      await this.player.load(streamUrl);

      try {
        await this.player.play();
      } catch (error) {
        console.log('Autoplay failed');
      }

    } catch (error) {
      console.error('Error initializing player:', error);
      this.showError('Failed to initialize player');
    }
  }

  destroy() {
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
  }
}
