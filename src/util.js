export const qs = (selector, scope = document) => scope?.querySelector?.(selector) || null;

export const qsa = (selector, scope = document) =>
  Array.from(scope?.querySelectorAll?.(selector) || []);

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value = '') {
  return String(value || '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

export function debounce(fn, delay = 120) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

export function nowClock(locale = 'tr-TR') {
  const now = new Date();
  return {
    date: new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(now),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(now),
  };
}

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function humanError(message = '', fallback = 'Bilinmeyen hata') {
  const text = String(message || '').trim();
  if (!text) {
    return fallback;
  }

  return text;
}

export function isLocalRuntime() {
  const protocol = window.location.protocol;
  const host = window.location.hostname.toLowerCase();

  return (
    protocol === 'file:' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  );
}

export function isTvUserAgent() {
  return /smart-tv|smarttv|tizen|webos|hbbtv|viera|netcast|googletv|appletv|aft|roku/i.test(
    navigator.userAgent,
  );
}

export function playbackProfile(runtime = {}, item = {}) {
  if (runtime.playbackProfile) {
    return runtime.playbackProfile;
  }

  if (isLocalRuntime() && item.kind === 'live') {
    return 'local';
  }

  if (isTvUserAgent() && window.location.protocol !== 'https:') {
    return 'local';
  }

  return 'cloud';
}

export function mediaRank(type = '', profile = 'cloud') {
  const ranks = profile === 'local'
    ? { mpegts: 0, hls: 1, mp4: 2, native: 3, mkv: 4 }
    : { hls: 0, mp4: 1, native: 2, mpegts: 3, mkv: 4 };

  return ranks[String(type || '').toLowerCase()] ?? 99;
}

export function normalizeMediaType(type = '', url = '') {
  const normalized = String(type || '').toLowerCase();

  if (normalized) {
    return normalized;
  }

  const candidate = String(url || '').toLowerCase();

  if (candidate.includes('.m3u8')) return 'hls';
  if (candidate.includes('.ts')) return 'mpegts';
  if (candidate.includes('.mp4')) return 'mp4';
  if (candidate.includes('.mkv')) return 'mkv';

  return 'native';
}

export function uniqueBy(items = [], resolveKey) {
  const seen = new Set();
  const next = [];

  for (const item of items) {
    const key = resolveKey(item);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(item);
  }

  return next;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}
