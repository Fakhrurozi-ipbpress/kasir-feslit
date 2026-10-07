/**
 * ============================================================
 * SCAN BARCODE BUKU
 *  1) Kamera HP/laptop  -> modal "Scan Barcode" (library html5-qrcode)
 *  2) Scanner USB/Bluetooth (mode keyboard) -> terbaca otomatis di halaman Kasir
 *  3) Ketik/paste ISBN di kolom pencarian lalu Enter
 * Ketiganya bermuara ke handleScanResult(kode).
 * ============================================================
 */
let html5Scanner = null;
let scannerAktif = false;
let scanTerakhir = { kode: '', waktu: 0 };
let bufferFisik = { teks: '', waktu: 0 };

// ── Bunyi "bip" untuk umpan balik (tanpa file audio) ──
function bip(sukses) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = sukses ? 1040 : 280;
    gain.gain.value = 0.08;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + (sukses ? 0.12 : 0.28));
  } catch (e) { /* perangkat tanpa audio: abaikan */ }
}

function normalisasiKode(teks) {
  return String(teks || '').trim();
}
function hanyaDigit(teks) {
  return String(teks || '').replace(/[^0-9]/g, '');
}

/**
 * Cocokkan kode hasil scan ke produk: ISBN (abaikan strip/spasi) atau id_produk.
 */
function cariProdukDariKode(kode) {
  const mentah = normalisasiKode(kode).toLowerCase();
  const digit = hanyaDigit(kode);
  return produkCache.find(p =>
    (digit.length >= 8 && hanyaDigit(p.ISBN) === digit) ||
    String(p.id_produk || '').toLowerCase() === mentah
  );
}

/** Titik masuk tunggal untuk semua sumber scan. Mengembalikan true bila produk ditemukan. */
function handleScanResult(kode) {
  kode = normalisasiKode(kode);
  if (!kode) return false;

  if (!produkCache || produkCache.length === 0) {
    showToast('Tunggu sebentar', 'Data produk masih dimuat. Scan ulang beberapa detik lagi.', 'warning');
    return false;
  }

  const produk = cariProdukDariKode(kode);
  if (produk) {
    tambahKeKeranjang(produk);
    bip(true);
    showToast('Masuk keranjang', produk.Judul, 'success');
    catatLogScan(kode, produk.Judul, true);
    return true;
  }

  bip(false);
  showToast('Barcode tidak dikenal', 'ISBN ' + kode + ' belum ada di Katalog.', 'warning');
  catatLogScan(kode, 'Belum ada di Katalog', false);
  return false;
}

/** Enter di kolom pencarian: bila isinya angka 8–14 digit, anggap itu barcode. */
function handleSearchEnter(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = document.getElementById('produkSearchInput');
  const nilai = input.value.trim();
  if (hanyaDigit(nilai).length >= 8 && /^[0-9\-\s]+$/.test(nilai)) {
    const ketemu = handleScanResult(nilai);
    if (!ketemu) tawarkanTambahProdukBaru(nilai);
    input.value = '';
    handleProdukSearch();
  }
}

function tawarkanTambahProdukBaru(kode) {
  const digit = hanyaDigit(kode);
  if (confirm('ISBN ' + digit + ' belum terdaftar.\nTambahkan sebagai produk baru sekarang?')) {
    tutupScanner();
    openTambahProdukCepat(digit);
  }
}

// ── Scanner fisik (mode keyboard): karakter datang sangat cepat lalu diakhiri Enter ──
let scannerFisikTerpasang = false;
function aktifkanScannerFisik() {
  if (window.innerWidth >= 992) {
    const el = document.getElementById('produkSearchInput');
    if (el) el.focus();
  }
  if (scannerFisikTerpasang) return;
  scannerFisikTerpasang = true;

  document.addEventListener('keydown', function (e) {
    const kasirAktif = document.getElementById('section-kasir');
    if (!kasirAktif || !kasirAktif.classList.contains('active')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return; // kolom pencarian punya handler sendiri
    if (document.querySelector('.modal.show')) return;

    const sekarang = Date.now();
    if (sekarang - bufferFisik.waktu > 80) bufferFisik.teks = ''; // jeda lama = ketikan manusia
    bufferFisik.waktu = sekarang;

    if (e.key === 'Enter') {
      if (bufferFisik.teks.length >= 8) {
        const kode = bufferFisik.teks;
        bufferFisik.teks = '';
        if (!handleScanResult(kode)) tawarkanTambahProdukBaru(kode);
      }
      return;
    }
    if (e.key.length === 1) bufferFisik.teks += e.key;
  });
}

// ── Scanner kamera ──
function bukaScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    showToast('Scanner belum siap', 'Library kamera gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.', 'danger');
    return;
  }
  const modalEl = document.getElementById('scannerModal');
  document.getElementById('scanStatus').textContent = 'Meminta izin kamera...';
  document.getElementById('scanLog').innerHTML = '';
  scanTerakhir = { kode: '', waktu: 0 };

  modalEl.addEventListener('shown.bs.modal', mulaiKamera, { once: true });
  modalEl.addEventListener('hidden.bs.modal', hentikanKamera, { once: true });
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function mulaiKamera() {
  const status = document.getElementById('scanStatus');
  const F = Html5QrcodeSupportedFormats;
  html5Scanner = new Html5Qrcode('scannerReader', {
    formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false
  });

  html5Scanner.start(
    { facingMode: 'environment' },
    {
      fps: 12,
      qrbox: function (w, h) { return { width: Math.floor(Math.min(w * 0.92, 360)), height: Math.floor(Math.min(h * 0.5, 150)) }; }
    },
    function (teks) {
      const sekarang = Date.now();
      // Kode yang sama dalam 2,5 detik dianggap satu scan (hindari qty bertambah ganda)
      if (teks === scanTerakhir.kode && sekarang - scanTerakhir.waktu < 2500) return;
      scanTerakhir = { kode: teks, waktu: sekarang };
      handleScanResult(teks);
    },
    function () { /* tidak ada barcode di frame: abaikan */ }
  ).then(function () {
    scannerAktif = true;
    status.textContent = 'Arahkan kamera ke barcode di belakang buku. Boleh scan beberapa buku berturut-turut.';
  }).catch(function (err) {
    scannerAktif = false;
    const pesan = String(err && err.message ? err.message : err);
    if (/permission|denied|notallowed/i.test(pesan)) {
      status.textContent = 'Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser, lalu buka Scan lagi.';
    } else if (/notfound|no camera|requested device/i.test(pesan)) {
      status.textContent = 'Kamera tidak ditemukan di perangkat ini. Gunakan scanner USB atau ketik ISBN di kolom pencarian.';
    } else {
      status.textContent = 'Kamera tidak bisa dibuka: ' + pesan + ' (kamera hanya jalan di HTTPS).';
    }
  });
}

function hentikanKamera() {
  if (html5Scanner && scannerAktif) {
    html5Scanner.stop().then(function () { html5Scanner.clear(); }).catch(function () {});
  } else if (html5Scanner) {
    try { html5Scanner.clear(); } catch (e) { /* abaikan */ }
  }
  scannerAktif = false;
  html5Scanner = null;
}

function tutupScanner() {
  const modalEl = document.getElementById('scannerModal');
  const inst = bootstrap.Modal.getInstance(modalEl);
  if (inst) inst.hide();
}

function catatLogScan(kode, judul, sukses) {
  const log = document.getElementById('scanLog');
  if (!log) return;
  const item = document.createElement('div');
  item.className = 'scan-log-item ' + (sukses ? 'ok' : 'miss');
  item.innerHTML = '<i class="bi ' + (sukses ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill') + '"></i>' +
    '<div><div class="scan-log-title"></div><div class="scan-log-code"></div></div>';
  item.querySelector('.scan-log-title').textContent = judul;
  item.querySelector('.scan-log-code').textContent = kode;
  log.insertBefore(item, log.firstChild);
  while (log.children.length > 6) log.removeChild(log.lastChild);
}
