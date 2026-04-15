import { clamp } from './dom.js';

export function formatClock(date = new Date(), locale = 'tr-TR') {
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDateLabel(date = new Date(), locale = 'tr-TR') {
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });
}

export function formatDuration(valueMinutes = 0, language = 'tr') {
  if (!valueMinutes) return language === 'en' ? 'Unknown' : 'Bilinmiyor';
  const hours = Math.floor(valueMinutes / 60);
  const minutes = valueMinutes % 60;

  if (language === 'en') {
    if (!hours) return `${minutes} min`;
    if (!minutes) return `${hours} hr`;
    return `${hours} hr ${minutes} min`;
  }

  if (!hours) return `${minutes} dk`;
  if (!minutes) return `${hours} sa`;
  return `${hours} sa ${minutes} dk`;
}

export function formatRuntimeSeconds(seconds = 0) {
  if (!Number.isFinite(seconds)) return '00:00';
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;

  if (hours > 0) {
    return [hours, minutes, remainder]
      .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
      .join(':');
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function formatPercent(value = 0) {
  return `${Math.round(clamp(value, 0, 100))}%`;
}

export function humanizeError(error, language = 'tr') {
  if (!error) return language === 'en' ? 'An unexpected issue occurred.' : 'Beklenmeyen bir sorun oluştu.';
  if (typeof error === 'string') return error;

  const message = error.message || error.statusText || '';

  if (/401|unauthorized/i.test(message)) {
    return language === 'en'
      ? 'The source requires authorization or rejected the session credentials.'
      : 'Kaynak yetki istiyor ya da oturum bilgisi reddedildi.';
  }

  if (/403|forbidden/i.test(message)) {
    return language === 'en'
      ? 'This source does not allow direct browser access.'
      : 'Bu kaynak tarayıcıdan erişime izin vermiyor.';
  }

  if (/cors/i.test(message)) {
    return language === 'en'
      ? 'The browser cannot read this source directly because of CORS.'
      : 'Tarayıcı bu kaynağı CORS nedeniyle doğrudan okuyamıyor.';
  }

  if (/mixed content|https.*http|insecure/i.test(message)) {
    return language === 'en'
      ? 'This site is running on HTTPS, but the IPTV source uses HTTP. Browsers block that request as mixed content.'
      : 'Site HTTPS üzerinde çalışıyor ama IPTV kaynağı HTTP kullanıyor. Tarayıcı bunu mixed content olarak engelliyor.';
  }

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return language === 'en'
      ? 'The source could not be reached from the browser. This is usually caused by CORS, mixed-content, hotlink protection, or the source being offline.'
      : 'Kaynağa tarayıcıdan ulaşılamadı. Bunun nedeni genelde CORS, mixed-content, hotlink koruması veya kaynağın kapalı olmasıdır.';
  }

  return message || (language === 'en' ? 'An unexpected issue occurred.' : 'Beklenmeyen bir sorun oluştu.');
}

export function normalizeSearchTerm(value = '') {
  return String(value)
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr-TR')
    .trim();
}

export function sentenceCase(value = '') {
  if (!value) return '';
  return value.charAt(0).toLocaleUpperCase('tr-TR') + value.slice(1);
}
