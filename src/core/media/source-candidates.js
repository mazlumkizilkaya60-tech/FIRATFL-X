import { uniqueBy } from '../utils/collections.js';
import { maybeProxyUrl } from '../network/proxy.js';
import { detectSourceType } from './media-capabilities.js';

function swapExtension(url, nextExtension) {
  return String(url).replace(/\.(m3u8|ts|mp4|mkv)(\?.*)?$/i, `.${nextExtension}$2`);
}

function buildProxyContext(item = {}, candidate = {}) {
  return {
    ...item,
    credentials: candidate.credentials || item.credentials || null,
    username:
      item.username ||
      candidate.username ||
      candidate.credentials?.username ||
      item.credentials?.username ||
      '',
    password:
      item.password ||
      candidate.password ||
      candidate.credentials?.password ||
      item.credentials?.password ||
      '',
  };
}

function decorateCandidate(item, candidate, index) {
  const context = buildProxyContext(item, candidate);
  const originalUrl = candidate?.url || '';

  return {
    id: candidate.id ?? `${item.id ?? 'source'}-${index}`,
    label: candidate.label ?? `Kaynak ${index + 1}`,
    url: maybeProxyUrl(originalUrl, context),
    type: candidate.type ?? detectSourceType(originalUrl),
    credentials: candidate.credentials ?? item.credentials,
  };
}

export function buildSourceCandidates(item = {}) {
  const explicit = (item.sourceCandidates ?? []).map((candidate, index) =>
    decorateCandidate(item, candidate, index),
  );

  const baseUrl = item.streamUrl || item.previewUrl || '';
  const fallback = [];

  if (baseUrl) {
    const primaryType = detectSourceType(baseUrl);

    fallback.push({
      id: `${item.id ?? 'source'}-primary`,
      label: 'Primary',
      url: baseUrl,
      type: primaryType,
      credentials: item.credentials,
    });

    if (/\.(ts)(\?|$)/i.test(baseUrl)) {
      fallback.push({
        id: `${item.id ?? 'source'}-hls`,
        label: 'HLS varyant',
        url: swapExtension(baseUrl, 'm3u8'),
        type: 'hls',
        credentials: item.credentials,
      });
    }

    if (/\.(m3u8)(\?|$)/i.test(baseUrl) && item.kind === 'live') {
      fallback.push({
        id: `${item.id ?? 'source'}-mpegts`,
        label: 'MPEG-TS varyant',
        url: swapExtension(baseUrl, 'ts'),
        type: 'mpegts',
        credentials: item.credentials,
      });
    }
  }

  return uniqueBy(
    [...explicit, ...fallback]
      .filter((candidate) => candidate?.url)
      .map((candidate, index) => decorateCandidate(item, candidate, index)),
    (candidate) => candidate.url,
  );
      }
