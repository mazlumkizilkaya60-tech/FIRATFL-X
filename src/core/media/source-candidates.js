import { uniqueBy } from '../utils/collections.js';
import { detectSourceType } from './media-capabilities.js';

function swapExtension(url, nextExtension) {
  return url.replace(/\.(m3u8|ts|mp4|mkv)(\?.*)?$/i, `.${nextExtension}$2`);
}

export function buildSourceCandidates(item = {}) {
  const explicit = (item.sourceCandidates ?? []).map((candidate, index) => ({
    id: candidate.id ?? `${item.id ?? 'source'}-${index}`,
    label: candidate.label ?? `Kaynak ${index + 1}`,
    url: candidate.url,
    type: candidate.type ?? detectSourceType(candidate.url),
    credentials: candidate.credentials
  }));

  const baseUrl = item.streamUrl || item.previewUrl;
  const fallback = [];

  if (baseUrl) {
    const primaryType = detectSourceType(baseUrl);

    if (/\.(ts)(\?|$)/i.test(baseUrl)) {
      fallback.push({
        id: `${item.id ?? 'source'}-primary`,
        label: 'Primary',
        url: baseUrl,
        type: primaryType,
        credentials: item.credentials
      });
      fallback.push({
        id: `${item.id ?? 'source'}-hls`,
        label: 'HLS varyant',
        url: swapExtension(baseUrl, 'm3u8'),
        type: 'hls',
        credentials: item.credentials
      });
    }

    if (/\.(m3u8)(\?|$)/i.test(baseUrl)) {
      if (item.kind === 'live') {
        fallback.push({
          id: `${item.id ?? 'source'}-mpegts-primary`,
          label: 'MPEG-TS primary',
          url: swapExtension(baseUrl, 'ts'),
          type: 'mpegts',
          credentials: item.credentials
        });
      }

      fallback.push({
        id: `${item.id ?? 'source'}-primary`,
        label: 'Primary',
        url: baseUrl,
        type: primaryType,
        credentials: item.credentials
      });

      fallback.push({
        id: `${item.id ?? 'source'}-mpegts`,
        label: 'MPEG-TS varyant',
        url: swapExtension(baseUrl, 'ts'),
        type: 'mpegts',
        credentials: item.credentials
      });
    }

    if (!/\.(m3u8|ts)(\?|$)/i.test(baseUrl)) {
      fallback.push({
        id: `${item.id ?? 'source'}-primary`,
        label: 'Primary',
        url: baseUrl,
        type: primaryType,
        credentials: item.credentials
      });
    }
  }

  return uniqueBy([...explicit, ...fallback].filter((candidate) => candidate?.url), (candidate) => candidate.url);
}
