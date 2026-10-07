# Panduan Instalasi — Kasir Festival Literasi IPB Press (v2)

Aplikasi ini terdiri dari **dua bagian** yang dipasang di dua tempat berbeda:

| Bagian | Isi | Dipasang di |
|---|---|---|
| Backend | `Kode.gs` | Google Apps Script (data tetap di Google Sheets) |
| Frontend | folder `kasir-feslit-ipbpress` (dari ZIP) | GitHub Pages |

Urutannya: **backend dulu** (supaya punya URL), baru frontend.

---

## BAGIAN A — Backend (Google Apps Script)

1. Buka <https://script.google.com> dan buka proyek kasir Anda yang lama.
   (Proyek baru juga boleh. Kalau pakai proyek lama, data Sheets Anda tetap dipakai.)
2. Buka berkas `Kode.gs` → **hapus seluruh isinya** → tempel isi `Kode.gs` yang baru → **Save**.
3. Hapus berkas `Index`, `JavaScript`, dan `Stylesheet` (HTML) dari proyek Apps Script. Tampilan sekarang ada di GitHub, jadi berkas itu tidak terpakai lagi.
4. Pilih fungsi **`setupAppEnvironment`** di dropdown → **▶ Run** (izinkan akses Drive & Sheets bila diminta).
   - Aman dijalankan di proyek lama: sheet yang sudah ada tidak ditimpa.
   - Akun bawaan baru: `admin@ipbpress.com / admin123` dan `kasir1@ipbpress.com / kasir123`. **Ganti passwordnya setelah login pertama.**
5. Pilih fungsi **`isiDataDummy`** → **▶ Run**. Ini menambah **10 buku** dan **10 transaksi** contoh (tersebar 4 hari terakhir, campuran POS/NON POS, Cash/QRIS/EDC, beberapa berdiskon).
   - Aman dijalankan ulang (buku tidak ganda, transaksi tidak dibuat dua kali).
   - Ingin menghapus data contoh sebelum festival? Jalankan **`hapusDataDummy`**. Data asli tidak tersentuh.
6. **Deploy → New deployment → ⚙ Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - Klik **Deploy** → **salin URL yang berakhiran `/exec`**.
7. Tes: buka URL `/exec` itu di browser. Harus muncul teks JSON `"API aktif"`.

> Sudah punya deployment lama? Pakai **Deploy → Manage deployments → ✏ → Version: New version → Deploy**. URL-nya tetap sama.
> Setiap kali `Kode.gs` diubah, deployment harus diperbarui seperti ini.

> **Soal akses "Anyone":** GitHub Pages butuh itu agar bisa memanggil backend. Pengamannya ada di lapisan aplikasi: semua aksi butuh token login (berlaku 6 jam), peran Kasir/Admin diperiksa **di server**, dan password disimpan sebagai hash. Karena itu, pakai password yang kuat. Batasan "hanya pengguna IPB" di PRD tidak bisa dipertahankan dengan arsitektur ini.

---

## BAGIAN B — Frontend (siapkan sebelum push)

1. Ekstrak `kasir-feslit-ipbpress.zip`. Hasilnya satu folder bernama **`kasir-feslit-ipbpress`**, dan **folder inilah yang nanti di-`git init`**.
2. Buka `js/config.js` dengan Notepad. Ganti tulisan `GANTI_DENGAN_URL_EXEC_APPS_SCRIPT` dengan URL `/exec` dari langkah A6. Simpan.
3. **Foto latar login (disarankan):** ikuti `img/LETAKKAN-FOTO-LOGIN-DI-SINI.txt`. Unduh foto dari Unsplash, simpan sebagai `img/login-bg.jpg`.
   - Tanpa file itu, halaman login mencoba memuat foto yang sama langsung dari Unsplash, lalu cadangan terakhirnya latar biru gradien.

---

## BAGIAN C — Push ke GitHub dan aktifkan Pages

Prasyarat: Git terpasang (`git --version`) dan akun GitHub. Belum punya? Lihat <https://git-scm.com/downloads> dan <https://github.com>.

**1. Identitas Git (sekali per komputer):**
```
git config --global user.name "Nama Anda"
git config --global user.email "email@akun-github-anda.com"
```

**2. Buat repository kosong di GitHub:** tombol **+ → New repository** → nama bebas (misal `kasir-feslit`) → **Public** → **jangan centang** README/.gitignore/license → Create.

**3. Masuk ke folder yang benar.** Di File Explorer buka folder `kasir-feslit-ipbpress`, klik address bar, ketik `powershell`, Enter. Lalu cek:
```
dir
```
Yang **harus terlihat**: `index.html`, `css`, `js`, `img`. Kalau yang terlihat justru folder lain (satu tingkat di atasnya), Anda salah folder — masuk dulu ke `kasir-feslit-ipbpress`. Jangan lanjut sebelum `index.html` terlihat.

**4. Push pertama (satu per satu):**
```
git init
git add .
git commit -m "Upload pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```
Ganti `USERNAME` dan `NAMA-REPO`. Saat diminta password, tempel **Personal Access Token** (bukan password akun): <https://github.com/settings/tokens> → *Generate new token (classic)* → centang **repo**. Saat menempel, layar tampak kosong — itu normal.

**5. Aktifkan Pages:** repo → **Settings → Pages** → *Source*: **Deploy from a branch** → Branch **main** / **(root)** → Save. Tunggu 1–2 menit, lalu buka `https://USERNAME.github.io/NAMA-REPO/`.

**Update di kemudian hari** (dari folder yang sama):
```
git add .
git commit -m "Keterangan perubahan"
git push
```
Kalau tampilan lama masih muncul: **Ctrl+Shift+R**.

---

## BAGIAN D — Uji coba

1. Buka situs → login `kasir1@ipbpress.com / kasir123`. Dashboard harus menampilkan angka dari 10 transaksi contoh.
2. Menu **Kasir** harus menampilkan 10 buku dummy + 1 buku bawaan.
3. **Uji scan:** di laptop buka `https://USERNAME.github.io/NAMA-REPO/uji-barcode.html` (10 barcode ISBN yang cocok dengan data dummy). Di HP, buka situs kasir → **Scan Barcode** → arahkan kamera ke layar laptop. Buku masuk keranjang dengan bunyi "bip".
4. **Scanner USB/Bluetooth** (mode keyboard, kebanyakan scanner murah): colok, buka halaman Kasir, scan. Tidak perlu pengaturan.
5. Scan barcode yang belum ada di katalog → muncul tawaran menambah produk baru, ISBN sudah terisi.
6. Login Admin → cek menu **Kasir/User** dan **Pengaturan**, serta tombol edit/hapus di **Transaksi**.

**Cara kerja scan:** kode dicocokkan dengan kolom **ISBN** (strip/spasi diabaikan) atau `id_produk` di katalog. Barcode di belakang buku Indonesia umumnya EAN-13 yang sama dengan ISBN-nya. Pastikan ISBN di Katalog terisi.

---

## Pemecahan masalah

| Gejala | Penyebab | Solusi |
|---|---|---|
| Login: "GAS_URL belum diisi" | `js/config.js` belum diedit | Isi URL `/exec`, lalu `git add . && git commit -m "isi url" && git push` |
| Login: "Tidak dapat terhubung ke server" | Deployment bukan **Anyone**, URL salah, atau belum deploy versi baru | Cek langkah A6/A7; buka URL `/exec` di tab Incognito, harus tampil JSON |
| Halaman polos tanpa gaya, console 404 | Folder yang di-push salah / file rata di root | Pastikan `dir` menampilkan `css`, `js`, `img` sebelum `git init` |
| Situs 404 | `index.html` tidak di root repo | Buka repo di GitHub; kalau `index.html` tidak terlihat di daftar teratas, push ulang dari folder yang benar |
| Tombol Scan: "izin kamera ditolak" | Izin kamera diblokir | Ikon gembok di address bar → Kamera → Izinkan |
| Kamera tidak mau menyala | Situs dibuka lewat HTTP | Pakai alamat `https://…github.io` (kamera hanya jalan di HTTPS) |
| Barcode terbaca tapi "tidak dikenal" | ISBN di Katalog kosong/beda | Samakan ISBN di menu Katalog Buku dengan angka barcode |
| "Sesi berakhir" | Token berlaku 6 jam | Login ulang |
| Setelah update `Kode.gs`, perilaku tetap lama | Deployment belum diperbarui | A6: *New version* lalu Deploy |
| Foto login tidak muncul | `img/login-bg.jpg` belum ada dan Unsplash memblokir hotlink | Simpan foto sebagai `img/login-bg.jpg` lalu push |

## Catatan perubahan dari versi lama
- Tampilan dipisah ke GitHub Pages; Apps Script kini hanya REST API (tanpa `HtmlService`/`google.script.run`).
- Baru: scan barcode (kamera, scanner USB, ketik ISBN), halaman login baru, sampul buku di kartu produk, data dummy, halaman `uji-barcode.html`.
- Keamanan: token sesi, pengecekan peran di server, password di-hash (akun lama dengan password teks biasa tetap bisa login; password otomatis ter-hash saat diubah lewat menu Kasir/User).
- Perbaikan: baris `Detail_Transaksi` kini ditulis berdasarkan nama kolom (versi lama menulis 8 nilai ke sheet 9 kolom sehingga bisa bergeser); nomor `id_produk` aman setelah ada penghapusan; ISBN ganda ditolak; filter tanggal mencakup seluruh hari terakhir.
