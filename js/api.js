/**
 * ============================================================
 * JEMBATAN API v3 — frontend (GitHub Pages) <-> Google Apps Script
 *
 * Seluruh pemanggilan server di app.js memakai pola:
 *     GAS.run.withSuccessHandler(ok).withFailureHandler(gagal).namaFungsi(arg1, arg2)
 *
 * Tambahan v3 (gas-scale-turbo):
 *  - Pengukur waktu: Perf.table() / Perf.summary() di console browser
 *  - Permintaan BACA identik yang sedang berjalan digabung (dedupe) + epoch tulis
 *  - Beberapa BACA di tik yang sama digabung otomatis jadi 1 eksekusi server (batch)
 *  - Timeout + 1x ulang otomatis untuk BACA saat jaringan putus (TULIS tidak pernah diulang otomatis)
 *  - Bilah progres tipis di atas layar sebagai umpan balik instan
 *  - Pemanasan server (warmUpServer) agar request pertama tidak "dingin"
 * ============================================================
 */

const READ_ACTIONS = /^(getAllData|getAllProdukCached|searchProduk|getRiwayatTransaksi|getDetailTransaksi|getDashboardData|getLaporanData|getAllConfig)$/;
const NON_DATA_ACTIONS = /^(loginUser|logoutUser)$/;
const TIMEOUT_READ = 25000;
const TIMEOUT_WRITE = 45000;

const GAS_STATE = { nextFresh: false };   // true = permintaan BACA berikutnya melewati cache server (tombol Segarkan)
let _writeEpoch = 0;                       // naik tiap aksi tulis -> baca sesudahnya tak menumpang baca lama
let _pending = 0;
let _batchOK = true;                       // false bila backend lama tidak mengenal 'batch'
const _inflight = {};

// ── Pengukur ──
const Perf = {
  rows: [],
  add(r) { this.rows.push(r); if (this.rows.length > 300) this.rows.shift(); },
  table() { console.table(this.rows); },
  summary() {
    const g = {};
    this.rows.forEach(r => { const a = g[r.aksi] = g[r.aksi] || { aksi: r.aksi, n: 0, total: 0, server: 0, nServer: 0, cache: 0 }; a.n++; a.total += r.total; if (typeof r.server === 'number') { a.server += r.server; a.nServer++; } if (r.cache) a.cache++; });
    console.table(Object.values(g).map(a => ({ aksi: a.aksi, panggilan: a.n, 'rata2 total (ms)': Math.round(a.total / a.n), 'rata2 server (ms)': a.nServer ? Math.round(a.server / a.nServer) : '-', 'dari cache server': a.cache })));
  }
};

// ── Bilah progres: muncul bila request > 150 ms (tidak berkedip untuk request cepat) ──
let _barTimer = null;
function progress(delta) {
  _pending += delta;
  const bar = document.getElementById('topProgress');
  if (!bar) return;
  if (_pending > 0) {
    if (!_barTimer && !bar.classList.contains('on')) {
      _barTimer = setTimeout(() => { _barTimer = null; bar.classList.remove('done'); bar.classList.add('on'); }, 150);
    }
  } else {
    _pending = 0;
    if (_barTimer) { clearTimeout(_barTimer); _barTimer = null; }
    if (bar.classList.contains('on')) {
      bar.classList.remove('on'); bar.classList.add('done');
      setTimeout(() => bar.classList.remove('done'), 600);
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callApi(action, args, timeoutMs, fresh) {
  if (!GAS_URL || GAS_URL.indexOf('GANTI_DENGAN') === 0) {
    throw new Error('GAS_URL belum diisi. Edit js/config.js lalu push ulang.');
  }
  let user = null;
  try { user = JSON.parse(sessionStorage.getItem('currentUser') || 'null'); } catch (e) { /* abaikan */ }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      // WAJIB text/plain: application/json memicu CORS preflight yang ditolak Apps Script
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, args: args, token: user ? user.token : null, fresh: !!fresh }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('Server membalas status ' + res.status);
    const json = await res.json();
    if (json && json.v === undefined) _batchOK = false;   // backend lama (tanpa field v) belum mengenal 'batch'
    Perf.add({ aksi: action, total: Math.round(performance.now() - t0), server: json.ms, cache: !!json.cached, v: json.v });
    return json;
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const err = new Error('Server terlalu lama merespons (' + Math.round(timeoutMs / 1000) + ' dtk).');
      err._net = true; err._timeout = true; throw err;
    }
    if (e instanceof TypeError) {
      const err = new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.');
      err._net = true; throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function apiRun(action, args, isRead, fresh) {
  progress(1);
  try {
    try {
      return await callApi(action, args, isRead ? TIMEOUT_READ : TIMEOUT_WRITE, fresh);
    } catch (e) {
      if (isRead && e._net && !e._timeout) { await sleep(700); return await callApi(action, args, TIMEOUT_READ, fresh); }
      throw e;
    }
  } catch (e) {
    if (!isRead && e._net && !NON_DATA_ACTIONS.test(action)) {
      e.message += ' Bila ragu apakah sudah tersimpan, cek menu Transaksi/Katalog sebelum mengulang.';
    }
    throw e;
  } finally {
    progress(-1);
  }
}

// ── Penggabung batch: BACA yang diminta di tik yang sama dikirim sebagai 1 eksekusi server ──
const Batcher = {
  q: null,
  add(action, args, fresh) {
    return new Promise((resolve, reject) => {
      if (!this.q) { this.q = []; setTimeout(() => this.flush(), 0); }
      this.q.push({ action: action, args: args, fresh: fresh, resolve: resolve, reject: reject });
    });
  },
  flush() {
    const q = this.q; this.q = null;
    if (!q || !q.length) return;
    const fresh = q.some(c => c.fresh);
    GAS_STATE.nextFresh = false;

    // gabung permintaan yang identik
    const groups = []; const idx = {};
    q.forEach(c => {
      const k = c.action + '|' + JSON.stringify(c.args);
      if (idx[k] === undefined) { idx[k] = groups.length; groups.push({ action: c.action, args: c.args, waiters: [] }); }
      groups[idx[k]].waiters.push(c);
    });

    const single = g => apiRun(g.action, g.args, true, fresh)
      .then(res => g.waiters.forEach(w => w.resolve(res)))
      .catch(err => g.waiters.forEach(w => w.reject(err)));

    if (groups.length === 1 || !_batchOK) { groups.forEach(single); return; }

    for (let i = 0; i < groups.length; i += 10) {
      const chunk = groups.slice(i, i + 10);
      if (chunk.length === 1) { single(chunk[0]); continue; }
      apiRun('batch', [chunk.map(g => ({ action: g.action, args: g.args }))], true, fresh)
        .then(res => {
          if (res && res.code === 'AUTH') { chunk.forEach(g => g.waiters.forEach(w => w.resolve(res))); return; }
          if (!res || !res.success || !Array.isArray(res.data)) {
            // backend lama belum mengenal 'batch' -> jalankan satu per satu (kompatibel)
            if (res && /Aksi tidak dikenal/.test(res.message || '')) _batchOK = false;
            chunk.forEach(single); return;
          }
          chunk.forEach((g, j) => g.waiters.forEach(w => w.resolve(res.data[j])));
        })
        .catch(err => chunk.forEach(g => g.waiters.forEach(w => w.reject(err))));
    }
  }
};

/** Titik masuk: BACA (dedupe + batch) atau TULIS (langsung, tanpa ulang otomatis). */
function api(action, args) {
  if (NON_DATA_ACTIONS.test(action)) return apiRun(action, args, false, false);

  if (!READ_ACTIONS.test(action)) {
    _writeEpoch++;
    return apiRun(action, args, false, false).then(res => {
      if (res && res.success && typeof apiAfterWrite === 'function') apiAfterWrite(action, args, res);
      return res;
    });
  }
  const fresh = GAS_STATE.nextFresh;
  const k = _writeEpoch + '|' + action + '|' + JSON.stringify(args) + '|' + (fresh ? 1 : 0);
  if (_inflight[k]) return _inflight[k];
  const p = Batcher.add(action, args, fresh);
  _inflight[k] = p;
  const clear = () => { delete _inflight[k]; };
  p.then(clear, clear);
  return p;
}

// ── Gaya lama tetap bisa dipakai: GAS.run.withSuccessHandler(..).withFailureHandler(..).fn(args) ──
const GAS = {
  get run() {
    let onOk = function () {};
    let onFail = function (err) { console.error(err); };
    const runner = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'withSuccessHandler') return function (fn) { onOk = fn; return runner; };
        if (prop === 'withFailureHandler') return function (fn) { onFail = fn; return runner; };
        return function () {
          const args = Array.prototype.slice.call(arguments);
          api(String(prop), args)
            .then(function (res) {
              if (res && res.code === 'AUTH') { if (typeof sesiBerakhir === 'function') sesiBerakhir(); return; }
              onOk(res);
            })
            .catch(function (err) { onFail(err); });
        };
      }
    });
    return runner;
  }
};

/** Bangunkan server di latar belakang (GET tanpa data). Maks. 1x per 4 menit per lingkup. */
function warmUpServer(scope) {
  try {
    if (!GAS_URL || GAS_URL.indexOf('GANTI_DENGAN') === 0) return;
    const k = 'warm_' + scope;
    if (Date.now() - (+sessionStorage.getItem(k) || 0) < 240000) return;
    sessionStorage.setItem(k, String(Date.now()));
    fetch(GAS_URL + '?w=' + encodeURIComponent(scope), { mode: 'no-cors', keepalive: true }).catch(function () {});
  } catch (e) { /* pemanasan tidak boleh mengganggu */ }
}
