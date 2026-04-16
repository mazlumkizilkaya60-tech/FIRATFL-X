# FIRATFLIX hardening replacement set

Bu paket, GitHub `main` dalındaki sadeleştirilmiş source üstüne uygulanmak üzere hazırlanmış replacement dosyaları içerir.

## Değiştirilen dosyalar
- `src/api.js`
- `src/util.js`
- `src/focus.js`
- `src/player.js`
- `src/app.js`

## Amaç
- Demo fallback kullanmamak
- Varsayılan source mantığını korumak
- TV-safe focus ve render akışını sertleştirmek
- Local/LAN ve Cloud/HTTPS için farklı playback sıralaması kullanmak
- HLS first cloud, MPEG-TS first local fallback davranışı vermek
- Oynatıcıda görünür hata bırakmak, mavi/boş ekran bırakmamak

## Not
Mevcut `main` dalı, önceki çok katmanlı TV UI kaynak ağacını (`src/app`, `src/pages`, `src/components` vb.) artık içermiyor. Bu replacement set, güncel sadeleştirilmiş UI kabuğunu bozmadan motoru sertleştirmeye odaklanır.
