# Kasir Festival Literasi IPB Press (v2)

Aplikasi kasir (POS) bazar buku. Frontend statis (HTML/CSS/JS) di GitHub Pages,
backend Google Apps Script + Google Sheets sebagai REST API.

## Struktur
```
index.html          halaman aplikasi
uji-barcode.html    10 barcode untuk uji coba scan
css/style.css
js/config.js        <- isi GAS_URL di sini
js/api.js           jembatan fetch ke Apps Script
js/scanner.js       scan barcode (kamera, scanner USB, ketik ISBN)
js/app.js           logika aplikasi
img/                taruh login-bg.jpg (foto latar login)
```

## Pasang
Ikuti `PANDUAN-INSTALASI.md`. Singkatnya: pasang `Kode.gs` di Apps Script (jalankan
`setupAppEnvironment` lalu `isiDataDummy`), deploy sebagai Web App, tempel URL `/exec`
ke `js/config.js`, lalu push ke GitHub dan aktifkan Pages.
