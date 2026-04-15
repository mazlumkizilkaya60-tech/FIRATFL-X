import { createI18n } from '../core/i18n/translations.js';
import { MediaEngine } from '../core/media/media-engine.js';
import { qs, qsa } from '../core/utils/dom.js';
import { formatRuntimeSeconds } from '../core/utils/format.js';

export class PlayerController {
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.t = createI18n(options.language || 'tr');
    this.engine = null;
    this.remoteUnsubscribe = null;
    this.hideTimer = 0;
    this.channelDigits = '';
    this.channelTimer = 0;
    this.savedTrackApplied = false;
    this.boundShowControls = () => this.showControls();
    this.boundScrubStart = (event) => this.handleScrubStart(event);
    this.boundScrubMove = (event) => this.handleScrubMove(event);
    this.boundScrubEnd = (event) => this.handleScrubEnd(event);
  }

  async mount() {
    this.video = qs('#player-video', this.root);
    this.overlay = qs('#player-overlay', this.root);
    this.top = qs('#player-top', this.root);
    this.progressBar = qs('#player-bar', this.root);
    this.bufferBar = qs('#player-buffer', this.root);
    this.progressTrack = qs('#player-progress', this.root);
    this.progressThumb = qs('#player-thumb', this.root);
    this.currentLabel = qs('#player-current', this.root);
    this.durationLabel = qs('#player-duration', this.root);
    this.statusLabel = qs('#player-status-label', this.root);
    this.statusDetail = qs('#player-status-detail', this.root);
    this.audioNote = qs('#player-audio-note', this.root);
    this.sourceTypeNode = qs('#player-source-type', this.root);
    this.audioStrategyNode = qs('#player-audio-strategy', this.root);
    this.likelyIssueNode = qs('#player-likely-issue', this.root);
    this.finalUrlNode = qs('#player-final-url', this.root);
    this.audioNoteModal = qs('#player-audio-note-modal', this.root);
    this.drawer = qs('#player-drawer', this.root);
    this.drawerList = qs('.player-drawer__list', this.root);
    this.audioModal = qs('#player-audio-modal', this.root);
    this.audioList = qs('#player-audio-list', this.root);
    this.zap = qs('#player-zap', this.root);
    this.zapValue = qs('#player-zap-value', this.root);

    this.engine = new MediaEngine(this.video, {
      live: this.options.item.kind === 'live',
      profile: this.options.profile,
      autoplay: true
    });

    this.engine.setMuted(Boolean(this.options.playerState?.muted));

    this.engine.addEventListener('candidatechange', (event) => {
      this.activeCandidate = event.detail.candidate;
      this.renderInspection();
    });

    this.engine.addEventListener('status', (event) => {
      this.statusLabel.textContent = event.detail.message;
      this.statusDetail.textContent = this.engine.candidates[this.engine.currentIndex]?.label || '';
      if (!this.lastAudioIssue) {
        this.setAudioNote(this.t('player_audio_hint_default'));
      }
      this.renderInspection();
    });

    this.engine.addEventListener('progress', (event) => {
      const { currentTime, duration } = event.detail;
      if (!this.scrubbing) {
        this.renderProgressState(currentTime, duration);
      }
    });

    this.engine.addEventListener('tracks', (event) => {
      const tracks = event.detail.audioTracks || [];
      this.applySavedAudioTrack(tracks);
      this.renderAudioTracks(this.engine.getAudioTracks());
      this.renderInspection();
    });

    this.engine.addEventListener('fallback', (event) => {
      this.statusLabel.textContent = event.detail.reason;
      this.statusDetail.textContent = `→ ${event.detail.nextCandidate.label}`;
      this.handleAudioIssue(event.detail.reason);
      this.renderInspection(event.detail.reason);
    });

    this.engine.addEventListener('fatal', (event) => {
      this.statusLabel.textContent = this.options.language === 'en' ? 'Playback stopped' : 'Oynatma durdu';
      this.statusDetail.textContent = event.detail.error.message;
      this.handleAudioIssue(event.detail.error.message);
      this.renderInspection(event.detail.error.message);
    });

    this.video.addEventListener('progress', () => {
      if (!this.video.buffered?.length || !this.video.duration || this.options.item.kind === 'live') {
        this.bufferBar.style.width = '0%';
        return;
      }
      const end = this.video.buffered.end(this.video.buffered.length - 1);
      this.bufferBar.style.width = `${(end / this.video.duration) * 100}%`;
    });

    this.video.addEventListener('volumechange', () => {
      this.syncPlayerState({ muted: this.video.muted });
    });

    qsa('[data-action]', this.root).forEach((element) => {
      element.addEventListener('mousemove', this.boundShowControls);
    });

    this.root.addEventListener('mousemove', this.boundShowControls);
    this.root.addEventListener('click', this.boundShowControls);
    this.progressTrack?.addEventListener('pointerdown', this.boundScrubStart);

    this.remoteUnsubscribe = this.options.remote.subscribe((action) => this.handleRemote(action));

    await this.engine.load(this.options.item, {
      live: this.options.item.kind === 'live',
      autoplay: true,
      profile: this.options.profile
    });

    this.engine.setPlaybackRate(Number(this.options.playerState?.playbackRate || 1));
    this.syncPlayerState({ playbackRate: this.video.playbackRate, muted: this.video.muted });
    this.options.onStart?.(this.options.item);
    this.renderProgressState(this.video.currentTime || 0, this.video.duration || 0);
    this.showControls();
  }

  setAudioNote(message) {
    if (this.audioNote) this.audioNote.textContent = message;
    if (this.audioNoteModal) this.audioNoteModal.textContent = message;
  }

  describeSourceType(candidate) {
    const type = String(candidate?.type || '').toLowerCase();
    const url = String(candidate?.url || '').toLowerCase();
    const isEn = this.options.language === 'en';

    if (type === 'hls' || url.includes('.m3u8')) {
      return isEn ? 'Source: HLS manifest' : 'Kaynak: HLS manifest';
    }
    if (type === 'mpegts' || url.includes('.ts')) {
      return isEn ? 'Source: MPEG-TS stream' : 'Kaynak: MPEG-TS akışı';
    }
    if (url.includes('.mkv')) {
      return isEn ? 'Source: MKV container' : 'Kaynak: MKV container';
    }
    if (url.includes('.mp4')) {
      return isEn ? 'Source: MP4 file' : 'Kaynak: MP4 dosyası';
    }
    return isEn ? 'Source: Direct media file' : 'Kaynak: Doğrudan medya dosyası';
  }

  describeAudioStrategy(candidate) {
    const type = String(candidate?.type || '').toLowerCase();
    const url = String(candidate?.url || '').toLowerCase();
    const isEn = this.options.language === 'en';

    if (type === 'hls' || url.includes('.m3u8')) {
      return isEn ? 'Audio: manifest / track groups' : 'Ses: manifest / track grupları';
    }
    if (type === 'mpegts' || url.includes('.ts')) {
      return isEn ? 'Audio: embedded in transport stream' : 'Ses: transport stream içinde gömülü';
    }
    if (url.includes('.mkv') || url.includes('.mp4') || url.includes('.avi')) {
      return isEn ? 'Audio: embedded in container' : 'Ses: container içinde gömülü';
    }
    return isEn ? 'Audio: direct source, no separate fetch' : 'Ses: doğrudan kaynak, ayrı fetch yok';
  }

  describeLikelyIssue(candidate, explicitReason = '') {
    const reason = String(explicitReason || this.lastAudioIssue || '').trim();
    const url = String(candidate?.url || '').toLowerCase();
    const tracks = this.engine?.getAudioTracks?.() || [];
    const isEn = this.options.language === 'en';

    if (reason) {
      return isEn ? `Issue: ${reason}` : `Sorun: ${reason}`;
    }

    if (tracks.length) {
      return isEn ? `Issue: no active fault, ${tracks.length} track(s) detected` : `Sorun: aktif hata yok, ${tracks.length} ses izi algılandı`;
    }

    if (url.includes('.mkv') || url.includes('.mp4')) {
      return isEn
        ? 'Issue: likely browser audio codec limitation'
        : 'Sorun: büyük olasılıkla tarayıcı ses codec sınırı';
    }

    return isEn ? 'Issue: waiting for stream inspection' : 'Sorun: akış inceleme bekleniyor';
  }

  renderInspection(explicitReason = '') {
    const candidate =
      this.activeCandidate ||
      this.engine?.candidates?.[this.engine?.currentIndex] ||
      null;

    if (this.sourceTypeNode) {
      this.sourceTypeNode.textContent = candidate ? this.describeSourceType(candidate) : 'Source: -';
    }
    if (this.audioStrategyNode) {
      this.audioStrategyNode.textContent = candidate ? this.describeAudioStrategy(candidate) : 'Audio: -';
    }
    if (this.likelyIssueNode) {
      this.likelyIssueNode.textContent = candidate ? this.describeLikelyIssue(candidate, explicitReason) : 'Issue: -';
    }
    if (this.finalUrlNode) {
      if (!candidate?.url) {
        this.finalUrlNode.textContent = '';
        return;
      }

      try {
        const url = new URL(candidate.url, window.location.origin);
        const label = this.options.language === 'en' ? 'Final source' : 'Final kaynak';
        this.finalUrlNode.textContent = `${label}: ${url.origin}${url.pathname}`;
      } catch (_error) {
        this.finalUrlNode.textContent = candidate.url;
      }
    }
  }

  handleAudioIssue(reason = '') {
    if (!/audio|codec|ses|track/i.test(reason)) return;
    this.lastAudioIssue = reason;
    this.setAudioNote(this.t('player_audio_hint_issue'));
  }

  applySavedAudioTrack(tracks = []) {
    const selectedAudioTrack = this.options.playerState?.selectedAudioTrack;
    if (!tracks.length) {
      this.setAudioNote(this.lastAudioIssue || this.t('player_audio_hint_default'));
      this.renderInspection();
      return;
    }

    if (!this.savedTrackApplied && selectedAudioTrack != null && tracks.some((track) => track.id === selectedAudioTrack)) {
      this.savedTrackApplied = true;
      this.engine.selectAudioTrack(selectedAudioTrack);
      this.renderInspection();
      return;
    }

    const activeTrack = tracks.find((track) => track.selected);
    if (activeTrack) {
      this.syncPlayerState({ selectedAudioTrack: activeTrack.id });
      this.setAudioNote(this.t('player_audio_selected', { label: activeTrack.label }));
      this.renderInspection();
      return;
    }

    this.setAudioNote(this.lastAudioIssue || this.t('player_audio_hint_default'));
    this.renderInspection();
  }

  renderAudioTracks(tracks = []) {
    this.audioList.innerHTML = tracks.length
      ? tracks
          .map(
            (track) => `
              <button class="selector utility-item" data-action="player-select-audio" data-value="${track.id}">
                ${track.label}${track.selected ? ' • active' : ''}
              </button>
            `
          )
          .join('')
      : `<div class="drawer__note">${this.t('player_audio_none')}</div>`;
  }

  syncPlayerState(patch = {}) {
    this.options.playerState = {
      ...this.options.playerState,
      ...patch
    };
    this.options.onPlayerStateChange?.(patch);
  }

  renderProgressState(currentTime = 0, duration = 0) {
    const isLive = this.options.item.kind === 'live';
    this.currentLabel.textContent = isLive ? 'LIVE' : formatRuntimeSeconds(currentTime);
    this.durationLabel.textContent = isLive ? 'LIVE' : formatRuntimeSeconds(duration);

    if (isLive || !duration) {
      this.progressBar.style.width = '0%';
      if (this.progressThumb) this.progressThumb.style.left = '0%';
      this.progressTrack?.setAttribute('aria-valuemin', '0');
      this.progressTrack?.setAttribute('aria-valuemax', '0');
      this.progressTrack?.setAttribute('aria-valuenow', '0');
      return;
    }

    const ratio = Math.max(0, Math.min(1, currentTime / duration));
    this.progressBar.style.width = `${ratio * 100}%`;
    if (this.progressThumb) this.progressThumb.style.left = `${ratio * 100}%`;
    this.progressTrack?.setAttribute('aria-valuemin', '0');
    this.progressTrack?.setAttribute('aria-valuemax', String(Math.round(duration)));
    this.progressTrack?.setAttribute('aria-valuenow', String(Math.round(currentTime)));
  }

  readScrubRatio(clientX) {
    if (!this.progressTrack) return 0;
    const rect = this.progressTrack.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  updateScrubPreview(ratio) {
    const duration = this.video?.duration || 0;
    const previewTime = duration * ratio;
    this.renderProgressState(previewTime, duration);
  }

  handleScrubStart(event) {
    if (this.options.item.kind === 'live') return;
    if (!this.video?.duration) return;

    this.showControls();
    this.scrubbing = true;
    this.wasPlayingBeforeScrub = !this.video.paused;
    this.video.pause();
    this.progressTrack?.setPointerCapture?.(event.pointerId);
    this.updateScrubPreview(this.readScrubRatio(event.clientX));
    window.addEventListener('pointermove', this.boundScrubMove);
    window.addEventListener('pointerup', this.boundScrubEnd, { once: true });
  }

  handleScrubMove(event) {
    if (!this.scrubbing) return;
    this.updateScrubPreview(this.readScrubRatio(event.clientX));
  }

  handleScrubEnd(event) {
    if (!this.scrubbing) return;
    const ratio = this.readScrubRatio(event.clientX);
    this.scrubbing = false;
    window.removeEventListener('pointermove', this.boundScrubMove);
    this.engine.seekToRatio(ratio);
    this.renderProgressState(this.video.currentTime || 0, this.video.duration || 0);

    if (this.wasPlayingBeforeScrub) {
      this.video.play().catch(() => {});
    }
    this.wasPlayingBeforeScrub = false;
  }

  isProgressFocused() {
    const focused = this.options.focus?.getFocusedElement?.() || document.activeElement;
    return Boolean(focused && this.progressTrack && focused === this.progressTrack);
  }

  showControls() {
    this.top.classList.remove('is-hidden');
    this.overlay.classList.remove('is-hidden');
    if (this.hideTimer) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.top.classList.add('is-hidden');
      this.overlay.classList.add('is-hidden');
      this.hideTimer = 0;
    }, 5000);
  }

  toggleDrawer(force) {
    const open = force ?? this.drawer.hidden;
    this.drawer.hidden = !open;
    if (open) {
      const preferred = qs('.player-drawer__item.is-active', this.drawer) || qs('.selector', this.drawer);
      if (this.drawerList) {
        this.drawerList.scrollTop = 0;
      }
      this.options.focus.pushScope(this.drawer, preferred);
      requestAnimationFrame(() => {
        preferred?.scrollIntoView?.({
          block: 'center',
          inline: 'nearest',
          behavior: 'smooth'
        });
      });
    } else {
      this.options.focus.popScope();
    }
  }

  toggleAudio(force) {
    const open = force ?? this.audioModal.hidden;
    this.audioModal.hidden = !open;
    if (open) {
      this.options.focus.pushScope(this.audioModal, qs('.selector', this.audioModal));
    } else {
      this.options.focus.popScope();
    }
  }

  handleAction(action, value) {
    if (action === 'player-back') {
      window.history.back();
      return true;
    }
    if (action === 'player-toggle-play') {
      this.engine.togglePlayback();
      return true;
    }
    if (action === 'player-seek') {
      this.engine.seekBy(Number(value || 0));
      return true;
    }
    if (action === 'player-mute') {
      const muted = this.engine.toggleMute();
      this.syncPlayerState({ muted });
      return true;
    }
    if (action === 'player-open-drawer') {
      this.toggleDrawer(true);
      return true;
    }
    if (action === 'player-close-drawer') {
      this.toggleDrawer(false);
      return true;
    }
    if (action === 'player-open-audio') {
      this.toggleAudio(true);
      return true;
    }
    if (action === 'player-close-audio') {
      this.toggleAudio(false);
      return true;
    }
    if (action === 'player-select-audio') {
      this.engine.selectAudioTrack(value);
      const activeTrack = this.engine.getAudioTracks().find((track) => track.id === value);
      this.syncPlayerState({ selectedAudioTrack: value });
      if (activeTrack) {
        this.setAudioNote(this.t('player_audio_selected', { label: activeTrack.label }));
      }
      this.renderInspection();
      this.toggleAudio(false);
      return true;
    }
    if (action === 'player-fullscreen') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
      return true;
    }
    return false;
  }

  handleRemote(action) {
    this.showControls();

    if ((action === 'left' || action === 'right') && this.isProgressFocused() && this.options.item.kind !== 'live') {
      this.engine.seekBy(action === 'right' ? 10 : -10);
      return true;
    }

    if (action.startsWith('digit:') && this.options.item.kind === 'live') {
      this.queueDigits(action.split(':')[1]);
      return true;
    }
    if (action === 'playpause') {
      this.engine.togglePlayback();
      return true;
    }
    if (action === 'play') {
      this.video.play();
      return true;
    }
    if (action === 'pause') {
      this.video.pause();
      return true;
    }
    if (action === 'ff') {
      this.engine.seekBy(30);
      return true;
    }
    if (action === 'rw') {
      this.engine.seekBy(-30);
      return true;
    }
    if (action === 'menu') {
      this.toggleDrawer(true);
      return true;
    }
    if (action === 'info') {
      this.toggleAudio(true);
      return true;
    }
    if (action === 'home') {
      window.location.hash = '#/';
      return true;
    }
    if (action === 'back') {
      if (!this.drawer.hidden) {
        this.toggleDrawer(false);
        return true;
      }
      if (!this.audioModal.hidden) {
        this.toggleAudio(false);
        return true;
      }
      window.history.back();
      return true;
    }
    if (action === 'channelup' && this.options.item.kind === 'live') {
      this.stepLiveChannel(1);
      return true;
    }
    if (action === 'channeldown' && this.options.item.kind === 'live') {
      this.stepLiveChannel(-1);
      return true;
    }
    return false;
  }

  queueDigits(digit) {
    this.channelDigits += digit;
    this.zap.hidden = false;
    this.zapValue.textContent = this.channelDigits;
    if (this.channelTimer) window.clearTimeout(this.channelTimer);
    this.channelTimer = window.setTimeout(() => {
      const target = this.options.related.find((channel) => String(channel.number || '').startsWith(this.channelDigits));
      this.channelDigits = '';
      this.zap.hidden = true;
      if (target) {
        window.location.hash = `#/player/live/${target.id}`;
      }
    }, 900);
  }

  stepLiveChannel(delta) {
    const index = this.options.related.findIndex((channel) => channel.id === this.options.item.id);
    if (index === -1) return;
    const next = this.options.related[(index + delta + this.options.related.length) % this.options.related.length];
    if (next) {
      window.location.hash = `#/player/live/${next.id}`;
    }
  }

  async destroy() {
    if (this.hideTimer) window.clearTimeout(this.hideTimer);
    if (this.channelTimer) window.clearTimeout(this.channelTimer);
    this.remoteUnsubscribe?.();
    qsa('[data-action]', this.root).forEach((element) => {
      element.removeEventListener('mousemove', this.boundShowControls);
    });
    this.root.removeEventListener('mousemove', this.boundShowControls);
    this.root.removeEventListener('click', this.boundShowControls);
    this.progressTrack?.removeEventListener('pointerdown', this.boundScrubStart);
    window.removeEventListener('pointermove', this.boundScrubMove);
    window.removeEventListener('pointerup', this.boundScrubEnd);

    const currentTime = this.video?.currentTime || 0;
    const duration = this.video?.duration || 0;
    if (this.options.item.kind !== 'live' && currentTime > 30 && duration > 0) {
      this.options.onProgress?.({
        id: this.options.item.id,
        kind: this.options.item.kind,
        title: this.options.item.title,
        poster: this.options.item.poster,
        progress: (currentTime / duration) * 100
      });
    }

    await this.engine?.destroy();
  }
}
