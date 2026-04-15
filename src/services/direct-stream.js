// Python versiyonundaki direct_stream.py'yi JavaScript'e çevir
export function choosePlayback(proxyUrl, rawUrl) {
  // If proxy fails or mkv large file, player may fallback to direct stream
  if (rawUrl && rawUrl.endsWith('.mkv')) {
    return rawUrl;
  }
  return proxyUrl || rawUrl;
}

export function shouldUseDirectStream(url) {
  // MKV dosyaları için direct stream kullan
  return url && url.endsWith('.mkv');
}