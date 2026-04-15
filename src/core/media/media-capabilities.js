const hlsPromise = { current: null };
const mpegtsPromise = { current: null };

export function detectSourceType(url = '') {
  const normalized = String(url).toLowerCase();
  if (normalized.includes('.m3u8')) return 'hls';
  if (normalized.includes('.ts')) return 'mpegts';
  return 'native';
}

export function canUseNativeHls(video) {
  return Boolean(video?.canPlayType?.('application/vnd.apple.mpegurl'));
}

export async function loadHls() {
  if (!hlsPromise.current) {
    hlsPromise.current = import('hls.js').then((module) => module.default ?? module);
  }
  return hlsPromise.current;
}

export async function loadMpegts() {
  if (!mpegtsPromise.current) {
    mpegtsPromise.current = new Promise((resolve, reject) => {
      if (window.mpegts) {
        resolve(window.mpegts);
        return;
      }

      const existing = document.querySelector('script[data-lib="mpegts"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.mpegts));
        existing.addEventListener('error', () => reject(new Error('mpegts.js yüklenemedi.')));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.min.js';
      script.async = true;
      script.dataset.lib = 'mpegts';
      script.onload = () => resolve(window.mpegts);
      script.onerror = () => reject(new Error('mpegts.js CDN yüklemesi başarısız oldu.'));
      document.head.appendChild(script);
    });
  }
  return mpegtsPromise.current;
}
