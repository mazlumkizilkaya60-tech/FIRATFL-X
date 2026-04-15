function parseAttributes(fragment = '') {
  const attributes = {};
  const pattern = /([\w-]+)="([^"]*)"/g;
  for (const match of fragment.matchAll(pattern)) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

export function tryParseXtreamCredentials(url = '') {
  try {
    const parsed = new URL(url, window.location.href);
    if (!parsed.pathname.endsWith('/get.php')) return null;
    const username = parsed.searchParams.get('username');
    const password = parsed.searchParams.get('password');
    if (!username || !password) return null;
    return {
      type: 'xtream',
      baseUrl: `${parsed.protocol}//${parsed.host}`,
      username,
      password,
      epgUrl: parsed.searchParams.get('url-tvg') || ''
    };
  } catch (error) {
    return null;
  }
}

export function parseM3u(text = '', originUrl = '') {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const channels = [];
  let currentMeta = null;
  let discoveredEpg = '';

  lines.forEach((line) => {
    if (line.startsWith('#EXTM3U')) {
      discoveredEpg = parseAttributes(line)['x-tvg-url'] || '';
      return;
    }

    if (line.startsWith('#EXTINF')) {
      const [, fragment = '', title = 'Unnamed Channel'] = line.match(/^#EXTINF:[^ ]+\s?(.*?),(.*)$/) || [];
      const attributes = parseAttributes(fragment);
      currentMeta = {
        title: title.trim(),
        group: attributes['group-title'] || 'General',
        logo: attributes['tvg-logo'] || '',
        tvgId: attributes['tvg-id'] || '',
        tvgName: attributes['tvg-name'] || ''
      };
      return;
    }

    if (line.startsWith('#')) return;

    channels.push({
      id: currentMeta?.tvgId || `${currentMeta?.title || 'channel'}-${channels.length + 1}`,
      number: String(100 + channels.length + 1),
      title: currentMeta?.title || `Channel ${channels.length + 1}`,
      group: currentMeta?.group || 'General',
      logo: currentMeta?.logo || '',
      tvgId: currentMeta?.tvgId || '',
      tvgName: currentMeta?.tvgName || '',
      streamUrl: line,
      detectedXtream: tryParseXtreamCredentials(originUrl) || tryParseXtreamCredentials(line)
    });
    currentMeta = null;
  });

  return {
    epgUrl: discoveredEpg,
    xtreamCandidate: channels.find((channel) => channel.detectedXtream)?.detectedXtream ?? null,
    channels
  };
}
