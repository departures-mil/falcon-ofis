/*
 * v1.50: Falcon Ofis — Wi‑Fi (internetsiz) eşitleme bağdaştırıcısı. lan-vendor.js, lan-db.js ve lan.js'ten sonra yüklenir.
 * Bilgisayar: kayıtlar arka plan sürecinde (preload → falcon.lan) birleştirilir; sunucu orada çalışır.
 * Telefon: veritabanı bu sayfada (window.__falconInternals.db); ağ istekleri telefon kabuğundaki FalconLan köprüsünden.
 */
(function () {
  'use strict';
  // Bulut eşitlemesindeki dosya sütunları (sync.js FILE_COLUMNS ile aynı)
  var FILE_COLUMNS = { electricity_meters: 'photo_path', electricity_readings: 'photo_path', internet_services: 'qr_path', recurring_plans: 'qr_path', recurring_files: 'file_path', receipts: 'file_path', product_images: 'file_path', materials: 'image_path', fixed_assets: 'image_path', asset_images: 'file_path', trade_files: 'file_path', item_codes: 'image_path', cash_transactions: 'sc_qr_path', shamcash_payees: 'qr_path', invoice_files: 'file_path' };
  var META_KEY = 'falcon-lan-meta';
  var cache = { account: '', files: new Set(), cols: FILE_COLUMNS };
  var cbSeq = 0;
  var cbs = {};

  var F = function () { return window.falcon || {}; };
  var isDesk = function () { return F().platform === 'desktop'; };

  // Telefon kabuğu (FalconLan) geri çağrıları
  window.__falconLanCb = function (id, json) {
    var f = cbs[id];
    if (!f) return;
    delete cbs[id];
    var r;
    try { r = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { r = { status: 0, body: String(json) }; }
    f(r);
  };
  function javaCall(fn, args) {
    return new Promise(function (resolve) {
      var id = 'l' + (++cbSeq);
      cbs[id] = resolve;
      try { window.FalconLan[fn].apply(window.FalconLan, [id].concat(args)); } catch (e) { delete cbs[id]; resolve({ status: 0, body: String(e && e.message || e) }); }
    });
  }

  var phoneNative = {
    lanHttp: function (m, url, body, ms, key) { return javaCall('lanHttp', [String(m), String(url), String(body || ''), Number(ms) || 60000, String(key || '')]); },
    lanFind: function (port, key, appId) { return javaCall('lanFind', [Number(port), String(key || ''), String(appId)]); },
    lanIps: function () { try { return JSON.parse(window.FalconLan.lanIps()); } catch (e) { return []; } }
  };

  function native() {
    if (isDesk()) return F().lan || {};
    return window.FalconLan && typeof window.FalconLan.lanHttp === 'function' ? phoneNative : {};
  }

  /* ---------- telefon: veritabanı bu sayfada ---------- */
  var store = null;
  function phoneDb() { return window.__falconInternals && window.__falconInternals.db; }
  function phoneStore() {
    if (!store && phoneDb()) store = window.FalconLanDb.createLanStore(phoneDb(), { fileColumns: FILE_COLUMNS });
    return store;
  }
  function phoneAccount() {
    var db = phoneDb();
    if (!db) return '';
    var uid = db.get("SELECT value FROM sync_meta WHERE key = 'uid'");
    var v = db.get('SELECT MAX(version) AS v FROM schema_migrations');
    return ((uid && uid.value) || '') + '|s' + (v ? v.v : 0);
  }
  var A = function () { return window.FalconAndroid || {}; };
  function phoneChanged() {
    try { var s = window.falcon && window.falcon.sync; if (s && s.__emit) s.__emit(); } catch (e) { /* */ }
    try { var sy = window.__falconInternals && window.__falconInternals.sync; if (sy && sy.poke) sy.poke(); } catch (e) { /* */ }
  }

  function lang() {
    var l = (document.documentElement.getAttribute('lang') || 'tr').slice(0, 2);
    return l === 'ar' || l === 'en' ? l : 'tr';
  }

  function fileRefs(state) {
    var set = {};
    var docs = (state && state.docs) || {};
    Object.keys(docs).forEach(function (id) {
      var doc = docs[id];
      var col = cache.cols[doc.t];
      if (col && doc.d && doc.d[col]) set[String(doc.d[col])] = 1;
    });
    return Object.keys(set);
  }

  function accountCheck(theirs, mine) {
    var t = String(theirs || '').split('|');
    var m = String(mine || '').split('|');
    if (t[0] && m[0] && t[0] !== m[0]) return 'account';
    if (t[1] && m[1] && t[1] !== m[1]) return 'e_ver';
    return '';
  }

  var adapter = {
    app: 'falcon-ofis',
    get native() { return native(); },
    call: function (fn) {
      var a = Array.prototype.slice.call(arguments, 1);
      var n = native();
      if (typeof n[fn] !== 'function') return Promise.reject(new Error('e_old'));
      return Promise.resolve(n[fn].apply(n, a));
    },
    lang: lang,
    isDesktop: isDesk,
    account: function () { return cache.account; },
    accountCheck: accountCheck,
    device: function () { return isDesk() ? { id: 'pc', name: 'Bilgisayar' } : { id: 'phone', name: 'Telefon' }; },
    busy: function () {
      if (isDesk()) return false;
      var sy = window.__falconInternals && window.__falconInternals.sync;
      return !!(sy && sy.isRunning && sy.isRunning());
    },
    body: function (d) { return d && d.d; },
    stamp: function (d) { return Number(d && d.at) || 0; },
    merge: function (a, b) { return window.FalconLanDb.merge(a, b); },
    exportState: async function () {
      if (isDesk()) {
        var r = await F().lan.exportState();
        cache.account = r.account;
        cache.cols = r.fileColumns || FILE_COLUMNS;
        cache.files = new Set(r.files || []);
        return r.state;
      }
      var st = phoneStore().exportState();
      cache.account = phoneAccount();
      var refs = fileRefs(st);
      cache.files = new Set(refs.filter(function (rel) { try { return !!A().fileExists(rel); } catch (e) { return false; } }));
      return st;
    },
    applyState: async function (merged, sum) {
      var rep;
      if (isDesk()) { rep = await F().lan.applyState(merged, ''); if (sum && rep) sum.conflicts = rep.conflicts; return rep; }
      rep = phoneStore().applyState(merged, { dev: '' });
      if (sum && rep) sum.conflicts = rep.conflicts;
      try { if (phoneDb().flush) phoneDb().flush(); } catch (e) { /* */ }
      phoneChanged();
      return rep;
    },
    blobIds: fileRefs,
    hasBlob: function (rel) { return cache.files.has(rel); },
    getBlob: async function (rel) {
      if (isDesk()) return F().lan.readFile(rel);
      try { return A().readFile(rel) || ''; } catch (e) { return ''; }
    },
    putBlob: async function (rel, b64) {
      if (!b64 || cache.files.has(rel)) return;
      if (isDesk()) await F().lan.writeFile(rel, b64);
      else if (!A().fileExists(rel)) A().writeFile(rel, b64);
      cache.files.add(rel);
    },
    photosChanged: function () { phoneChanged(); },
    loadMeta: function () { try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) { return null; } },
    saveMeta: function (m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* */ } },
    deviceName: function () { return 'Falcon Ofis · Bilgisayar'; },
    refresh: function () { try { if (window.__falconLanRefresh) window.__falconLanRefresh(); } catch (e) { /* */ } }
  };

  function boot() {
    if (!window.LanCore || !window.FalconLanDb) return;
    window.LanCore.init(adapter);
    if (isDesk()) {
      var l = F().lan;
      if (l && l.onDone) l.onDone(function (r) {
        var rep = (r && r.rep) || {};
        var n = (rep.written || 0) + (rep.deleted || 0);
        window.LanCore.toast('📶 ' + (r && r.dev ? r.dev + ' · ' : '') + (lang() === 'ar' ? 'تمت المزامنة عبر Wi‑Fi' : lang() === 'en' ? 'Synced over Wi‑Fi' : 'Wi‑Fi ile eşitlendi') + (n ? ' (' + n + ')' : '') + ' ✓');
        adapter.refresh();
      });
    } else {
      // Telefon: açılışta ve öne gelince aynı ağdaki bilgisayarla sessizce eşitlemeyi dener
      var tryAuto = function () { if (phoneDb()) window.LanCore.autoTry(); };
      setTimeout(tryAuto, 6000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(tryAuto, 2500); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
