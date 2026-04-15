import { LivePreviewEngine } from '../core/media/live-preview-engine.js';
import { createI18n } from '../core/i18n/translations.js';
import { qs, qsa } from '../core/utils/dom.js';

const PREVIEW_SWITCH_DELAY = 140;

export class LivePreviewController {
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.t = createI18n(options.language || 'tr');
    this.engine = null;
    this.channels = options.channels ?? [];
    this.channelMap = Object.fromEntries(this.channels.map((channel) => [channel.id, channel]));
    this.activeChannel = options.channel || this.channels[0] || null;
    this.pendingChannelId = null;
    this.switchTimer = 0;
    this.switchToken = 0;
    this.destroyed = false;
    this.handleHover = this.handleHover.bind(this);
  }

  async mount() {
    const video = qs('#live-preview-video', this.root);
    if (!video || !this.activeChannel) return;

    this.nodes = {
      eyebrow: qs('#live-preview-eyebrow', this.root),
      title: qs('#live-preview-title', this.root),
      description: qs('#live-preview-description', this.root),
      nowTitle: qs('#live-preview-now-title', this.root),
      nowDescription: qs('#live-preview-now-description', this.root),
      nextTitle: qs('#live-preview-next-title', this.root),
      nextDescription: qs('#live-preview-next-description', this.root),
      favorite: qs('#live-preview-favorite', this.root),
      play: qs('#live-preview-play', this.root),
      audio: qs('#live-preview-audio', this.root)
    };

    this.engine = new LivePreviewEngine(video, {
      profile: this.options.profile
    });

    if (!this.options.muted) {
      this.engine.toggleMute();
    }

    qsa('[data-action="select-live-channel"]', this.root).forEach((element) => {
      element.addEventListener('mouseenter', this.handleHover);
      element.addEventListener('focus', this.handleHover);
    });

    await this.selectChannel(this.activeChannel.id, { immediate: true });
  }

  renderMeta(channel) {
    if (!this.nodes) return;

    qsa('[data-action="select-live-channel"]', this.root).forEach((element) => {
      element.classList.toggle('is-active', element.getAttribute('data-value') === channel.id);
    });

    this.nodes.eyebrow.textContent = `${channel.number || ''} • ${channel.category || channel.group || this.t('live_label')}`;
    this.nodes.title.textContent = channel.title;
    this.nodes.description.textContent = channel.description || this.t('live_preview_no_info');
    this.nodes.nowTitle.textContent = channel.nowProgram?.title || this.t('live_preview_epg_pending');
    this.nodes.nowDescription.textContent = channel.nowProgram?.description || '';
    this.nodes.nextTitle.textContent = channel.nextProgram?.title || this.t('live_preview_no_plan');
    this.nodes.nextDescription.textContent = channel.nextProgram?.description || '';
    this.nodes.favorite.dataset.value = channel.id;
    this.nodes.favorite.textContent = this.options.favorites?.includes(channel.id)
      ? this.t('common_remove_favorite')
      : this.t('common_add_favorite');
    this.nodes.play.setAttribute('href', `#/player/live/${channel.id}`);
  }

  async selectChannel(channelId, { immediate = false } = {}) {
    const channel = this.channelMap[channelId];
    if (!channel) return;

    this.pendingChannelId = channelId;
    this.activeChannel = channel;
    this.renderMeta(channel);

    if (this.switchTimer) {
      window.clearTimeout(this.switchTimer);
      this.switchTimer = 0;
    }

    const token = ++this.switchToken;
    if (immediate) {
      await this.commitChannelSelection(channelId, token);
      return;
    }

    this.switchTimer = window.setTimeout(() => {
      this.switchTimer = 0;
      void this.commitChannelSelection(channelId, token);
    }, PREVIEW_SWITCH_DELAY);
  }

  async commitChannelSelection(channelId, token) {
    if (this.destroyed || this.pendingChannelId !== channelId || token !== this.switchToken) {
      return;
    }

    const channel = this.channelMap[channelId];
    if (!channel) return;

    try {
      await this.engine.load(channel, { live: true });
    } catch (error) {
      if (token !== this.switchToken || this.destroyed) {
        return;
      }
      console.warn(error);
    }
  }

  handleHover(event) {
    const target = event.currentTarget.getAttribute('data-value');
    if (!target || target === this.pendingChannelId) return;
    void this.selectChannel(target);
  }

  async destroy() {
    this.destroyed = true;
    if (this.switchTimer) {
      window.clearTimeout(this.switchTimer);
      this.switchTimer = 0;
    }

    qsa('[data-action="select-live-channel"]', this.root).forEach((element) => {
      element.removeEventListener('mouseenter', this.handleHover);
      element.removeEventListener('focus', this.handleHover);
    });
    await this.engine?.destroy();
  }
}
