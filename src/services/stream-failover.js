// Python versiyonundaki stream_failover.py'yi JavaScript'e çevir
export function chooseStream(primary, backups = []) {
  const streams = [primary, ...backups].filter(s => s && s.trim());
  return streams[0] || primary;
}

export function validateStreamUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}