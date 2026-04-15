# Android TV

Bu repo su anda Android TV icin hosted web shell notlarini uretir, tam APK degil.

Sebep:

- Android TV playback tarafinda en saglam yol `Media3 ExoPlayer` tabanli APK'dir.
- Hosted web uygulama, browser CORS ve mixed-content limitlerine takilir.

Kisa yol:

- Hızli test icin hosted URLyi Android TV browserda acabilirsiniz.
- Gercek urun dagitimi icin sonraki adimda native Android TV shell + ExoPlayer kurmak gerekir.
