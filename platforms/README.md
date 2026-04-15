# Smart TV Targets

Bu klasor ortak web uygulamasinin TV dagitim stratejisini aciklar. Gercek package ciktilari `npm run build:smart-tv` sonrasi `tv-build/` altina uretilir.

Hedefler:

- `tizen-packaged`
- `tizen-hosted-lab`
- `webos-packaged`
- `webos-hosted-lab`
- `android-tv-hosted-notes`

Temel kural:

- `free host` sadece ortak web app dosyalarini sunar
- IPTV source `http://` ise HTTPS host altinda browser yine bloklar
- Samsung ve LG tarafinda uzun vadede packaged app daha guvenilir
