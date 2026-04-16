# FIRATFLIX hardening report

Bu teslim, kullanıcı brief’ine göre “aynı yüz, daha sağlam motor” hedefiyle hazırlandı; ancak GitHub `main` dalında önceki kapsamlı TV-first kaynak ağacı artık görünmediği için çalışma güncel sadeleştirilmiş source üstüne yapıldı.

## Değiştirilen dosya listesi
- `src/api.js`
- `src/util.js`
- `src/focus.js`
- `src/player.js`
- `src/app.js`

## Her dosyada ne değişti
### `src/api.js`
- Tüm JSON istekleri timeout’lu ve standart hata nesnesi döndürecek hale getirildi.
- Varsayılan ve manuel source çağrıları korunurken istemci tarafı hata akışı sertleştirildi.

### `src/util.js`
- HTML escape bug’ı düzeltildi.
- Local runtime, TV user-agent ve playback profile yardımcıları eklendi.
- Medya tipi normalizasyonu ve candidate sıralama yardımcıları tek yerde toplandı.

### `src/focus.js`
- Scope yönetimi ve görünür selector filtreleme daha güvenli hale getirildi.
- TV yön tuşu geçişleri daha kararlı hale getirildi.

### `src/player.js`
- Local/LAN ve Cloud/HTTPS için farklı candidate sıralaması uygulandı.
- HLS, native ve MPEG-TS attach akışları ayrıldı.
- Muted autoplay fallback, audio track cycle, fullscreen, live channel digit jump ve görünür hata overlay eklendi.
- Fatal durumda sonraki candidate deneme mantığı güçlendirildi.

### `src/app.js`
- Mevcut sayfa akışı (`home/live/movies/series/detail/player`) korundu.
- Bootstrap, render ve source form akışı daha güvenli hale getirildi.
- Demo fallback eklenmedi; hata durumunda görünür retry/source panel davranışı korundu.
- Focus refresh ve player lifecycle temizlendi.

## Korunan UI parçaları
- Sol sidebar + saat
- Home / Live / Movies / Series / Detail / Player akışı
- Kaynak ayarları paneli
- Player üst bar, alt kontrol sırası ve debug/info mantığı
- TV odaklı selector/focus hissi

## Yeniden kurulan mimari katmanları
- Presentation: `src/app.js`
- TV focus safety: `src/focus.js`
- Transport/API boundary: `src/api.js`
- Player engine: `src/player.js`
- Shared helpers/runtime detection: `src/util.js`

## Default source yapısı
- Varsayılan source halen server-side endpoint üzerinden yüklenir.
- Manuel source localStorage ile geçici override eder.
- Demo fallback kullanılmaz.

## Proxy / redirect stratejisi
- Mevcut `server.js` zaten `/api/resolve-media` ve `/api/proxy` üzerinden final URL çözümü, redirect takibi ve proxy akışını yapıyor.
- Bu teslimde client tarafı artık player’a kör URL vermek yerine çözülmüş media sonucuna göre oynatma kararı alır.

## Player stratejisi
- Local/LAN/TV: MPEG-TS önce, HLS ikinci fallback
- Cloud/HTTPS: HLS önce, MP4/native ikinci, MPEG-TS son fallback
- Autoplay engelinde muted autoplay denenir
- Fatal durumda overlay ve kontroller görünür kalır

## TV stabilite stratejisi
- Focus scope daha güvenli
- Player destroy/reset daha güvenli
- Boş ekran yerine error pane / player error overlay
- Live digit jump ve channel switch korundu

## Render deploy ayarları
- Güncel `main` dalındaki Node web service yaklaşımı korunur.
- `server.js` + `render.yaml` tarafı zaten Render Web Service odaklıdır.
- Bu teslimde deploy yerine istemci tarafı stabilizasyonu yapıldı.

## Son test checklist’i
- Varsayılan source ile açılış
- Manuel Xtream source yükleme
- Manuel M3U source yükleme
- Live oynatma HLS
- Local ağda MPEG-TS fallback
- HLS hata verince ikinci candidate
- Ses izi değiştirme
- Mute / fullscreen / seek
- TV yön tuşları ve enter
- Player’dan back ile live’a dönüş
- Kaynak başarısız olduğunda error pane + retry
