/**
 * ============================================================
 * KASIR FESTIVAL LITERASI IPB PRESS — Frontend JavaScript
 * ============================================================
 */

let currentUser = null;
let cart = []; // { id_produk, Judul, HargaAsli, Harga, qty, Penerbit }
let currentPaymentMethod = 'Cash';
let currentJenisTransaksi = 'P'; // P = POS, N = NON POS
let periodeAktifList = [];
let chartInstances = {};
let lastStrukData = null;

// ════════════════════════════════════════════════════════
// BAGIAN 1: INISIALISASI & AUTENTIKASI
// ════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const savedUser = sessionStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showApp();
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById('loadingOverlay').style.display = 'none';
  document.getElementById('appWrapper').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  warmUpServer('pub');   // bangunkan server selagi pengguna mengetik email/password
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appWrapper').style.display = 'block';
  document.getElementById('darkModeToggle').checked = (localStorage.getItem('theme') === 'dark');

  document.getElementById('userNameChip').textContent = currentUser.Nama;
  document.getElementById('userRoleChip').textContent = currentUser.Role;
  document.body.classList.toggle('role-kasir', currentUser.Role !== 'Admin');

  loadPeriodeFeslitCache();
  muatProdukKeCache();        // prefetch produk: halaman Kasir langsung terbuka
  navigateTo('dashboard');
  prefetchMenuSekunder();     // Transaksi/Keuangan/Laporan dimuat saat browser menganggur
  hideLoadingOverlay();
}

function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errBox = document.getElementById('loginError');
  errBox.style.display = 'none';

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-inline"></span> Memproses...';

  GAS.run
    .withSuccessHandler(res => {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Masuk';
      if (res.success) {
        currentUser = res.data;
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        if (res.boot) seedDariBoot(res.boot);   // data awal ikut respons login
        showApp();
      } else {
        errBox.textContent = res.message;
        errBox.style.display = 'block';
      }
    })
    .withFailureHandler(err => {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Masuk';
      errBox.textContent = 'Terjadi kesalahan: ' + err.message;
      errBox.style.display = 'block';
    })
    .loginUser(email, password, 'boot');

  return false;
}

function handleLogout() {
  try { if (currentUser) GAS.run.withSuccessHandler(() => {}).withFailureHandler(() => {}).logoutUser(); } catch (e) { /* abaikan */ }
  sessionStorage.removeItem('currentUser');
  currentUser = null;
  cart = [];
  swrPurge();
  setProdukCache([]);
  document.getElementById('loginForm').reset();
  showLogin();
}

// ════════════════════════════════════════════════════════
// BAGIAN 2: NAVIGASI SPA
// ════════════════════════════════════════════════════════

function navigateTo(sectionId) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('section-' + sectionId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === sectionId);
  });

  const titles = {
    dashboard: 'Dashboard', kasir: 'Kasir', katalog: 'Katalog Buku', transaksi: 'Transaksi',
    keuangan: 'Keuangan', laporan: 'Laporan', kasirUser: 'Kasir / User', pengaturan: 'Pengaturan'
  };
  document.getElementById('pageTitle').textContent = titles[sectionId] || 'Halaman';
  closeSidebar();

  if (sectionId === 'dashboard') loadDashboard();
  if (sectionId === 'kasir') loadKasirPage();
  if (sectionId === 'katalog') loadKatalogPage();
  if (sectionId === 'transaksi') loadTransaksiPage();
  if (sectionId === 'keuangan') loadKeuanganPage();
  if (sectionId === 'laporan') loadLaporanPage();
  if (sectionId === 'kasirUser') loadKasirUserPage();
  if (sectionId === 'pengaturan') loadPengaturanPage();
}

// ════════════════════════════════════════════════════════
// BAGIAN 3: DARK MODE & SIDEBAR MOBILE
// ════════════════════════════════════════════════════════

function toggleDarkMode() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('darkModeToggle').checked = next === 'dark';
  updateChartsTheme(next);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('show');
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.onclick = closeSidebar;
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('show');
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) overlay.classList.remove('show');
}

// ════════════════════════════════════════════════════════
// BAGIAN 4: UTILITAS UI
// ════════════════════════════════════════════════════════

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 300); }
}

function showToast(title, message, type = 'info') {
  const toastEl = document.getElementById('appToast');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastBody').textContent = message;
  toastEl.className = 'toast';
  const colorMap = { danger: '#dc2626', success: '#16a34a', warning: '#f59e0b', info: 'var(--accent)' };
  toastEl.style.borderLeft = `4px solid ${colorMap[type] || colorMap.info}`;
  new bootstrap.Toast(toastEl, { delay: 3500 }).show();
}

function showLoading(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Memuat data...</p></div>`;
}

/**
 * Tampilkan pesan error langsung di dalam container (menggantikan spinner yang macet)
 * beserta tombol "Coba Lagi" yang memanggil ulang fungsi loader terkait.
 */
function showErrorInContainer(containerId, message, retryFnName) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="alert alert-danger">
      <strong>Gagal memuat data:</strong> ${message}
      <div class="mt-2"><button class="btn btn-sm btn-outline-danger" onclick="${retryFnName}()"><i class="bi bi-arrow-clockwise"></i> Coba Lagi</button></div>
    </div>`;
}

function formatCompactRupiah(n) {
  // Format ringkas untuk data label chart: 1.200.000 -> "1,2 jt", 2.500.000.000 -> "2,5 M"
  const num = Math.round(Number(n) || 0);
  const abs = Math.abs(num);
  let text;
  if (abs >= 1e9) text = (num / 1e9).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' M';
  else if (abs >= 1e6) text = (num / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' jt';
  else if (abs >= 1e3) text = (num / 1e3).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' rb';
  else text = String(num);
  return text;
}

function formatRupiah(n) {
  // Selalu bulatkan ke rupiah utuh (integer) sebelum ditampilkan, agar tidak pernah
  // muncul sisa desimal akibat floating-point JavaScript (mis. 75000.000000001).
  const rounded = Math.round(Number(n) || 0);
  return 'Rp ' + rounded.toLocaleString('id-ID', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}
const _fmtTgl = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
function formatTanggal(d) { return _fmtTgl.format(new Date(d)); }
const _fmtTglJam = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function formatTanggalJam(d) { return _fmtTglJam.format(new Date(d)); }

// ════════════════════════════════════════════════════════
// BAGIAN 5: DASHBOARD
// ════════════════════════════════════════════════════════

let dashboardFeslitTerpilih = ''; // '' = Semua Periode

function loadDashboard(idFeslit) {
  if (idFeslit !== undefined) dashboardFeslitTerpilih = idFeslit;
  swr('dash:' + dashboardFeslitTerpilih, 'getDashboardData', [dashboardFeslitTerpilih], renderDashboard,
    msg => {
      document.getElementById('section-dashboard').innerHTML = `
        <div class="page-header"><h2>Dashboard</h2></div>
        <div class="alert alert-danger">
          <strong>Terjadi kesalahan server:</strong> ${esc(msg)}
          <div class="mt-2"><button class="btn btn-sm btn-outline-danger" onclick="loadDashboard()"><i class="bi bi-arrow-clockwise"></i> Coba Lagi</button></div>
        </div>
      `;
    }, { maxAge: 20000, loadingId: 'section-dashboard' });
}

function renderDashboard(response) {
  if (!response.success) {
    document.getElementById('section-dashboard').innerHTML = `
      <div class="page-header"><h2>Dashboard</h2></div>
      <div class="alert alert-danger">
        <strong>Gagal memuat data dashboard:</strong> ${response.message}<br>
        <small>Jika ini kali pertama setelah update struktur data, coba jalankan ulang <code>setupAppEnvironment()</code> di Apps Script Editor, atau cek sheet <b>Transaksi</b> & <b>Detail_Transaksi</b> di Spreadsheet.</small>
        <div class="mt-2"><button class="btn btn-sm btn-outline-danger" onclick="loadDashboard()"><i class="bi bi-arrow-clockwise"></i> Coba Lagi</button></div>
      </div>
    `;
    return;
  }
  const data = response.data;
  const container = document.getElementById('section-dashboard');

  container.innerHTML = `
    <div class="page-header">
      <h2>Dashboard</h2>
      <div>
        <label class="form-label small text-secondary mb-1 d-block">Filter Periode Feslit</label>
        <select class="form-select form-select-sm" id="dashboardFeslitFilter" onchange="loadDashboard(this.value)" style="min-width:220px;">
          <option value="">Semua Periode</option>
          ${periodeAktifList.map(f => `<option value="${f.id_feslit}" ${f.id_feslit === dashboardFeslitTerpilih ? 'selected' : ''}>${f.NamaEvent}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="kpi-group-label">Hari Ini</div>
    <div class="row g-3 mb-3">
      <div class="col-12 col-md-4">
        <div class="stat-card">
          <div class="stat-icon" style="background:#1e6fd9;"><i class="bi bi-cash-stack"></i></div>
          <div><div class="stat-value">${formatRupiah(data.penjualanHariIni)}</div><div class="stat-label">Revenue</div></div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="stat-card">
          <div class="stat-icon" style="background:#16a34a;"><i class="bi bi-receipt"></i></div>
          <div><div class="stat-value">${data.transaksiHariIni}</div><div class="stat-label">Transaksi</div></div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="stat-card">
          <div class="stat-icon" style="background:#f59e0b;"><i class="bi bi-box-seam"></i></div>
          <div><div class="stat-value">${data.qtyHariIni}</div><div class="stat-label">Qty Terjual</div></div>
        </div>
      </div>
    </div>

    <div class="kpi-group-label">Total${dashboardFeslitTerpilih ? ' (Periode Terpilih)' : ' (Semua Data)'}</div>
    <div class="row g-3 mb-4">
      <div class="col-12 col-md-4">
        <div class="stat-card">
          <div class="stat-icon" style="background:#12408c;"><i class="bi bi-graph-up-arrow"></i></div>
          <div><div class="stat-value">${formatRupiah(data.totalPenjualan)}</div><div class="stat-label">Revenue</div></div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="stat-card">
          <div class="stat-icon" style="background:#0d9488;"><i class="bi bi-receipt-cutoff"></i></div>
          <div><div class="stat-value">${data.totalTransaksi}</div><div class="stat-label">Transaksi</div></div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="stat-card">
          <div class="stat-icon" style="background:#9333ea;"><i class="bi bi-boxes"></i></div>
          <div><div class="stat-value">${data.totalQty}</div><div class="stat-label">Qty Terjual</div></div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-12">
        <div class="card p-3">
          <h6 class="mb-3">Penjualan Per Hari</h6>
          <div class="chart-box-lg"><canvas id="chartPenjualanHarian"></canvas></div>
        </div>
      </div>
    </div>
    <div class="row g-3">
      <div class="col-md-6">
        <div class="card p-3">
          <h6 class="mb-3">Judul Buku Terlaris</h6>
          <div class="chart-box-md"><canvas id="chartTopProduk"></canvas></div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card p-3">
          <h6 class="mb-3">Penerbit dengan Penjualan Terbanyak</h6>
          <div class="chart-box-md"><canvas id="chartTopPenerbit"></canvas></div>
        </div>
      </div>
    </div>
  `;
  renderPenjualanHarianChart(data.penjualanPerHari);
  renderTopProdukChart(data.produkCounts);
  renderTopPenerbitChart(data.penerbitCounts);
}

function renderPenjualanHarianChart(penjualanPerHari) {
  const ctx = document.getElementById('chartPenjualanHarian');
  if (!ctx) return;
  if (chartInstances.penjualanHarian) chartInstances.penjualanHarian.destroy();

  // penjualanPerHari sekarang berupa ARRAY yang sudah terurut kronologis dari server
  // (lihat getDashboardData) — bukan object, supaya urutan sumbu-X dijamin benar.
  const labels = penjualanPerHari.map(d => d.label);
  const values = penjualanPerHari.map(d => d.total);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  chartInstances.penjualanHarian = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Penjualan', data: values, borderColor: '#1e6fd9',
        backgroundColor: 'rgba(30,111,217,0.12)', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // tinggi chart dikontrol via CSS (.chart-box-lg), bukan rasio otomatis — supaya tidak gepeng
      layout: { padding: { top: 28 } }, // ruang ekstra agar data label di atas titik tidak terpotong
      plugins: {
        legend: { display: false },
        datalabels: {
          display: true,
          align: 'top',
          anchor: 'end',
          color: isDark ? '#e6ecf5' : '#1c2733',
          font: { size: 11, weight: '600' },
          formatter: v => formatCompactRupiah(v)
        }
      },
      scales: {
        x: { ticks: { color: isDark ? '#e6ecf5' : '#1c2733' }, grid: { display: false } },
        // Sumbu Y selalu mulai dari 0 (bukan dari nilai terkecil) agar naik-turun penjualan tidak tampak berlebihan
        y: { beginAtZero: true, min: 0, ticks: { color: isDark ? '#e6ecf5' : '#1c2733', callback: v => formatCompactRupiah(v) }, grid: { color: isDark ? '#26334a' : '#e2e8f0' } }
      }
    }
  });
}

function renderTopProdukChart(produkCounts) {
  const ctx = document.getElementById('chartTopProduk');
  if (!ctx) return;
  if (chartInstances.topProduk) chartInstances.topProduk.destroy();

  const entries = Object.entries(produkCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Horizontal bar, skala disembunyikan — nilai ditampilkan via data label saja (lebih bersih)
  chartInstances.topProduk = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ label: 'Qty Terjual', data: entries.map(e => e[1]), backgroundColor: '#1e6fd9', borderRadius: 6, maxBarThickness: 28 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        datalabels: {
          display: true, anchor: 'end', align: 'end',
          color: isDark ? '#e6ecf5' : '#1c2733', font: { size: 11, weight: '600' },
          formatter: v => formatCompactRupiah(v)
        }
      },
      scales: {
        x: { display: false, grid: { display: false } }, // skala dihilangkan sesuai permintaan
        y: { ticks: { color: isDark ? '#e6ecf5' : '#1c2733' }, grid: { display: false } }
      }
    }
  });
}

function renderTopPenerbitChart(penerbitCounts) {
  const ctx = document.getElementById('chartTopPenerbit');
  if (!ctx) return;
  if (chartInstances.topPenerbit) chartInstances.topPenerbit.destroy();

  const entries = Object.entries(penerbitCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  chartInstances.topPenerbit = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ label: 'Total Penjualan', data: entries.map(e => e[1]), backgroundColor: '#f59e0b', borderRadius: 6, maxBarThickness: 28 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => 'Rp ' + c.raw.toLocaleString('id-ID') } },
        datalabels: {
          display: true, anchor: 'end', align: 'end',
          color: isDark ? '#e6ecf5' : '#1c2733', font: { size: 11, weight: '600' },
          formatter: v => formatCompactRupiah(v)
        }
      },
      scales: {
        x: { display: false, grid: { display: false } }, // skala dihilangkan sesuai permintaan
        y: { ticks: { color: isDark ? '#e6ecf5' : '#1c2733' }, grid: { display: false } }
      }
    }
  });
}

function updateChartsTheme(theme) {
  Object.values(chartInstances).forEach(chart => {
    const isDark = theme === 'dark';
    if (chart.options.scales) {
      Object.values(chart.options.scales).forEach(s => { if (s.ticks) s.ticks.color = isDark ? '#e6ecf5' : '#1c2733'; if (s.grid) s.grid.color = isDark ? '#26334a' : '#e2e8f0'; });
    }
    if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
      chart.options.plugins.legend.labels.color = isDark ? '#e6ecf5' : '#1c2733';
    }
    chart.update();
  });
}

// ════════════════════════════════════════════════════════
// BAGIAN 6: KASIR (POS) — Pencarian Produk, Keranjang, Checkout
// ════════════════════════════════════════════════════════

let produkSearchTimer = null;
let produkCache = []; // cache client-side agar pencarian instan tanpa round-trip server

function loadKasirPage() {
  // Reset pilihan ke default setiap kali halaman Kasir dibuka, agar SELALU sinkron
  // dengan tampilan tombol (yang juga default ke POS & Cash). Tanpa ini, pilihan
  // sebelumnya (mis. NON POS) akan "nyangkut" walau tombol terlihat kembali ke POS.
  currentJenisTransaksi = 'P';
  currentPaymentMethod = 'Cash';
  cart = [];

  const container = document.getElementById('section-kasir');
  container.innerHTML = `
    <div class="page-header"><h2>Kasir</h2></div>
    <div class="row g-3">
      <div class="col-12 col-lg-8">
        <div class="scan-bar mb-3">
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-search"></i></span>
            <input type="text" class="form-control" id="produkSearchInput" placeholder="Cari judul, ISBN, penerbit — atau scan barcode" oninput="handleProdukSearch()" onkeydown="handleSearchEnter(event)" autocomplete="off" inputmode="search">
            <button class="btn btn-accent btn-scan" type="button" onclick="bukaScanner()"><i class="bi bi-upc-scan"></i> <span>Scan Barcode</span></button>
          </div>
          <div class="scan-hint"><i class="bi bi-usb-symbol"></i> Scanner USB/Bluetooth langsung bekerja: arahkan ke barcode, buku masuk keranjang otomatis.</div>
        </div>
        <div id="produkGridContainer" class="produk-grid"></div>
      </div>
      <div class="col-12 col-lg-4">
        <div class="cart-panel">
          <h6 class="mb-3"><i class="bi bi-cart-fill"></i> Keranjang <span class="badge bg-secondary" id="cartCountBadge">0</span></h6>
          <div id="cartItemsContainer"><div class="cart-empty"><i class="bi bi-cart"></i><p class="mb-0 mt-2">Keranjang kosong</p></div></div>
          <hr>
          <div class="d-flex justify-content-between mb-1"><span>Subtotal (harga rekomendasi)</span><strong id="cartSubtotal">Rp 0</strong></div>
          <div class="d-flex justify-content-between align-items-center mb-2 text-secondary small">
            <span>Diskon (otomatis)</span>
            <span id="diskonOtomatisDisplay">Rp 0 (0%)</span>
          </div>
          <div class="d-flex justify-content-between mb-3"><strong>TOTAL DIBAYAR</strong><strong class="text-accent" id="cartTotal" style="color:var(--accent); font-size:1.2rem;">Rp 0</strong></div>

          <label class="form-label small fw-semibold">JENIS TRANSAKSI</label>
          <div class="payment-toggle mb-3">
            <button type="button" class="active" id="jenisP" onclick="setJenisTransaksi('P')">POS</button>
            <button type="button" id="jenisN" onclick="setJenisTransaksi('N')">NON POS</button>
          </div>

          <label class="form-label small fw-semibold">METODE PEMBAYARAN</label>
          <div class="payment-toggle mb-3">
            <button type="button" class="active" onclick="setPaymentMethod('Cash', this)"><i class="bi bi-cash"></i> Cash</button>
            <button type="button" onclick="setPaymentMethod('QRIS', this)"><i class="bi bi-qr-code"></i> QRIS</button>
            <button type="button" onclick="setPaymentMethod('EDC', this)"><i class="bi bi-credit-card"></i> EDC</button>
          </div>

          <label class="form-label small fw-semibold">JUMLAH BAYAR</label>
          <input type="number" class="form-control mb-2" id="jumlahBayarInput" placeholder="0" oninput="updateCartTotals()">
          <div class="d-flex justify-content-between mb-3 small text-secondary"><span>Kembalian</span><span id="kembalianDisplay">Rp 0</span></div>

          <div class="mb-2">
            <label class="form-label small fw-semibold">Periode Feslit Aktif</label>
            <select class="form-select form-select-sm" id="feslitAktifSelect"></select>
          </div>

          <button class="btn btn-accent w-100 py-2" id="btnCheckout" onclick="prosesCheckout()"><i class="bi bi-check-circle"></i> Simpan & Cetak Struk</button>
        </div>
      </div>
    </div>
  `;
  populateFeslitDropdownForKasir();
  document.getElementById('produkGridContainer').addEventListener('click', onProdukGridClick);
  muatProdukKeCache();
  aktifkanScannerFisik();
}

/**
 * Muat SELURUH data produk satu kali ke memori browser (produkCache).
 * Pencarian berikutnya dilakukan secara lokal (instan) tanpa memanggil
 * server lagi — jauh lebih cepat dibanding round-trip per ketikan.
 * Server sendiri sudah memakai CacheService agar panggilan pertama pun cepat.
 */
function muatProdukKeCache(callback) {
  swr('produk', 'getAllProdukCached', [], res => {
    setProdukCache(res.data || []);
    jalankanCariProduk();
    if (callback) callback();
  }, msg => showToast('Error', msg, 'danger'), { maxAge: 60000, loadingId: 'produkGridContainer' });
}

function handleProdukSearch(segera) {
  // Debounce 90 ms: mengetik cepat tidak membuat grid digambar ulang di setiap huruf
  clearTimeout(produkSearchTimer);
  if (segera === true) return jalankanCariProduk();
  produkSearchTimer = setTimeout(jalankanCariProduk, 90);
}

function renderProdukGrid(produkList, tampil) {
  const container = document.getElementById('produkGridContainer');
  if (!container) return;
  produkFiltered = produkList;
  produkShown = Math.min(produkList.length, tampil || PRODUK_PAGE);   // hanya gambar sebagian: ringan walau katalog ribuan
  let html = produkList.slice(0, produkShown).map(p => `
    <div class="produk-card" data-id="${esc(p.id_produk)}">
      <div class="produk-cover" style="--h:${coverHue(p.Judul)}"><i class="bi ${p.JenisProduk === 'Non Buku' ? 'bi-bag-heart' : 'bi-book-half'}"></i><span>${esc(String(p.Judul || '?').trim().charAt(0).toUpperCase())}</span></div>
      <div class="produk-title">${esc(p.Judul)}</div>
      <div class="produk-price">${formatRupiah(p.Harga)}</div>
      <div class="produk-meta">${esc(p.Penerbit || '-')} · <span class="badge ${p.JenisProduk === 'Non Buku' ? 'badge-nonpos' : 'badge-pos'}">${esc(p.JenisProduk || 'Buku')}</span></div>
    </div>`).join('');
  if (produkList.length > produkShown) {
    html += `<div class="produk-card produk-card-add" data-more="1"><i class="bi bi-chevron-double-down fs-3"></i><span class="small">Tampilkan lebih banyak<br>(${produkList.length - produkShown} lagi)</span></div>`;
  }
  html += `
    <div class="produk-card produk-card-add" data-add="1">
      <i class="bi bi-plus-circle fs-3"></i>
      <span class="small">Tambah Produk Baru</span>
    </div>`;
  container.innerHTML = html;
}

function openTambahProdukCepat(isbnDariScan) {
  const judul = (typeof isbnDariScan === 'string') ? '' : document.getElementById('produkSearchInput').value;
  document.getElementById('produkModalTitle').textContent = 'Tambah Produk Baru';
  document.getElementById('produkForm').reset();
  document.getElementById('produkID').value = '';
  document.getElementById('produkIdProduk').value = '';
  document.getElementById('produkJudul').value = judul || '';
  document.getElementById('produkPenerbit').value = 'IPB Press';
  document.getElementById('produkJenis').value = 'Buku';
  toggleISBNField();
  if (typeof isbnDariScan === 'string') document.getElementById('produkISBN').value = isbnDariScan;
  new bootstrap.Modal(document.getElementById('produkModal')).show();
}

function toggleISBNField() {
  const jenis = document.getElementById('produkJenis').value;
  const wrapper = document.getElementById('isbnFieldWrapper');
  wrapper.style.display = jenis === 'Non Buku' ? 'none' : 'block';
  if (jenis === 'Non Buku') document.getElementById('produkISBN').value = '';
}

function tambahKeKeranjang(produk) {
  const existing = cart.find(i => i.id_produk === produk.id_produk);
  if (existing) {
    existing.qty += 1;
  } else {
    // HargaAsli = harga rekomendasi dari data Produk (acuan hitung diskon, tidak berubah)
    // Harga     = harga yang benar-benar dibayar, defaultnya sama, tapi bisa diedit kasir
    cart.push({
      id_produk: produk.id_produk, Judul: produk.Judul,
      HargaAsli: Number(produk.Harga), Harga: Number(produk.Harga),
      qty: 1, Penerbit: produk.Penerbit
    });
  }
  renderCart();
}

function ubahHargaItem(idProduk, value) {
  const item = cart.find(i => i.id_produk === idProduk);
  if (!item) return;
  const harga = Math.round(Number(value)); // bulatkan ke rupiah utuh, cegah desimal nyangkut
  item.Harga = isNaN(harga) || harga < 0 ? 0 : harga;
  renderCart();
}

function ubahQty(idProduk, delta) {
  const item = cart.find(i => i.id_produk === idProduk);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id_produk !== idProduk);
  renderCart();
}

function hapusDariKeranjang(idProduk) {
  cart = cart.filter(i => i.id_produk !== idProduk);
  renderCart();
}

function setJenisTransaksi(jenis) {
  currentJenisTransaksi = jenis;
  document.getElementById('jenisP').classList.toggle('active', jenis === 'P');
  document.getElementById('jenisN').classList.toggle('active', jenis === 'N');
}

function setPaymentMethod(method, btn) {
  currentPaymentMethod = method;
  document.querySelectorAll('#section-kasir .payment-toggle:nth-of-type(2) button, .cart-panel .payment-toggle button').forEach(b => {});
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function renderCart() { renderCartItems(); updateCartTotals(); }

function renderCartItems() {
  const container = document.getElementById('cartItemsContainer');
  const countBadge = document.getElementById('cartCountBadge');
  if (!container) return;
  countBadge.textContent = cart.reduce((s, i) => s + i.qty, 0);
  if (cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><i class="bi bi-cart"></i><p class="mb-0 mt-2">Keranjang kosong</p></div>`;
    return;
  }
  container.innerHTML = cart.map(item => `
      <div class="cart-item-card">
        <div class="cart-item-header">
          <div class="cart-item-title">${esc(item.Judul)}</div>
          <button onclick="hapusDariKeranjang('${esc(item.id_produk)}')" class="cart-item-remove" title="Hapus"><i class="bi bi-trash"></i></button>
        </div>
        <div class="cart-item-rekom">Harga rekomendasi: ${formatRupiah(item.HargaAsli)}</div>
        <div class="cart-item-controls">
          <div class="cart-price-field">
            <label>Bayar</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">Rp</span>
              <input type="number" class="form-control" min="0" inputmode="numeric" value="${item.Harga}" onchange="ubahHargaItem('${esc(item.id_produk)}', this.value)">
            </div>
          </div>
          <div class="qty-control">
            <button onclick="ubahQty('${esc(item.id_produk)}', -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="ubahQty('${esc(item.id_produk)}', 1)">+</button>
          </div>
        </div>
        <div class="cart-item-subtotal">Subtotal: <strong>${formatRupiah(item.Harga * item.qty)}</strong></div>
      </div>
    `).join('');
}

/** Hanya angka total/kembalian — dipanggil di setiap ketikan "Jumlah Bayar" tanpa membangun ulang keranjang. */
function updateCartTotals() {
  const subtotal = Math.round(cart.reduce((s, i) => s + (i.HargaAsli * i.qty), 0));
  const total = Math.round(cart.reduce((s, i) => s + (i.Harga * i.qty), 0));
  const nominalDiskon = subtotal - total;
  const diskonPersen = subtotal > 0 ? (nominalDiskon / subtotal * 100) : 0;
  const bayarEl = document.getElementById('jumlahBayarInput');
  const jumlahBayar = Math.round(Number(bayarEl ? bayarEl.value : 0) || 0);
  const kembalian = jumlahBayar - total;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('cartSubtotal', formatRupiah(subtotal));
  set('diskonOtomatisDisplay', `${formatRupiah(nominalDiskon)} (${diskonPersen.toFixed(1)}%)`);
  set('cartTotal', formatRupiah(total));
  set('kembalianDisplay', formatRupiah(kembalian > 0 ? kembalian : 0));
}

function populateFeslitDropdownForKasir() {
  const select = document.getElementById('feslitAktifSelect');
  if (!select) return;
  select.innerHTML = periodeAktifList.map(f => `<option value="${f.id_feslit}">${f.NamaEvent}</option>`).join('') || '<option value="">Belum ada periode</option>';
}

function loadPeriodeFeslitCache() {
  swr('periode', 'getAllData', ['Periode_Feslit'], res => {
    periodeAktifList = res.data || [];
    populateFeslitDropdownForKasir();
  }, null, { maxAge: 60000 });
}

function submitProdukForm(event) {
  event.preventDefault();
  const jenis = document.getElementById('produkJenis').value;
  const produk = {
    JenisProduk: jenis,
    ISBN: jenis === 'Non Buku' ? '' : document.getElementById('produkISBN').value,
    Judul: document.getElementById('produkJudul').value,
    Harga: Math.round(Number(document.getElementById('produkHarga').value)) || 0,
    Penerbit: document.getElementById('produkPenerbit').value
  };
  const id = document.getElementById('produkID').value;

  const finish = (res) => {
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      bootstrap.Modal.getInstance(document.getElementById('produkModal')).hide();
      muatProdukKeCache();
      if (document.getElementById('section-katalog').classList.contains('active')) loadKatalogTable();
    } else {
      showToast('Gagal', res.message, 'danger');
    }
  };

  if (id) {
    produk.ID = id;
    produk.id_produk = document.getElementById('produkIdProduk').value;
    GAS.run.withSuccessHandler(finish).withFailureHandler(err => showToast('Error', err.message, 'danger')).updateRecord('Produk', produk);
  } else {
    GAS.run.withSuccessHandler(finish).withFailureHandler(err => showToast('Error', err.message, 'danger')).addProdukCepat(produk);
  }
  return false;
}

function prosesCheckout() {
  if (sedangSimpan) return;                       // anti klik ganda = anti transaksi ganda
  if (cart.length === 0) { showToast('Peringatan', 'Keranjang masih kosong.', 'warning'); return; }

  const idFeslit = document.getElementById('feslitAktifSelect').value;
  const payload = {
    items: cart.map(i => Object.assign({}, i)),   // salinan: perubahan keranjang tidak memengaruhi permintaan
    pembayaran: currentPaymentMethod,
    jenisTransaksi: currentJenisTransaksi,
    kasirNama: currentUser.Nama,
    idFeslit: idFeslit,
    jumlahBayar: Number(document.getElementById('jumlahBayarInput').value) || 0
  };

  sedangSimpan = true;
  setCheckoutBusy(true);
  tampilkanStruk(hitungStrukLokal(payload));      // respons visual instan; ID menyusul dari server

  GAS.run
    .withSuccessHandler(res => {
      sedangSimpan = false; setCheckoutBusy(false);
      if (res.success) {
        showToast('Berhasil', 'Transaksi tersimpan: ' + res.data.idTransaksi, 'success');
        lastStrukData = res.data;
        tampilkanStruk(res.data);
        cart = [];
        document.getElementById('jumlahBayarInput').value = '';
        renderCart();
      } else {
        tampilkanStrukGagal(res.message);
        showToast('Gagal', res.message, 'danger');
      }
    })
    .withFailureHandler(err => {
      sedangSimpan = false; setCheckoutBusy(false);
      tampilkanStrukGagal(err.message);
      showToast('Error', err.message, 'danger');
    })
    .simpanTransaksi(payload);
}

// ════════════════════════════════════════════════════════
// BAGIAN 7: STRUK
// ════════════════════════════════════════════════════════

function tampilkanStruk(data) {
  const content = document.getElementById('previewContent');
  const idHtml = data._pending ? '<span class="pending-dots">menyimpan</span>' : esc(data.idTransaksi);
  content.innerHTML = `
    <div class="struk-box">
      <div class="text-center mb-2">
        <strong>IPB PRESS</strong><br>
        <span class="small">Festival Literasi</span><br>
        <span class="small">${formatTanggalJam(data.tanggal)}</span>
      </div>
      <hr>
      <div class="struk-row"><span>ID Transaksi</span><span>${idHtml}</span></div>
      <div class="struk-row"><span>Kasir</span><span>${esc(data.kasirNama)}</span></div>
      <hr>
      ${data.items.map(it => `
        <div class="struk-row"><span>${esc(it.Judul)}</span></div>
        <div class="struk-row"><span>${it.qty} x ${formatRupiah(it.Harga)}</span><span>${formatRupiah(it.Harga * it.qty)}</span></div>
        ${it.Harga !== it.HargaAsli ? `<div class="struk-row small text-secondary"><span>(rekomendasi ${formatRupiah(it.HargaAsli)})</span></div>` : ''}
      `).join('')}
      <hr>
      <div class="struk-row"><span>Subtotal (rekomendasi)</span><span>${formatRupiah(data.totalHarga)}</span></div>
      <div class="struk-row"><span>Diskon (${data.diskonPersen}%)</span><span>-${formatRupiah(data.nominalDiskon)}</span></div>
      <div class="struk-row"><strong>TOTAL</strong><strong>${formatRupiah(data.netto)}</strong></div>
      <hr>
      <div class="struk-row"><span>Metode</span><span>${esc(data.pembayaran)}</span></div>
      <div class="struk-row"><span>Bayar</span><span>${formatRupiah(data.jumlahBayar)}</span></div>
      <div class="struk-row"><span>Kembalian</span><span>${formatRupiah(data.kembalian)}</span></div>
      <hr>
      <div class="text-center small">Terima kasih atas kunjungan Anda!</div>
    </div>
  `;
  const pb = document.getElementById('btnCetakStruk');
  if (pb) pb.disabled = !!data._pending;          // cetak hanya setelah ID transaksi resmi ada
  document.getElementById('previewModalTitle').textContent = data._pending ? 'Menyimpan Transaksi...' : 'Struk Transaksi';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('previewModal')).show();
}

function printStruk() {
  const content = document.getElementById('previewContent').innerHTML;
  const win = window.open('', '_blank', 'width=400,height=600');
  win.document.write(`<html><head><title>Struk</title>
    <style>body{font-family:'Courier New',monospace;font-size:12px;padding:10px;}
    .struk-row{display:flex;justify-content:space-between;} hr{border-top:1px dashed #999;}</style>
    </head><body>${content}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ════════════════════════════════════════════════════════
// BAGIAN 8: KATALOG BUKU (Produk CRUD)
// ════════════════════════════════════════════════════════

function loadKatalogPage() {
  const container = document.getElementById('section-katalog');
  container.innerHTML = `
    <div class="page-header">
      <h2>Katalog Buku</h2>
      <button class="btn btn-accent" onclick="openTambahProduk()"><i class="bi bi-plus-lg"></i> Tambah Produk</button>
    </div>
    <div class="mb-3"><input type="text" class="form-control" id="katalogSearchInput" placeholder="🔍 Cari judul, ISBN, atau penerbit..." oninput="filterKatalogLokal()"></div>
    <div id="katalogTableContainer" class="table-responsive"></div>
  `;
  loadKatalogTable();
}

function openTambahProduk() {
  document.getElementById('produkModalTitle').textContent = 'Tambah Produk';
  document.getElementById('produkForm').reset();
  document.getElementById('produkID').value = '';
  document.getElementById('produkIdProduk').value = '';
  document.getElementById('produkPenerbit').value = 'IPB Press';
  document.getElementById('produkJenis').value = 'Buku';
  toggleISBNField();
  new bootstrap.Modal(document.getElementById('produkModal')).show();
}

function editProduk(produk) {
  document.getElementById('produkModalTitle').textContent = 'Edit Produk';
  document.getElementById('produkID').value = produk.ID;
  document.getElementById('produkIdProduk').value = produk.id_produk;
  document.getElementById('produkJenis').value = produk.JenisProduk || 'Buku';
  document.getElementById('produkISBN').value = produk.ISBN;
  document.getElementById('produkJudul').value = produk.Judul;
  document.getElementById('produkHarga').value = produk.Harga;
  document.getElementById('produkPenerbit').value = produk.Penerbit;
  toggleISBNField();
  new bootstrap.Modal(document.getElementById('produkModal')).show();
}

function loadKatalogTable() {
  swr('produk', 'getAllProdukCached', [], res => {
    katalogData = res.data || [];
    terapkanFilterKatalog();
  }, msg => showErrorInContainer('katalogTableContainer', msg, 'loadKatalogTable'), { maxAge: 30000, loadingId: 'katalogTableContainer' });
}

function renderKatalogTable(data, tampil) {
  try {
    katalogShown = Math.min(data.length, tampil || KATALOG_PAGE);
    const container = document.getElementById('katalogTableContainer');
    if (!container) return;
    const rows = data.slice(0, katalogShown).map((p, i) => `
            <tr>
              <td><span class="badge ${p.JenisProduk === 'Non Buku' ? 'badge-nonpos' : 'badge-pos'}">${esc(p.JenisProduk || 'Buku')}</span></td>
              <td>${esc(p.ISBN || '-')}</td>
              <td>${esc(p.Judul)}</td>
              <td>${formatRupiah(p.Harga)}</td>
              <td>${esc(p.Penerbit || '-')}</td>
              <td>
                <button class="btn btn-sm btn-outline-accent me-1" onclick="editProdukIdx(${i})"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="confirmDelete('${esc(p.ID)}', 'Produk', loadKatalogTable)"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`).join('');
    const lagi = data.length > katalogShown
      ? `<tr><td colspan="6" class="text-center py-3"><button class="btn btn-sm btn-outline-accent" onclick="tampilkanLebihKatalog()">Tampilkan ${Math.min(KATALOG_PAGE, data.length - katalogShown)} lagi (${data.length - katalogShown} tersisa)</button></td></tr>` : '';
    container.innerHTML = `
      <div class="small text-secondary mb-2">${data.length} produk</div>
      <table class="table">
        <thead><tr><th>Jenis</th><th>ISBN</th><th>Judul</th><th>Harga</th><th>Penerbit</th><th>Aksi</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="text-center py-4 text-secondary">Belum ada data produk.</td></tr>'}${lagi}</tbody>
      </table>
    `;
  } catch (err) {
    showErrorInContainer('katalogTableContainer', 'Kesalahan saat menampilkan data: ' + err.message, 'loadKatalogTable');
  }
}

// ════════════════════════════════════════════════════════
// BAGIAN 9: TRANSAKSI (Riwayat & Detail)
// ════════════════════════════════════════════════════════

function loadTransaksiPage() {
  const isAdmin = currentUser.Role === 'Admin';
  const container = document.getElementById('section-transaksi');
  container.innerHTML = `
    <div class="page-header">
      <h2>Transaksi</h2>
      ${isAdmin ? `<button class="btn btn-accent" onclick="openTambahTransaksiManual()"><i class="bi bi-plus-lg"></i> Tambah Transaksi</button>` : ''}
    </div>
    <div class="row g-2 mb-3">
      <div class="col-6 col-md-3"><input type="text" class="form-control" id="trxSearchInput" placeholder="Cari ID Transaksi..." oninput="filterTransaksiLokal()"></div>
      <div class="col-6 col-md-3"><select class="form-select" id="trxPembayaranFilter" onchange="filterTransaksiLokal(true)"><option value="">Semua Pembayaran</option><option>Cash</option><option>QRIS</option><option>EDC</option></select></div>
      <div class="col-6 col-md-3"><input type="date" class="form-control" id="trxTanggalMulai" onchange="filterTransaksiLokal(true)"></div>
      <div class="col-6 col-md-3"><input type="date" class="form-control" id="trxTanggalSelesai" onchange="filterTransaksiLokal(true)"></div>
    </div>
    <div id="trxTableContainer" class="table-responsive"></div>
  `;
  loadTransaksiTable();
}

function loadTransaksiTable() {
  swr('trx:all', 'getRiwayatTransaksi', [{}], res => {
    trxData = res.data || [];
    terapkanFilterTrx();
  }, msg => showErrorInContainer('trxTableContainer', msg, 'loadTransaksiTable'), { maxAge: 20000, loadingId: 'trxTableContainer' });
}

function renderTransaksiTable(data, tampil) {
  try {
    const isAdmin = currentUser.Role === 'Admin';
    trxShown = Math.min(data.length, tampil || TRX_PAGE);
    const container = document.getElementById('trxTableContainer');
    if (!container) return;
    const rows = data.slice(0, trxShown).map((t, i) => `
            <tr>
              <td>${esc(t.id_transaksi)}</td>
              <td>${formatTanggalJam(t.Tanggal)}</td>
              <td>${esc(t.Kasir)}</td>
              <td>${esc(t.PeriodeFeslitNama || '-')}</td>
              <td><span class="badge ${t.JenisTransaksi === 'POS' ? 'badge-pos' : 'badge-nonpos'}">${esc(t.JenisTransaksi)}</span></td>
              <td>${t.qty}</td>
              <td>${formatRupiah(t.Netto)}</td>
              <td>${t.Diskon}%</td>
              <td>
                <button class="btn btn-sm btn-outline-accent me-1" onclick="lihatDetailTransaksi('${esc(t.id_transaksi)}')" title="Lihat Detail"><i class="bi bi-eye"></i></button>
                ${isAdmin ? `
                  <button class="btn btn-sm btn-outline-accent me-1" onclick="editTrxIdx(${i})" title="Edit"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteTransaksi('${esc(t.id_transaksi)}')" title="Hapus"><i class="bi bi-trash"></i></button>
                ` : ''}
              </td>
            </tr>`).join('');
    const lagi = data.length > trxShown
      ? `<tr><td colspan="9" class="text-center py-3"><button class="btn btn-sm btn-outline-accent" onclick="tampilkanLebihTrx()">Tampilkan ${Math.min(TRX_PAGE, data.length - trxShown)} lagi (${data.length - trxShown} tersisa)</button></td></tr>` : '';
    container.innerHTML = `
      <div class="small text-secondary mb-2">${data.length} transaksi</div>
      <table class="table">
        <thead><tr><th>ID Transaksi</th><th>Tanggal</th><th>Kasir</th><th>Periode Feslit</th><th>Jenis</th><th>Qty</th><th>Total</th><th>Diskon</th><th>Aksi</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="text-center py-4 text-secondary">Belum ada transaksi.</td></tr>'}${lagi}</tbody>
      </table>
    `;
  } catch (err) {
    showErrorInContainer('trxTableContainer', 'Kesalahan saat menampilkan data: ' + err.message, 'loadTransaksiTable');
  }
}

function lihatDetailTransaksi(idTransaksi) {
  document.getElementById('detailTrxTitle').textContent = 'Detail Transaksi - ' + idTransaksi;
  document.getElementById('detailTrxContent').innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('detailTrxModal')).show();
  swr('det:' + idTransaksi, 'getDetailTransaksi', [idTransaksi], res => {
    const items = res.success ? res.data : [];
    document.getElementById('detailTrxContent').innerHTML = `
        <table class="table">
          <thead><tr><th>Judul</th><th>Penerbit</th><th>Harga Rekomendasi</th><th>Harga Dibayar</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>
            ${items.map(i => `<tr><td>${esc(i.Judul)}</td><td>${esc(i.Penerbit || '-')}</td><td>${formatRupiah(i.HargaAsli)}</td><td>${formatRupiah(i.Harga)}</td><td>${i.qty}</td><td>${formatRupiah(i.Total)}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
  }, msg => {
    document.getElementById('detailTrxContent').innerHTML = `<div class="alert alert-danger mb-0">${esc(msg)} <button class="btn btn-sm btn-outline-danger ms-2" onclick="lihatDetailTransaksi('${esc(idTransaksi)}')">Coba Lagi</button></div>`;
  }, { maxAge: 3600000 });
}

// ════════════════════════════════════════════════════════
// BAGIAN 9b: TRANSAKSI — CRUD Khusus Admin
// (Tambah manual, Edit metadata header, Hapus beserta detail)
// ════════════════════════════════════════════════════════

let manualItemCounter = 0;

function openTambahTransaksiManual() {
  document.getElementById('transaksiManualForm').reset();
  document.getElementById('manualItemsContainer').innerHTML = '';
  manualItemCounter = 0;

  // Default tanggal & waktu = sekarang, format sesuai input datetime-local
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('manualTanggal').value = now.toISOString().slice(0, 16);

  // Isi dropdown Kasir & Periode Feslit
  GAS.run
    .withSuccessHandler(res => {
      const select = document.getElementById('manualKasir');
      const kasirList = res.success ? res.data : [];
      select.innerHTML = kasirList.map(k => `<option value="${k.Nama}">${k.Nama}</option>`).join('') || '<option value="">Belum ada kasir</option>';
    })
    .withFailureHandler(() => {})
    .getAllData('Kasir');

  const feslitSelect = document.getElementById('manualFeslit');
  feslitSelect.innerHTML = periodeAktifList.map(f => `<option value="${f.id_feslit}">${f.NamaEvent}</option>`).join('') || '<option value="">Belum ada periode</option>';

  tambahBarisManual(); // mulai dengan 1 baris kosong
  new bootstrap.Modal(document.getElementById('transaksiManualModal')).show();
}

/**
 * Baris item reusable, dipakai oleh modal "Tambah Transaksi Manual" DAN
 * "Edit Transaksi" — supaya keduanya bisa menambah/mengubah/menghapus
 * item dengan cara yang sama persis.
 */
function buatBarisItemHTML(rowId, prefill, onChangeFn) {
  const j = prefill && prefill.Judul ? prefill.Judul : '';
  const p = prefill && prefill.Penerbit ? prefill.Penerbit : '';
  const h = prefill && prefill.Harga !== undefined ? prefill.Harga : '';
  const q = prefill && prefill.qty !== undefined ? prefill.qty : 1;
  return `
    <div class="row g-2 mb-2 align-items-center" id="${rowId}">
      <div class="col-4"><input type="text" class="form-control form-control-sm" placeholder="Judul/Nama Item" value="${j}" oninput="${onChangeFn}()"></div>
      <div class="col-3"><input type="text" class="form-control form-control-sm" placeholder="Penerbit (opsional)" value="${p}"></div>
      <div class="col-2"><input type="number" class="form-control form-control-sm" placeholder="Harga" min="0" value="${h}" oninput="${onChangeFn}()"></div>
      <div class="col-2"><input type="number" class="form-control form-control-sm" placeholder="Qty" min="1" value="${q}" oninput="${onChangeFn}()"></div>
      <div class="col-1"><button type="button" class="btn btn-sm btn-outline-danger" onclick="document.getElementById('${rowId}').remove(); ${onChangeFn}()"><i class="bi bi-trash"></i></button></div>
    </div>`;
}

function kumpulkanItemDariContainer(containerId) {
  const rows = document.querySelectorAll('#' + containerId + ' > div');
  const items = [];
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const judul = inputs[0].value.trim();
    const penerbit = inputs[1].value.trim();
    const harga = Math.round(Number(inputs[2].value)) || 0;
    const qty = Math.round(Number(inputs[3].value)) || 0;
    if (judul && harga > 0 && qty > 0) {
      items.push({ id_produk: 'MANUAL-' + Date.now() + '-' + items.length, Judul: judul, HargaAsli: harga, Harga: harga, qty: qty, Penerbit: penerbit });
    }
  });
  return items;
}

function tambahBarisManual(prefill) {
  manualItemCounter++;
  const id = 'manualItem' + manualItemCounter;
  document.getElementById('manualItemsContainer').insertAdjacentHTML('beforeend', buatBarisItemHTML(id, prefill, 'hitungTotalManual'));
}

function hitungTotalManual() {
  const items = kumpulkanItemDariContainer('manualItemsContainer');
  document.getElementById('manualTotalDisplay').textContent = formatRupiah(items.reduce((s, i) => s + (i.Harga * i.qty), 0));
}

let editItemCounter = 0;
function tambahBarisEdit(prefill) {
  editItemCounter++;
  const id = 'editItem' + editItemCounter;
  document.getElementById('editItemsContainer').insertAdjacentHTML('beforeend', buatBarisItemHTML(id, prefill, 'hitungTotalEdit'));
}

function hitungTotalEdit() {
  const items = kumpulkanItemDariContainer('editItemsContainer');
  document.getElementById('editTotalDisplay').textContent = formatRupiah(items.reduce((s, i) => s + (i.Harga * i.qty), 0));
}

function submitTransaksiManualForm(event) {
  event.preventDefault();
  const items = kumpulkanItemDariContainer('manualItemsContainer');
  if (items.length === 0) { showToast('Peringatan', 'Tambahkan minimal satu item dengan judul, harga, dan qty yang valid.', 'warning'); return false; }

  const payload = {
    items: items,
    pembayaran: document.getElementById('manualPembayaran').value,
    jenisTransaksi: document.getElementById('manualJenis').value,
    kasirNama: document.getElementById('manualKasir').value,
    idFeslit: document.getElementById('manualFeslit').value,
    jumlahBayar: items.reduce((s, i) => s + (i.Harga * i.qty), 0),
    tanggalManual: document.getElementById('manualTanggal').value
  };

  GAS.run
    .withSuccessHandler(res => {
      if (res.success) {
        showToast('Berhasil', 'Transaksi manual tersimpan: ' + res.data.idTransaksi, 'success');
        bootstrap.Modal.getInstance(document.getElementById('transaksiManualModal')).hide();
        loadTransaksiTable();
      } else {
        showToast('Gagal', res.message, 'danger');
      }
    })
    .withFailureHandler(err => showToast('Error', err.message, 'danger'))
    .simpanTransaksi(payload);
  return false;
}

function openEditTransaksi(t) {
  document.getElementById('editTransaksiTitle').textContent = 'Edit Transaksi - ' + t.id_transaksi;
  document.getElementById('editTrxID').value = t.ID;
  document.getElementById('editTrxIdTransaksi').value = t.id_transaksi;
  document.getElementById('editTrxPembayaran').value = t.Pembayaran;
  document.getElementById('editTrxJumlahBayar').value = t.JumlahBayar !== undefined && t.JumlahBayar !== '' ? t.JumlahBayar : t.Netto;
  document.getElementById('editItemsContainer').innerHTML = '';
  editItemCounter = 0;

  GAS.run
    .withSuccessHandler(res => {
      const kasirList = res.success ? res.data : [];
      document.getElementById('editTrxKasir').innerHTML = kasirList.map(k => `<option value="${k.Nama}">${k.Nama}</option>`).join('');
      document.getElementById('editTrxKasir').value = t.Kasir;
    })
    .withFailureHandler(() => {})
    .getAllData('Kasir');

  const feslitSelect = document.getElementById('editTrxFeslit');
  feslitSelect.innerHTML = periodeAktifList.map(f => `<option value="${f.id_feslit}">${f.NamaEvent}</option>`).join('');
  feslitSelect.value = t.PeriodeFeslit;

  // Muat item transaksi yang sudah ada agar bisa diedit (ubah harga/qty/penerbit, tambah, atau hapus baris)
  GAS.run
    .withSuccessHandler(res => {
      const items = res.success ? res.data : [];
      if (items.length === 0) {
        tambahBarisEdit();
      } else {
        items.forEach(it => tambahBarisEdit({ Judul: it.Judul, Penerbit: it.Penerbit, Harga: it.Harga, qty: it.qty }));
      }
      hitungTotalEdit();
    })
    .withFailureHandler(() => tambahBarisEdit())
    .getDetailTransaksi(t.id_transaksi);

  new bootstrap.Modal(document.getElementById('editTransaksiModal')).show();
}

function submitEditTransaksiForm(event) {
  event.preventDefault();
  const items = kumpulkanItemDariContainer('editItemsContainer');
  if (items.length === 0) { showToast('Peringatan', 'Item transaksi tidak boleh kosong.', 'warning'); return false; }

  const payload = {
    ID: document.getElementById('editTrxID').value,
    id_transaksi: document.getElementById('editTrxIdTransaksi').value,
    items: items,
    pembayaran: document.getElementById('editTrxPembayaran').value,
    kasirNama: document.getElementById('editTrxKasir').value,
    idFeslit: document.getElementById('editTrxFeslit').value,
    jumlahBayar: Math.round(Number(document.getElementById('editTrxJumlahBayar').value)) || 0
  };

  GAS.run
    .withSuccessHandler(res => {
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        bootstrap.Modal.getInstance(document.getElementById('editTransaksiModal')).hide();
        loadTransaksiTable();
      } else {
        showToast('Gagal', res.message, 'danger');
      }
    })
    .withFailureHandler(err => showToast('Error', err.message, 'danger'))
    .updateTransaksiLengkap(payload);
  return false;
}

function confirmDeleteTransaksi(idTransaksi) {
  const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
  document.getElementById('confirmDeleteBtn').onclick = () => {
    GAS.run
      .withSuccessHandler(res => {
        modal.hide();
        if (res.success) { showToast('Berhasil', res.message, 'success'); loadTransaksiTable(); }
        else showToast('Gagal', res.message, 'danger');
      })
      .withFailureHandler(err => { modal.hide(); showToast('Error', err.message, 'danger'); })
      .deleteTransaksiLengkap(idTransaksi);
  };
  modal.show();
}

// ════════════════════════════════════════════════════════
// BAGIAN 10: KEUANGAN
// ════════════════════════════════════════════════════════

function loadKeuanganPage() {
  const container = document.getElementById('section-keuangan');
  container.innerHTML = `<div class="page-header"><h2>Keuangan</h2></div><div id="keuanganContent"></div>`;
  swr('trx:all', 'getRiwayatTransaksi', [{}], res => renderKeuangan(res.data || []),
    msg => showErrorInContainer('keuanganContent', msg, 'loadKeuanganPage'), { maxAge: 20000, loadingId: 'keuanganContent' });
}

function renderKeuangan(data) {
  try {
    const rekap = {};
    data.forEach(t => {
      const tgl = formatTanggal(t.Tanggal);
      if (!rekap[tgl]) rekap[tgl] = { Cash: 0, QRIS: 0, EDC: 0 };
      rekap[tgl][t.Pembayaran] = (rekap[tgl][t.Pembayaran] || 0) + Number(t.Netto);
    });
    const totalCash = data.filter(t => t.Pembayaran === 'Cash').reduce((s, t) => s + Number(t.Netto), 0);
    const totalQris = data.filter(t => t.Pembayaran === 'QRIS').reduce((s, t) => s + Number(t.Netto), 0);
    const totalEdc = data.filter(t => t.Pembayaran === 'EDC').reduce((s, t) => s + Number(t.Netto), 0);

    document.getElementById('keuanganContent').innerHTML = `
      <div class="row g-3 mb-4">
        <div class="col-12 col-md-4"><div class="stat-card"><div class="stat-icon" style="background:#16a34a;"><i class="bi bi-cash"></i></div><div><div class="stat-value">${formatRupiah(totalCash)}</div><div class="stat-label">Total Cash</div></div></div></div>
        <div class="col-12 col-md-4"><div class="stat-card"><div class="stat-icon" style="background:#1e6fd9;"><i class="bi bi-qr-code"></i></div><div><div class="stat-value">${formatRupiah(totalQris)}</div><div class="stat-label">Total QRIS</div></div></div></div>
        <div class="col-12 col-md-4"><div class="stat-card"><div class="stat-icon" style="background:#f59e0b;"><i class="bi bi-credit-card"></i></div><div><div class="stat-value">${formatRupiah(totalEdc)}</div><div class="stat-label">Total EDC</div></div></div></div>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Tanggal</th><th>Cash</th><th>QRIS</th><th>EDC</th><th>Total Harian</th></tr></thead>
          <tbody>
            ${Object.entries(rekap).map(([tgl, v]) => `
              <tr><td>${tgl}</td><td>${formatRupiah(v.Cash)}</td><td>${formatRupiah(v.QRIS)}</td><td>${formatRupiah(v.EDC)}</td><td>${formatRupiah(v.Cash + v.QRIS + v.EDC)}</td></tr>
            `).join('') || '<tr><td colspan="5" class="text-center py-4 text-secondary">Belum ada data.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    showErrorInContainer('keuanganContent', 'Kesalahan saat menampilkan data: ' + err.message, 'loadKeuanganPage');
  }
}

// ════════════════════════════════════════════════════════
// BAGIAN 11: LAPORAN (Tabel + Grafik)
// ════════════════════════════════════════════════════════

function loadLaporanPage() {
  const container = document.getElementById('section-laporan');
  container.innerHTML = `
    <div class="page-header">
      <h2>Laporan</h2>
      <div>
        <button class="btn btn-outline-accent me-2" onclick="window.print()"><i class="bi bi-printer"></i> Cetak</button>
        <button class="btn btn-accent" onclick="unduhLaporanCSV()"><i class="bi bi-download"></i> Unduh CSV</button>
      </div>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-6 col-md-3"><input type="date" class="form-control" id="lapTanggalMulai" onchange="muatLaporanDebounce()"></div>
      <div class="col-6 col-md-3"><input type="date" class="form-control" id="lapTanggalSelesai" onchange="muatLaporanDebounce()"></div>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-md-6"><div class="card p-3"><h6 class="mb-3">Top Produk Terlaris</h6><canvas id="chartLapProduk" height="220"></canvas></div></div>
      <div class="col-md-6"><div class="card p-3"><h6 class="mb-3">Penjualan POS vs NON POS</h6><canvas id="chartLapPos" height="220"></canvas></div></div>
    </div>
    <div id="lapTableContainer" class="table-responsive"></div>
  `;
  loadLaporanData();
}

let lastLaporanData = null;
function loadLaporanData() {
  const filter = {
    tanggalMulai: document.getElementById('lapTanggalMulai')?.value,
    tanggalSelesai: document.getElementById('lapTanggalSelesai')?.value
  };
  swr('lap:' + JSON.stringify(filter), 'getLaporanData', [filter], res => {
    lastLaporanData = res.data;
    renderLaporan(res.data);
  }, msg => showErrorInContainer('lapTableContainer', msg, 'loadLaporanData'), { maxAge: 30000, loadingId: 'lapTableContainer' });
}

function renderLaporan(data) {
  try {
    document.getElementById('lapTableContainer').innerHTML = `
      <table class="table">
        <thead><tr><th>Tanggal</th><th>Jumlah Transaksi</th><th>Total Penjualan</th><th>Diskon Diberikan</th></tr></thead>
        <tbody>
          ${data.rekapHarian.map(v => `
            <tr><td>${v.label}</td><td>${v.jumlahTransaksi}</td><td>${formatRupiah(v.totalPenjualan)}</td><td>${formatRupiah(v.totalDiskon)}</td></tr>
          `).join('') || '<tr><td colspan="4" class="text-center py-4 text-secondary">Belum ada data.</td></tr>'}
        </tbody>
      </table>
    `;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const ctxProduk = document.getElementById('chartLapProduk');
    if (chartInstances.lapProduk) chartInstances.lapProduk.destroy();
    const entries = Object.entries(data.produkCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    chartInstances.lapProduk = new Chart(ctxProduk, {
      type: 'bar',
      data: { labels: entries.map(e => e[0]), datasets: [{ label: 'Qty', data: entries.map(e => e[1]), backgroundColor: '#1e6fd9', borderRadius: 6 }] },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: isDark ? '#e6ecf5' : '#1c2733' }, grid: { display: false } }, y: { ticks: { color: isDark ? '#e6ecf5' : '#1c2733' }, grid: { color: isDark ? '#26334a' : '#e2e8f0' } } } }
    });

    const ctxPos = document.getElementById('chartLapPos');
    if (chartInstances.lapPos) chartInstances.lapPos.destroy();
    chartInstances.lapPos = new Chart(ctxPos, {
      type: 'doughnut',
      data: { labels: ['POS', 'NON POS'], datasets: [{ data: [data.posVsNon.POS, data.posVsNon['NON POS']], backgroundColor: ['#1e6fd9', '#f59e0b'], borderWidth: 0 }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: isDark ? '#e6ecf5' : '#1c2733' } } } }
    });
  } catch (err) {
    showErrorInContainer('lapTableContainer', 'Kesalahan saat menampilkan data: ' + err.message, 'loadLaporanData');
  }
}

function unduhLaporanCSV() {
  if (!lastLaporanData) { showToast('Peringatan', 'Data laporan belum dimuat.', 'warning'); return; }
  let csv = 'ID Transaksi,Tanggal,Kasir,Jenis,Qty,Total,Diskon,Pembayaran\n';
  lastLaporanData.records.forEach(t => {
    csv += `${t.id_transaksi},${formatTanggalJam(t.Tanggal)},${t.Kasir},${t.JenisTransaksi},${t.qty},${t.Netto},${t.Diskon}%,${t.Pembayaran}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'Laporan_Penjualan_' + new Date().toISOString().slice(0, 10) + '.csv';
  link.click();
}

// ════════════════════════════════════════════════════════
// BAGIAN 12: KASIR / USER (Admin Only)
// ════════════════════════════════════════════════════════

function loadKasirUserPage() {
  if (currentUser.Role !== 'Admin') { document.getElementById('section-kasirUser').innerHTML = '<p class="text-danger">Akses ditolak.</p>'; return; }
  const container = document.getElementById('section-kasirUser');
  container.innerHTML = `
    <div class="page-header"><h2>Kasir / User</h2><button class="btn btn-accent" onclick="openTambahKasir()"><i class="bi bi-plus-lg"></i> Tambah Kasir</button></div>
    <div id="kasirUserTableContainer" class="table-responsive"></div>
  `;
  loadKasirUserTable();
}

function loadKasirUserTable() {
  swr('kasirUser', 'getAllData', ['Kasir'], res => renderKasirUserTable(res.data || []),
    msg => showErrorInContainer('kasirUserTableContainer', msg, 'loadKasirUserTable'), { maxAge: 30000, loadingId: 'kasirUserTableContainer' });
}

function renderKasirUserTable(data) {
  try {
    document.getElementById('kasirUserTableContainer').innerHTML = `
      <table class="table">
        <thead><tr><th>ID Kasir</th><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          ${data.map(k => `
            <tr>
              <td>${k.id_kasir}</td><td>${k.Nama}</td><td>${k.Email}</td><td>${k.Role}</td>
              <td><span class="badge ${k.Status === 'Aktif' ? 'badge-aktif' : 'badge-nonaktif'}">${k.Status}</span></td>
              <td>
                <button class="btn btn-sm btn-outline-accent me-1" onclick='editKasir(${JSON.stringify(k).replace(/'/g, "&apos;")})'><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="confirmDelete('${k.ID}', 'Kasir', loadKasirUserTable)"><i class="bi bi-trash"></i></button>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="6" class="text-center py-4 text-secondary">Belum ada data kasir.</td></tr>'}
        </tbody>
      </table>
    `;
  } catch (err) {
    showErrorInContainer('kasirUserTableContainer', 'Kesalahan saat menampilkan data: ' + err.message, 'loadKasirUserTable');
  }
}

function openTambahKasir() {
  document.getElementById('kasirModalTitle').textContent = 'Tambah Kasir';
  document.getElementById('kasirForm').reset();
  document.getElementById('kasirID').value = '';
  document.getElementById('kasirIdKasir').value = '';
  document.getElementById('passHint').textContent = '(wajib diisi)';
  new bootstrap.Modal(document.getElementById('kasirModal')).show();
}

function editKasir(kasir) {
  document.getElementById('kasirModalTitle').textContent = 'Edit Kasir';
  document.getElementById('kasirID').value = kasir.ID;
  document.getElementById('kasirIdKasir').value = kasir.id_kasir;
  document.getElementById('kasirNama').value = kasir.Nama;
  document.getElementById('kasirEmail').value = kasir.Email;
  document.getElementById('kasirPassword').value = '';
  document.getElementById('passHint').textContent = '(kosongkan jika tidak diubah)';
  document.getElementById('kasirRole').value = kasir.Role;
  document.getElementById('kasirStatus').value = kasir.Status;
  new bootstrap.Modal(document.getElementById('kasirModal')).show();
}

function submitKasirForm(event) {
  event.preventDefault();
  const id = document.getElementById('kasirID').value;
  const kasir = {
    Nama: document.getElementById('kasirNama').value,
    Email: document.getElementById('kasirEmail').value,
    Password: document.getElementById('kasirPassword').value,
    Role: document.getElementById('kasirRole').value,
    Status: document.getElementById('kasirStatus').value
  };

  const finish = (res) => {
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      bootstrap.Modal.getInstance(document.getElementById('kasirModal')).hide();
      loadKasirUserTable();
    } else {
      showToast('Gagal', res.message, 'danger');
    }
  };

  if (id) {
    kasir.ID = id;
    kasir.id_kasir = document.getElementById('kasirIdKasir').value;
    GAS.run.withSuccessHandler(finish).withFailureHandler(err => showToast('Error', err.message, 'danger')).updateRecord('Kasir', kasir);
  } else {
    if (!kasir.Password) { showToast('Peringatan', 'Password wajib diisi untuk kasir baru.', 'warning'); return false; }
    GAS.run
      .withSuccessHandler(res => {
        finish(res);
      })
      .withFailureHandler(err => showToast('Error', err.message, 'danger'))
      .addRecord('Kasir', Object.assign(kasir, { id_kasir: 'KSR-' + Date.now().toString().slice(-6) }));
  }
  return false;
}

// ════════════════════════════════════════════════════════
// BAGIAN 13: PENGATURAN (Periode Feslit — Admin Only)
// ════════════════════════════════════════════════════════

function loadPengaturanPage() {
  if (currentUser.Role !== 'Admin') { document.getElementById('section-pengaturan').innerHTML = '<p class="text-danger">Akses ditolak.</p>'; return; }
  const container = document.getElementById('section-pengaturan');
  container.innerHTML = `
    <div class="page-header"><h2>Pengaturan — Periode Feslit</h2><button class="btn btn-accent" onclick="openTambahFeslit()"><i class="bi bi-plus-lg"></i> Tambah Periode</button></div>
    <div id="feslitTableContainer" class="table-responsive mb-4"></div>

    <div class="card p-3">
      <h6 class="mb-3">Identitas Aplikasi</h6>
      <form id="appSettingsForm" onsubmit="return submitAppSettings(event)">
        <div class="row g-2">
          <div class="col-md-6"><label class="form-label small">Nama Aplikasi</label><input type="text" class="form-control" id="cfgAppName"></div>
          <div class="col-md-6"><label class="form-label small">Nama Perusahaan</label><input type="text" class="form-control" id="cfgNamaPerusahaan"></div>
          <div class="col-md-12"><label class="form-label small">URL Logo</label><input type="text" class="form-control" id="cfgLogoUrl" placeholder="https://..."></div>
        </div>
        <button type="submit" class="btn btn-accent mt-3">Simpan Pengaturan</button>
      </form>
    </div>
  `;
  loadFeslitTable();
  loadAppSettingsForm();
}

function loadFeslitTable() {
  swr('periode:tbl', 'getAllData', ['Periode_Feslit'], res => renderFeslitTable(res.data || []),
    msg => showErrorInContainer('feslitTableContainer', msg, 'loadFeslitTable'), { maxAge: 30000, loadingId: 'feslitTableContainer' });
}

function renderFeslitTable(data) {
  try {
    document.getElementById('feslitTableContainer').innerHTML = `
      <table class="table">
        <thead><tr><th>ID</th><th>Nama Event</th><th>Tempat</th><th>Kategori</th><th>Mulai</th><th>Selesai</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          ${data.map(f => `
            <tr>
              <td>${f.id_feslit}</td><td>${f.NamaEvent}</td><td>${f.Tempat || '-'}</td><td>${f.Kategori}</td>
              <td>${f.TanggalMulai ? formatTanggal(f.TanggalMulai) : '-'}</td><td>${f.TanggalSelesai ? formatTanggal(f.TanggalSelesai) : '-'}</td>
              <td><span class="badge ${f.Status === 'Aktif' ? 'badge-aktif' : 'badge-nonaktif'}">${f.Status || '-'}</span></td>
              <td><button class="btn btn-sm btn-outline-accent me-1" onclick='editFeslit(${JSON.stringify(f).replace(/'/g, "&apos;")})'><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" onclick="confirmDelete('${f.ID}', 'Periode_Feslit', loadFeslitTable)"><i class="bi bi-trash"></i></button></td>
            </tr>
          `).join('') || '<tr><td colspan="8" class="text-center py-4 text-secondary">Belum ada periode.</td></tr>'}
        </tbody>
      </table>
    `;
    periodeAktifList = data;
    populateFeslitDropdownForKasir();
  } catch (err) {
    showErrorInContainer('feslitTableContainer', 'Kesalahan saat menampilkan data: ' + err.message, 'loadFeslitTable');
  }
}

function openTambahFeslit() {
  document.getElementById('feslitModalTitle').textContent = 'Tambah Periode Festival Literasi';
  document.getElementById('feslitForm').reset();
  document.getElementById('feslitID').value = '';
  document.getElementById('feslitIdFeslit').value = '';
  new bootstrap.Modal(document.getElementById('feslitModal')).show();
}

function editFeslit(f) {
  document.getElementById('feslitModalTitle').textContent = 'Edit Periode Festival Literasi';
  document.getElementById('feslitID').value = f.ID;
  document.getElementById('feslitIdFeslit').value = f.id_feslit;
  document.getElementById('feslitNamaEvent').value = f.NamaEvent;
  document.getElementById('feslitTempat').value = f.Tempat;
  document.getElementById('feslitKategori').value = f.Kategori;
  document.getElementById('feslitMulai').value = (f.TanggalMulai || '').substring(0, 10);
  document.getElementById('feslitSelesai').value = (f.TanggalSelesai || '').substring(0, 10);
  document.getElementById('feslitStatus').value = f.Status;
  new bootstrap.Modal(document.getElementById('feslitModal')).show();
}

function submitFeslitForm(event) {
  event.preventDefault();
  const id = document.getElementById('feslitID').value;
  const feslit = {
    NamaEvent: document.getElementById('feslitNamaEvent').value,
    Tempat: document.getElementById('feslitTempat').value,
    Kategori: document.getElementById('feslitKategori').value,
    TanggalMulai: document.getElementById('feslitMulai').value,
    TanggalSelesai: document.getElementById('feslitSelesai').value,
    Status: document.getElementById('feslitStatus').value
  };

  const finish = (res) => {
    if (res.success) {
      showToast('Berhasil', res.message, 'success');
      bootstrap.Modal.getInstance(document.getElementById('feslitModal')).hide();
      loadFeslitTable();
    } else {
      showToast('Gagal', res.message, 'danger');
    }
  };

  if (id) {
    feslit.ID = id;
    feslit.id_feslit = document.getElementById('feslitIdFeslit').value;
    GAS.run.withSuccessHandler(finish).withFailureHandler(err => showToast('Error', err.message, 'danger')).updateRecord('Periode_Feslit', feslit);
  } else {
    GAS.run
      .withSuccessHandler(finish)
      .withFailureHandler(err => showToast('Error', err.message, 'danger'))
      .addRecord('Periode_Feslit', Object.assign(feslit, { id_feslit: 'FES-' + Date.now().toString().slice(-6) }));
  }
  return false;
}

function loadAppSettingsForm() {
  swr('cfg', 'getAllConfig', [], res => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('cfgAppName', res.data.appName); set('cfgNamaPerusahaan', res.data.namaPerusahaan); set('cfgLogoUrl', res.data.logoUrl);
  }, null, { maxAge: 60000 });
}

function submitAppSettings(event) {
  event.preventDefault();
  const settings = {
    appName: document.getElementById('cfgAppName').value,
    namaPerusahaan: document.getElementById('cfgNamaPerusahaan').value,
    logoUrl: document.getElementById('cfgLogoUrl').value
  };
  GAS.run
    .withSuccessHandler(res => {
      if (res.success) {
        showToast('Berhasil', res.message, 'success');
        document.getElementById('appTitle').textContent = settings.appName;
        document.title = settings.appName;
      } else {
        showToast('Gagal', res.message, 'danger');
      }
    })
    .withFailureHandler(err => showToast('Error', err.message, 'danger'))
    .saveSettings(settings);
  return false;
}

// ════════════════════════════════════════════════════════
// BAGIAN 14: HAPUS DATA (Modal Konfirmasi Generik)
// ════════════════════════════════════════════════════════

function confirmDelete(id, sheetName, reloadFn) {
  const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
  document.getElementById('confirmDeleteBtn').onclick = () => {
    GAS.run
      .withSuccessHandler(res => {
        modal.hide();
        if (res.success) { showToast('Berhasil', res.message, 'success'); if (reloadFn) reloadFn(); }
        else showToast('Gagal', res.message, 'danger');
      })
      .withFailureHandler(err => { modal.hide(); showToast('Error', err.message, 'danger'); })
      .deleteRecord(sheetName, id);
  };
  modal.show();
}

// ════════════════════════════════════════════════════════
// BAGIAN 15: TAMBAHAN VERSI 2 (GitHub Pages)
// ════════════════════════════════════════════════════════

/** Warna sampul buku yang konsisten per judul (hue 0-360). */
function coverHue(text) {
  let h = 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** Tampil/sembunyikan password di halaman login. */
function togglePassword() {
  const input = document.getElementById('loginPassword');
  const icon = document.getElementById('togglePasswordIcon');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  icon.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
}

/** Dipanggil api.js saat token sesi ditolak server. */
function sesiBerakhir() {
  if (!currentUser) return;
  showToast('Sesi berakhir', 'Silakan login kembali.', 'warning');
  handleLogout();
}


// ════════════════════════════════════════════════════════
// BAGIAN 16: TURBO v3 — tampil instan, tanpa tersendat
//  - SWR: tampilkan data tersimpan LANGSUNG, perbarui di latar belakang
//  - Pencarian/filter dilakukan di browser (tanpa panggilan server per ketikan)
//  - Render ringan: batasi baris, event delegation, tanpa JSON di atribut HTML
//  - Checkout optimistis + kunci anti klik ganda
// ════════════════════════════════════════════════════════

const SWR_PREFIX = 'kc3:';
const swrMem = {};      // kunci -> { t, h, res }
const swrSeq = {};      // kunci -> nomor permintaan terakhir (jawaban basi diabaikan)
let swrEpoch = 0;       // naik tiap ada aksi tulis -> data sebelumnya dianggap basi

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '_' + s.length;
}
function swrUserKey(key) {
  return SWR_PREFIX + (currentUser ? (currentUser.id_kasir || currentUser.Email || 'u') : '-') + ':' + key;
}
function swrRead(key) {
  if (swrMem[key]) return swrMem[key];
  try {
    const raw = sessionStorage.getItem(swrUserKey(key));   // sessionStorage: hilang saat tab ditutup (aman di PC bersama)
    if (raw) { const o = JSON.parse(raw); swrMem[key] = o; return o; }
  } catch (e) { /* abaikan */ }
  return null;
}
function swrWrite(key, res, h) {
  const o = { t: Date.now(), h: h, res: res };
  swrMem[key] = o;
  try { const s = JSON.stringify(o); if (s.length < 1500000) sessionStorage.setItem(swrUserKey(key), s); } catch (e) { /* penuh: memori tetap dipakai */ }
}
function swrDrop(prefix) {
  Object.keys(swrMem).forEach(k => { if (k.indexOf(prefix) === 0) delete swrMem[k]; });
  try {
    const p = swrUserKey(prefix);
    Object.keys(sessionStorage).forEach(k => { if (k.indexOf(p) === 0) sessionStorage.removeItem(k); });
  } catch (e) { /* abaikan */ }
}
function swrPurge() {
  Object.keys(swrMem).forEach(k => delete swrMem[k]);
  try { Object.keys(sessionStorage).forEach(k => { if (k.indexOf(SWR_PREFIX) === 0) sessionStorage.removeItem(k); }); } catch (e) { /* abaikan */ }
}
function swrStaleAll() { swrEpoch = Date.now(); }

/**
 * Stale-While-Revalidate.
 *  1) bila ada data tersimpan -> render SEKARANG (tanpa spinner)
 *  2) bila data masih segar (< maxAge & belum ada tulis sesudahnya) -> selesai, tanpa ke server
 *  3) selain itu ambil dari server; render ulang HANYA bila isinya berubah
 */
function swr(key, fnName, args, render, onFail, opts) {
  opts = opts || {};
  const maxAge = opts.maxAge != null ? opts.maxAge : 20000;
  const hit = swrRead(key);
  const seq = swrSeq[key] = (swrSeq[key] || 0) + 1;
  let shown = false;
  if (hit && hit.res) {
    try { render(hit.res, true); shown = true; } catch (e) { console.error(e); }
    if (hit.t > swrEpoch && (Date.now() - hit.t) < maxAge) return;
  } else if (opts.loadingId) {
    showLoading(opts.loadingId);
  }
  const runner = GAS.run
    .withSuccessHandler(res => {
      if (!res || !res.success) { if (seq === swrSeq[key] && !shown && onFail) onFail((res && res.message) || 'Gagal memuat data.'); return; }
      const h = hashStr(JSON.stringify(res.data));
      if (hit && hit.h === h) { swrMem[key] = { t: Date.now(), h: h, res: hit.res }; return; }   // sama: tak perlu render ulang
      swrWrite(key, res, h);                           // cache selalu diperbarui
      if (seq === swrSeq[key]) render(res, false);     // render hanya untuk permintaan terbaru

    })
    .withFailureHandler(err => {
      if (seq !== swrSeq[key]) return;
      if (!shown) { if (onFail) onFail(err.message); }
      else showToast('Koneksi lambat', 'Menampilkan data tersimpan. ' + err.message, 'warning');
    });
  runner[fnName].apply(null, args);
}

/** Dipanggil api.js setelah aksi TULIS berhasil. */
function apiAfterWrite(action, args) {
  swrStaleAll();   // dashboard/laporan: tampil dulu yang lama, lalu diperbarui di latar belakang
  if (/Transaksi/.test(action)) { swrDrop('trx:'); swrDrop('det:'); }
  if (action === 'addProdukCepat') { swrDrop('produk'); swrDrop('katalog'); }
  if (action === 'saveSettings') swrDrop('cfg');
  if (action === 'addRecord' || action === 'updateRecord' || action === 'deleteRecord') {
    const sh = args && args[0];
    if (sh === 'Produk') { swrDrop('produk'); swrDrop('katalog'); }
    if (sh === 'Kasir') swrDrop('kasirUser');
    if (sh === 'Periode_Feslit') { swrDrop('periode'); swrDrop('trx:'); }
  }
}

/** Isi cache dari respons login (opt-in 'boot') agar setelah login tidak ada request lagi. */
function seedDariBoot(b) {
  try {
    if (b.periode && b.periode.success) swrWrite('periode', b.periode, hashStr(JSON.stringify(b.periode.data)));
    if (b.produk && b.produk.success) swrWrite('produk', b.produk, hashStr(JSON.stringify(b.produk.data)));
    if (b.dash && b.dash.success) swrWrite('dash:', b.dash, hashStr(JSON.stringify(b.dash.data)));
  } catch (e) { /* cadangan: muat normal */ }
}

/** Menu sekunder dimuat saat browser menganggur -> Transaksi, Keuangan, Laporan terbuka instan. Digabung jadi 1 eksekusi (batch). */
function prefetchMenuSekunder() {
  const jalan = () => {
    if (!currentUser) return;
    swr('trx:all', 'getRiwayatTransaksi', [{}], () => {}, null, { maxAge: 30000 });
    const f = { tanggalMulai: '', tanggalSelesai: '' };
    swr('lap:' + JSON.stringify(f), 'getLaporanData', [f], () => {}, null, { maxAge: 30000 });
  };
  (window.requestIdleCallback ? window.requestIdleCallback(jalan, { timeout: 2500 }) : setTimeout(jalan, 1500));
}

/** Tombol "Segarkan Data": ambil ulang dari Sheets (berguna bila data diedit langsung di spreadsheet). */
function segarkanHalaman() {
  const aktif = document.querySelector('.content-section.active');
  if (!aktif) return;
  const id = aktif.id.replace('section-', '');
  swrPurge();
  GAS_STATE.nextFresh = true;
  showToast('Menyegarkan', 'Mengambil data terbaru dari server...', 'info');
  if (id === 'kasir') muatProdukKeCache();   // jangan menyentuh keranjang yang sedang berjalan
  else navigateTo(id);
}

// ── Produk: indeks pencarian & grid ringan ──
let produkIndex = {}, produkIsbnMap = {}, produkIdLower = {}, produkHay = [];
let produkFiltered = [], produkShown = 0;
const PRODUK_PAGE = 60;

function setProdukCache(list) {
  produkCache = list;
  produkIndex = {}; produkIsbnMap = {}; produkIdLower = {};
  produkHay = list.map(p => {
    produkIndex[p.id_produk] = p;
    const d = String(p.ISBN || '').replace(/[^0-9]/g, '');
    if (d.length >= 8) produkIsbnMap[d] = p;
    produkIdLower[String(p.id_produk || '').toLowerCase()] = p;
    return (String(p.Judul) + ' ' + p.ISBN + ' ' + p.Penerbit).toLowerCase();
  });
}

function jalankanCariProduk() {
  const el = document.getElementById('produkSearchInput');
  const kw = (el ? el.value : '').trim().toLowerCase();
  if (!kw) { produkFiltered = produkCache; }
  else {
    const terms = kw.split(/\s+/);
    produkFiltered = produkCache.filter((p, i) => terms.every(t => produkHay[i].indexOf(t) > -1));
  }
  renderProdukGrid(produkFiltered);
}

function onProdukGridClick(e) {
  const card = e.target.closest('.produk-card');
  if (!card) return;
  if (card.dataset.add) { openTambahProdukCepat(); return; }
  if (card.dataset.more) { renderProdukGrid(produkFiltered, produkShown + PRODUK_PAGE); return; }
  const p = produkIndex[card.dataset.id];
  if (!p) return;
  card.classList.add('tap'); setTimeout(() => card.classList.remove('tap'), 120);
  tambahKeKeranjang(p);
}

// ── Checkout optimistis ──
let sedangSimpan = false;

function setCheckoutBusy(busy) {
  const btn = document.getElementById('btnCheckout');
  if (!btn) return;
  btn.disabled = busy;
  btn.innerHTML = busy ? '<span class="spinner-inline"></span> Menyimpan...' : '<i class="bi bi-check-circle"></i> Simpan & Cetak Struk';
}

/** Hitung struk di browser dengan rumus yang sama seperti server (untuk tampilan langsung). */
function hitungStrukLokal(payload) {
  let asli = 0, netto = 0;
  payload.items.forEach(i => { asli += Math.round(Number(i.HargaAsli)) * Number(i.qty); netto += Math.round(Number(i.Harga)) * Number(i.qty); });
  asli = Math.round(asli); netto = Math.round(netto);
  const nominalDiskon = asli - netto;
  const jumlahBayar = Math.round(Number(payload.jumlahBayar) || netto);
  return {
    _pending: true, idTransaksi: '', tanggal: new Date().toISOString(), totalHarga: asli,
    diskonPersen: asli > 0 ? Math.round(nominalDiskon / asli * 10000) / 100 : 0, nominalDiskon: nominalDiskon,
    netto: netto, pembayaran: payload.pembayaran, jumlahBayar: jumlahBayar, kembalian: jumlahBayar - netto,
    kasirNama: payload.kasirNama, items: payload.items
  };
}

function tampilkanStrukGagal(pesan) {
  const content = document.getElementById('previewContent');
  if (content) content.innerHTML = `<div class="alert alert-danger mb-0"><strong>Transaksi belum tersimpan.</strong><div class="small mt-1">${esc(pesan)}</div><div class="small mt-2">Keranjang Anda masih utuh. Tutup jendela ini lalu coba lagi.</div></div>`;
  const pb = document.getElementById('btnCetakStruk'); if (pb) pb.disabled = true;
  document.getElementById('previewModalTitle').textContent = 'Gagal Menyimpan';
}

// ── Katalog / Transaksi: data penuh di memori, filter lokal, tampil bertahap ──
let katalogData = [], katalogFiltered = [], katalogShown = 0, katalogTimer = null;
const KATALOG_PAGE = 100;
let trxData = [], trxFiltered = [], trxShown = 0, trxTimer = null;
const TRX_PAGE = 100;
let laporanTimer = null;

function filterKatalogLokal() { clearTimeout(katalogTimer); katalogTimer = setTimeout(terapkanFilterKatalog, 120); }
function terapkanFilterKatalog() {
  const el = document.getElementById('katalogSearchInput');
  const terms = (el ? el.value : '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  katalogFiltered = !terms.length ? katalogData : katalogData.filter(p => {
    const h = (p.Judul + ' ' + p.ISBN + ' ' + p.Penerbit).toLowerCase();
    return terms.every(t => h.indexOf(t) > -1);
  });
  renderKatalogTable(katalogFiltered, KATALOG_PAGE);
}
function tampilkanLebihKatalog() { renderKatalogTable(katalogFiltered, katalogShown + KATALOG_PAGE); }
function editProdukIdx(i) { if (katalogFiltered[i]) editProduk(katalogFiltered[i]); }

function filterTransaksiLokal(segera) {
  clearTimeout(trxTimer);
  if (segera === true) return terapkanFilterTrx();
  trxTimer = setTimeout(terapkanFilterTrx, 150);
}
function terapkanFilterTrx() {
  const v = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const kw = v('trxSearchInput').trim().toLowerCase(), bayar = v('trxPembayaranFilter');
  const mulai = v('trxTanggalMulai') ? new Date(v('trxTanggalMulai') + 'T00:00:00') : null;
  const selesai = v('trxTanggalSelesai') ? new Date(v('trxTanggalSelesai') + 'T23:59:59') : null;
  trxFiltered = trxData.filter(t => {
    if (kw && String(t.id_transaksi).toLowerCase().indexOf(kw) < 0) return false;
    if (bayar && t.Pembayaran !== bayar) return false;
    if (mulai || selesai) { const d = new Date(t.Tanggal); if (mulai && d < mulai) return false; if (selesai && d > selesai) return false; }
    return true;
  });
  renderTransaksiTable(trxFiltered, TRX_PAGE);
}
function tampilkanLebihTrx() { renderTransaksiTable(trxFiltered, trxShown + TRX_PAGE); }
function editTrxIdx(i) { if (trxFiltered[i]) openEditTransaksi(trxFiltered[i]); }

function muatLaporanDebounce() { clearTimeout(laporanTimer); laporanTimer = setTimeout(loadLaporanData, 250); }

/**
 * Bootstrap mengabaikan hide() bila modal sedang bertransisi. Bila kasir menekan "Tutup" tepat saat
 * modal baru muncul (mis. gagal-simpan datang cepat), layar bisa terkunci. Ulangi hide() setelah transisi.
 */
document.addEventListener('click', function (e) {
  const b = e.target.closest && e.target.closest('[data-bs-dismiss="modal"]');
  if (!b) return;
  const m = b.closest('.modal');
  if (!m) return;
  setTimeout(function () {
    if (m.classList.contains('show')) { const inst = bootstrap.Modal.getInstance(m); if (inst) inst.hide(); }
  }, 450);
});
