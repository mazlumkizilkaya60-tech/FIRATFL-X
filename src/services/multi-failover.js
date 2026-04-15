// Python versiyonundaki multi_failover.py'yi JavaScript'e çevir
export function nextStream(streams, current) {
  if (!streams.includes(current)) {
    return streams[0];
  }

  const i = streams.indexOf(current);
  if (i + 1 < streams.length) {
    return streams[i + 1];
  }

  return streams[0];
}

export function getStreamCandidates(primaryUrl, backupUrls = []) {
  const candidates = [primaryUrl];

  if (backupUrls && backupUrls.length > 0) {
    candidates.push(...backupUrls);
  }

  return candidates.filter(url => url && url.trim());
}