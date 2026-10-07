/**
 * ============================================================
 * JEMBATAN API — frontend (GitHub Pages) <-> Google Apps Script
 * Seluruh pemanggilan server di app.js memakai pola:
 *     GAS.run.withSuccessHandler(ok).withFailureHandler(gagal).namaFungsi(arg1, arg2)
 * yang di sini diterjemahkan menjadi satu fetch() POST ke GAS_URL.
 * ============================================================
 */
async function callApi(action, args) {
  if (!GAS_URL || GAS_URL.indexOf('GANTI_DENGAN') === 0) {
    throw new Error('GAS_URL belum diisi. Edit js/config.js lalu push ulang.');
  }
  let user = null;
  try { user = JSON.parse(sessionStorage.getItem('currentUser') || 'null'); } catch (e) { /* abaikan */ }

  const res = await fetch(GAS_URL, {
    method: 'POST',
    // WAJIB text/plain: application/json memicu CORS preflight yang ditolak Apps Script
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, args: args, token: user ? user.token : null })
  });
  if (!res.ok) throw new Error('Server membalas status ' + res.status);
  return res.json();
}

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
          callApi(String(prop), args)
            .then(function (res) {
              if (res && res.code === 'AUTH') { if (typeof sesiBerakhir === 'function') sesiBerakhir(); return; }
              onOk(res);
            })
            .catch(function (err) {
              const pesan = (err && err.message === 'Failed to fetch')
                ? new Error('Tidak dapat terhubung ke server. Periksa koneksi internet dan GAS_URL.') : err;
              onFail(pesan);
            });
        };
      }
    });
    return runner;
  }
};
