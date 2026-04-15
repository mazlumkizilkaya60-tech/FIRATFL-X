import { MediaEngine } from './media-engine.js';

export class LivePreviewEngine {
  constructor(video, options = {}) {
    this.engine = new MediaEngine(video, {
      autoplay: true,
      live: true,
      ...options
    });
    this.engine.setMuted(true);
  }

  load(channel, options = {}) {
    return this.engine.load(channel, {
      live: true,
      autoplay: true,
      ...options
    });
  }

  toggleMute() {
    return this.engine.toggleMute();
  }

  setProfile(profile) {
    this.engine.options.profile = profile;
  }

  destroy() {
    return this.engine.destroy();
  }
}
