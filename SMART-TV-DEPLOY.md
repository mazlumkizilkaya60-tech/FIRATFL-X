# Smart TV Deploy

## Hizli Ozet

Bu repo artik iki farkli modla calisabilir:

- `hosted web app + Netlify proxy`
- `TV packaged shell + remote backendBaseUrl`

Artik `http://` IPTV source icin tek sansiniz source degistirmek degil; backend relay de var.

## Netlify deploy

1. Reponuzu Netlify'ye baglayin.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Functions directory: `netlify/functions`

Bu repoda `netlify.toml` zaten hazir.

## Proxy davranisi

- frontend `/api/proxy` endpoint'ini kullanir
- Netlify bunu `/.netlify/functions/proxy` fonksiyonuna yonlendirir
- HLS manifestleri proxy icinde rewrite edilir
- TS, MP4, M3U, XMLTV ve Xtream metadata ayni origin uzerinden akar

## Uretim

1. `tv.config.example.json` dosyasini `tv.config.json` olarak kopyalayin.
2. `hostedAppUrl` alanina public app URL'nizi yazin.
3. `backendBaseUrl` alanina Netlify backend originini yazin.
4. `allowedOrigins` listesine hosted originlerinizi ekleyin.
5. `npm run build:smart-tv`

## Uretilen klasorler

- `tv-build/tizen-packaged`
- `tv-build/tizen-hosted-lab`
- `tv-build/webos-packaged`
- `tv-build/webos-hosted-lab`
- `tv-build/android-tv-hosted-notes`

## TV shell notu

Packaged TV shell'lerde `runtime-config.js` otomatik uretilir. Bu dosya:

- `backendBaseUrl`
- `proxyMode`

ayarlarini TV build icine yazar. Boylece packaged shell, remote Netlify backend'ine baglanabilir.
