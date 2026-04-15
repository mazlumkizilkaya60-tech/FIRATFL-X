export const qs = (selector, scope = document) => scope.querySelector(selector);
export const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

export function escapeHtml(value = '') {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
    date: new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'short' }).format(now),
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now)
  };
}

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function humanError(message = '', fallback = 'Bilinmeyen hata') {
  const text = String(message || '').trim();
  if (!text) return fallback;
  return text;
}

export function mediaRank(type = '') {
  const map = { hls: 0, mp4: 1, native: 2, mpegts: 3, mkv: 4 };
  return map[type] ?? 99;
}
