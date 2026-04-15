import { isTypingElement } from '../utils/dom.js';

function matches(event, values) {
  return values.includes(event.key) || values.includes(event.keyCode) || values.includes(event.code);
}

export function mapRemoteAction(event) {
  const code = String(event.code ?? '');
  const key = String(event.key ?? '');

  if (/^(Digit|Numpad)[0-9]$/.test(code) || /^[0-9]$/.test(key)) {
    const digit = /^[0-9]$/.test(key) ? key : code.replace(/^(Digit|Numpad)/, '');
    return `digit:${digit}`;
  }

  if (matches(event, ['ArrowLeft', 37])) return 'left';
  if (matches(event, ['ArrowRight', 39])) return 'right';
  if (matches(event, ['ArrowUp', 38])) return 'up';
  if (matches(event, ['ArrowDown', 40])) return 'down';
  if (matches(event, ['Enter', 'NumpadEnter', 'MediaEnter', 13])) return 'enter';
  if (matches(event, ['Escape', 'Backspace', 'BrowserBack', 8, 27, 461, 10009])) return 'back';
  if (matches(event, ['MediaPlayPause', 179])) return 'playpause';
  if (matches(event, ['MediaPlay', 415])) return 'play';
  if (matches(event, ['MediaPause', 19])) return 'pause';
  if (matches(event, ['MediaFastForward', 417, 228])) return 'ff';
  if (matches(event, ['MediaRewind', 412, 227])) return 'rw';
  if (matches(event, ['ChannelUp', 'PageUp', 33, 427])) return 'channelup';
  if (matches(event, ['ChannelDown', 'PageDown', 34, 428])) return 'channeldown';
  if (matches(event, ['ContextMenu', 'Menu', 'Apps', 93])) return 'menu';
  if (matches(event, ['BrowserHome', 'Home', 36, 172])) return 'home';
  if (matches(event, ['Info', 'MediaInfo', 'Display', 457])) return 'info';
  if (matches(event, ['Search', 'BrowserSearch', 170])) return 'search';

  return null;
}

export class RemoteControl {
  constructor() {
    this.listeners = new Set();
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  start() {
    document.addEventListener('keydown', this.handleKeydown, true);
  }

  stop() {
    document.removeEventListener('keydown', this.handleKeydown, true);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handleKeydown(event) {
    const action = mapRemoteAction(event);
    if (!action) return;

    if (isTypingElement(document.activeElement) && ['left', 'right', 'up', 'down'].includes(action)) {
      return;
    }

    event.preventDefault();

    const listeners = Array.from(this.listeners).reverse();
    for (const listener of listeners) {
      if (listener(action, event) === true) break;
    }
  }
}
