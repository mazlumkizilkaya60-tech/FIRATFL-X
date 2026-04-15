import { maybeProxyUrl } from '../../core/network/proxy.js';
import { clamp } from '../../core/utils/dom.js';
import { parseXmltv } from './xmltv-parser.js';

function matchChannel(channel, epg) {
  const candidates = [channel.id, channel.number, channel.title, channel.tvgId, channel.tvgName]
    .filter(Boolean)
    .map((value) => String(value).toLocaleLowerCase('tr-TR'));

  return epg.channels.find((entry) => {
    const names = [entry.id, ...(entry.names ?? [])]
      .filter(Boolean)
      .map((value) => String(value).toLocaleLowerCase('tr-TR'));
    return candidates.some((value) => names.includes(value));
  });
}

async function fetchEpgText(url, source, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    const response = await fetch(maybeProxyUrl(url, source), {
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`EPG alınamadı (${response.status})`);
    }
    return response.text();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('EPG isteği zaman aşımına uğradı.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function loadEpg(url, source) {
  return parseXmltv(await fetchEpgText(url, source));
}

export function mergeEpg(liveChannels = [], epg, now = new Date()) {
  return liveChannels.map((channel) => {
    const matched = matchChannel(channel, epg);
    if (!matched) {
      return {
        ...channel,
        nowProgram: null,
        nextProgram: null,
        progress: 0
      };
    }

    const programmes = epg.programmes
      .filter((programme) => programme.channel === matched.id)
      .sort((left, right) => left.start - right.start);
    const nowProgram = programmes.find((programme) => programme.start <= now && programme.stop > now) ?? null;
    const nextProgram = programmes.find((programme) => programme.start > now) ?? null;
    const progress = nowProgram
      ? clamp(((now - nowProgram.start) / (nowProgram.stop - nowProgram.start)) * 100, 0, 100)
      : 0;

    return {
      ...channel,
      nowProgram,
      nextProgram,
      progress
    };
  });
}
