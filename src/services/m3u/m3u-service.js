import { maybeProxyUrl } from '../../core/network/proxy.js';
import { parseM3u } from './m3u-parser.js';

async function fetchPlaylist(url, source, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    const response = await fetch(maybeProxyUrl(url, source), {
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Playlist alınamadı (${response.status})`);
    }
    return response.text();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Playlist isteği zaman aşımına uğradı.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function loadM3uSource(source) {
  const parsed = parseM3u(await fetchPlaylist(source.playlistUrl, source), source.playlistUrl);
  const categories = [];
  const seenCategories = new Set();

  parsed.channels.forEach((channel) => {
    const label = channel.group || 'General';
    const id = label;
    if (seenCategories.has(id)) return;
    seenCategories.add(id);
    categories.push({ id, label });
  });

  return {
    sourceType: 'm3u',
    sourceLabel: source.label,
    hero: {
      eyebrow: 'Playlist Source',
      title: source.label,
      summary: 'M3U playlist üzerinden normalize edilen canlı yayın kataloğu.',
      primaryAction: { label: 'Canlı TV', route: 'live' }
    },
    featured: parsed.channels.slice(0, 5),
    categories: {
      movies: [],
      series: [],
      live: categories
    },
    movies: [],
    series: [],
    live: parsed.channels.map((channel) => ({
      ...channel,
      kind: 'live',
      categoryId: channel.group || 'General',
      category: channel.group || 'General',
      description: 'M3U playlist kanal kaydı',
      poster: channel.logo || '',
      logo: channel.logo || '',
      rawStreamUrl: channel.streamUrl,
      streamUrl: maybeProxyUrl(channel.streamUrl, source)
    })),
    discoveredEpgUrl: source.epgUrl || parsed.epgUrl || '',
    discoveredXtream: parsed.xtreamCandidate || null
  };
}
