/*
 * v1.80.0: Falcon Ofis — hızlı telefon güncellemesi (yalnız telefon; index-*.js'teki __fgD bunu çağırır).
 *
 * Sıra:
 *  1. Yama (yalnızca değişen kısımlar): telefon.json `patches[<kurulu sürüm>]` varsa yalnız değişen dosyalar iner,
 *     değişmeyenler telefondaki kurulu www'den okunur (her dosya SHA-256 ile denetlenir), paket telefonda yeniden kurulur
 *     ("saklı" gzip, bayt bayt belirlenmiş) ve imzası `raw.sig` ile doğrulanır. Bir şey uymazsa tam pakete geçilir.
 *  2. Kaynaklar: önce aynı Wi‑Fi'deki bilgisayar (eşleşmişse ve dosya onda hazırsa), sonra internet:
 *     jsDelivr (commit'e sabitlenmiş) + raw GitHub, 512 KB'lık parçalar 6 bağlantıyla paralel; yavaş kalan parça
 *     boştaki bağlantıyla öbür kaynaktan da istenir (ilk gelen alınır). Aralık (Range) desteklenmezse tek akış.
 *  3. Hız: son 4 saniyenin ortalaması (başlangıçtaki bağlantı kurulma süresi hızı düşük göstermez).
 */
(function () {
  'use strict';
  var RAW = window.__hgRaw || 'https://raw.githubusercontent.com/departures-mil/falcon-ofis/main/guncelleme/'; // __hgRaw: yalnız test
  var CHUNK = 512 * 1024;
  var WORKERS = 6;
  var NATIVE_CHUNK = 393216;
  var LAN_CHUNK = 1024 * 1024;

  function err(code, why) { var e = new Error(code); e.detail = why; return e; }
  function log() { try { console.log.apply(console, ['[hızlı güncelleme]'].concat([].slice.call(arguments))); } catch (e) { /* */ } }

  /* ---------------- hız ölçer ---------------- */
  function Meter(total, c, info) {
    var hist = [];
    var last = 0;
    var m = {
      done: 0,
      total: total,
      info: info || {},
      emit: function (force) {
        var t = Date.now();
        if (!force && t - last < 150) return;
        last = t;
        hist.push([t, m.done]);
        while (hist.length > 2 && t - hist[0][0] > 4000) hist.shift();
        var sp = 0;
        var span = (t - hist[0][0]) / 1000;
        if (span >= 0.5) sp = (m.done - hist[0][1]) / span;
        try {
          c({ phase: 'download', done: Math.min(m.done, m.total), total: m.total, speed: sp > 0 ? sp : 0, mode: m.info.mode, src: m.info.src, conns: m.info.conns });
        } catch (e) { /* */ }
      },
      add: function (n) { m.done += n; m.emit(false); }
    };
    return m;
  }

  /* ---------------- yardımcılar ---------------- */
  function hex(buf) {
    var a = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16);
    return s;
  }
  function sha256(u8) { return crypto.subtle.digest('SHA-256', u8).then(hex); }

  var CRC_T = null;
  function crc32(u8) {
    if (!CRC_T) {
      CRC_T = new Uint32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < u8.length; i++) crc = CRC_T[(crc ^ u8[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** FOPK1 ham paketi (sunucudaki createPack ile aynı düzen; sıkıştırmasız). */
  function buildRaw(version, list, datas) {
    var enc = new TextEncoder();
    var header = enc.encode(JSON.stringify({ version: version, files: list.map(function (f, i) { return [f[0], datas[i].length]; }) }));
    var magic = enc.encode('FOPK1\n');
    var total = magic.length + 4 + header.length;
    datas.forEach(function (d) { total += d.length; });
    var out = new Uint8Array(total);
    var p = 0;
    out.set(magic, p); p += magic.length;
    out[p] = (header.length >>> 24) & 255; out[p + 1] = (header.length >>> 16) & 255; out[p + 2] = (header.length >>> 8) & 255; out[p + 3] = header.length & 255; p += 4;
    out.set(header, p); p += header.length;
    datas.forEach(function (d) { out.set(d, p); p += d.length; });
    return out;
  }

  /** Saklı (stored) gzip: deflate blokları sıkıştırmasız, 65535 baytlık. Sunucudaki storedGzip ile bayt bayt aynı. */
  function storedGzip(raw) {
    var B = 65535;
    var nb = Math.max(1, Math.ceil(raw.length / B));
    var out = new Uint8Array(10 + raw.length + nb * 5 + 8);
    out.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 255], 0);
    var p = 10;
    for (var i = 0; i < nb; i++) {
      var a = i * B;
      var n = Math.min(B, raw.length - a);
      out[p] = i === nb - 1 ? 1 : 0;
      out[p + 1] = n & 255; out[p + 2] = (n >>> 8) & 255;
      out[p + 3] = ~n & 255; out[p + 4] = (~n >>> 8) & 255;
      p += 5;
      out.set(raw.subarray(a, a + n), p);
      p += n;
    }
    var c = crc32(raw);
    var len = raw.length >>> 0;
    out[p] = c & 255; out[p + 1] = (c >>> 8) & 255; out[p + 2] = (c >>> 16) & 255; out[p + 3] = (c >>> 24) & 255;
    out[p + 4] = len & 255; out[p + 5] = (len >>> 8) & 255; out[p + 6] = (len >>> 16) & 255; out[p + 7] = (len >>> 24) & 255;
    return out;
  }

  function gunzip(u8) {
    if (typeof DecompressionStream !== 'function') return Promise.reject(err('ERR_NO_GUNZIP'));
    var ds = new DecompressionStream('gzip');
    var stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  /** gzip'li FOPK paketini açar → {version, files: {yol: Uint8Array}} */
  function readPack(gz) {
    return gunzip(gz).then(function (raw) {
      var magic = 'FOPK1\n';
      for (var i = 0; i < magic.length; i++) if (raw[i] !== magic.charCodeAt(i)) throw err('ERR_UPDATE_BAD_PACK');
      var p = magic.length;
      var hl = ((raw[p] << 24) >>> 0) + (raw[p + 1] << 16) + (raw[p + 2] << 8) + raw[p + 3];
      p += 4;
      var h = JSON.parse(new TextDecoder().decode(raw.subarray(p, p + hl)));
      p += hl;
      var files = {};
      h.files.forEach(function (f) { files[f[0]] = raw.subarray(p, p + f[1]); p += f[1]; });
      return { version: h.version, files: files };
    });
  }

  /** Telefonda kurulu (şu an çalışan) www'deki bir dosya. */
  function localFile(rel) {
    var url;
    try { url = new URL(rel, document.baseURI).href; } catch (e) { url = rel; }
    var viaXhr = function () {
      return new Promise(function (res, rej) {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        x.responseType = 'arraybuffer';
        x.onload = function () { if (x.status === 200 || (x.status === 0 && x.response)) res(new Uint8Array(x.response)); else rej(err('ERR_LOCAL', rel + ' ' + x.status)); };
        x.onerror = function () { rej(err('ERR_LOCAL', rel)); };
        x.send();
      });
    };
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw err('ERR_LOCAL', rel + ' ' + r.status); return r.arrayBuffer(); }).then(function (a) { return new Uint8Array(a); }).catch(viaXhr);
  }

  /* ---------------- Wi‑Fi: bilgisayardan ---------------- */
  var lanSeq = 0;
  function lanHttp(method, url, ms, key) {
    var L = window.FalconLan;
    if (!L || typeof L.lanHttp !== 'function') return Promise.resolve({ status: 0 });
        return new Promise(function (resolve) {
      var id = 'hg' + (++lanSeq) + '_' + Date.now();
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve({ status: 0, body: 'timeout' }); } }, ms + 3000);
      // lan-falcon.js'in geri çağırma tablosuna dokunmadan: kendi kimliklerimizi yakalayan sarmalayıcı
      var wrap = window.__falconLanCb;
      if (!wrap || !wrap.__hg) {
        var orig = wrap;
        var w = function (cid, json) {
          var f = w.__wait[cid];
          if (f) { delete w.__wait[cid]; var r; try { r = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { r = { status: 0, body: String(json) }; } f(r); return; }
          if (orig) return orig.apply(this, arguments);
        };
        w.__hg = true; w.__wait = {};
        window.__falconLanCb = w;
        wrap = w;
      }
      wrap.__wait[id] = function (r) { if (!done) { done = true; clearTimeout(timer); resolve(r || { status: 0 }); } };
      try { L.lanHttp(id, String(method), String(url), '', Number(ms) || 8000, String(key || '')); } catch (e) { delete wrap.__wait[id]; if (!done) { done = true; clearTimeout(timer); resolve({ status: 0 }); } }
    });
  }

  function lanPairs() {
    try { var m = JSON.parse(localStorage.getItem('falcon-lan-meta') || 'null'); return (m && m.pairs) || []; } catch (e) { return []; }
  }

  /** Eşleşmiş bilgisayarda bu dosya hazır mı? → {base, key} */
  function lanFind(file, size) {
    var pairs = lanPairs();
    if (!pairs.length || !window.FalconLan || typeof window.FalconLan.lanHttp !== 'function') return Promise.resolve(null);
    var tries = [];
    pairs.slice(0, 3).forEach(function (p) { (p.hosts || []).slice(0, 2).forEach(function (h) { tries.push({ base: 'http://' + h + ':' + p.port, key: p.key }); }); });
    var i = 0;
    var next = function () {
      if (i >= tries.length) return Promise.resolve(null);
      var t = tries[i++];
      return lanHttp('GET', t.base + '/lan/telefon', 2500, t.key).then(function (r) {
        if (r.status !== 200) return next();
        var j = null;
        try { j = JSON.parse(r.body); } catch (e) { /* */ }
        if (j && j.ok && j.files && Number(j.files[file]) === Number(size)) return t;
        return next();
      });
    };
    return next();
  }

  function b64ToU8(s) {
    var bin = atob(s);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function lanDownload(t, file, size, meter) {
    var out = new Uint8Array(size);
    var n = Math.ceil(size / LAN_CHUNK);
    var idx = 0;
    var failed = null;
    var worker = function () {
      if (failed || idx >= n) return Promise.resolve();
      var k = idx++;
      var a = k * LAN_CHUNK;
      var len = Math.min(LAN_CHUNK, size - a);
      var attempt = function (left) {
        return lanHttp('GET', t.base + '/lan/telefon/parca?ad=' + encodeURIComponent(file) + '&bas=' + a + '&uzun=' + len, 30000, t.key).then(function (r) {
          var j = null;
          try { j = JSON.parse(r.body); } catch (e) { /* */ }
          if (r.status !== 200 || !j || !j.ok || !j.data) throw err('ERR_LAN', String(r.status));
          var u = b64ToU8(j.data);
          if (u.length !== len) throw err('ERR_LAN', 'len');
          out.set(u, a);
          meter.add(len);
        }).catch(function (e) { if (left > 0) return attempt(left - 1); throw e; });
      };
      return attempt(2).then(worker, function (e) { failed = e; });
    };
    return Promise.all([worker(), worker()]).then(function () { if (failed) throw failed; return out; });
  }

  /* ---------------- internet: paralel, çok kaynaklı ---------------- */
  function sources(m) {
    var s = [];
    if (m && m.cdn && (/^https:\/\/cdn\.jsdelivr\.net\//.test(m.cdn) || window.__hgRaw)) s.push({ name: 'jsdelivr', base: m.cdn, fail: 0, dead: false, noRange: false, bytes: 0, ms: 0, active: 0 });
    s.push({ name: 'github', base: RAW, fail: 0, dead: false, noRange: false, bytes: 0, ms: 0, active: 0 });
    return s;
  }

  function rangeFetch(src, file, a, b, ctl, onBytes) {
    var t0 = Date.now();
    return fetch(src.base + file, { headers: { Range: 'bytes=' + a + '-' + b }, signal: ctl.signal }).then(function (r) {
      if (r.status === 200) { src.noRange = true; try { ctl.abort(); } catch (e) { /* */ } throw err('ERR_NO_RANGE'); }
      if (r.status !== 206 || !r.body) throw err('ERR_HTTP', String(r.status));
      var len = b - a + 1;
      var buf = new Uint8Array(len);
      var p = 0;
      var rd = r.body.getReader();
      var pump = function () {
        return rd.read().then(function (x) {
          if (x.done) {
            if (p !== len) throw err('ERR_SHORT');
            src.bytes += len; src.ms += Date.now() - t0;
            return buf;
          }
          if (p + x.value.length > len) throw err('ERR_LONG');
          buf.set(x.value, p);
          p += x.value.length;
          onBytes(p);
          return pump();
        });
      };
      return pump();
    });
  }

  /** Bir dosyayı paralel parçalarla indirir (sonunda SHA-256 denetimi çağıranda). */
  function netDownload(m, file, size, meter) {
    var srcs = sources(m);
    var n = Math.max(1, Math.ceil(size / CHUNK));
    var out = new Uint8Array(size);
    var chunks = [];
    for (var i = 0; i < n; i++) chunks.push({ i: i, a: i * CHUNK, b: Math.min(size, (i + 1) * CHUNK) - 1, done: false, att: [], got: 0, t: 0 });
    var queue = chunks.slice();
    var rr = 0;
    var finished = 0;
    var fatal = null;
    meter.info.conns = Math.min(WORKERS, n);

    var alive = function () { return srcs.filter(function (s) { return !s.dead && !s.noRange; }); };
    var pick = function (exclude) {
      var al = alive().filter(function (s) { return exclude.indexOf(s) < 0; });
      if (!al.length) al = alive();
      if (!al.length) return null;
      // ölçülen hıza göre: (bekleyen iş + 1) / hız en küçük olan kaynak; ölçüm yokken sırayla
      var best = null;
      var bestV = Infinity;
      al.forEach(function (s, k) {
        var v = s.ms > 0 ? s.bytes / s.ms : 0;
        var score = v > 0 ? (s.active + 1) / v : (s.active + 1) * 1e-6 + ((k + rr) % al.length) * 1e-9;
        if (score < bestV) { bestV = score; best = s; }
      });
      rr++;
      return best;
    };
    var setGot = function (ch, v) {
      if (v > ch.got) { meter.add(v - ch.got); ch.got = v; }
    };

    var runChunk = function (ch, hedge) {
      var used = ch.att.map(function (x) { return x.src; });
      var src = pick(hedge ? used : []);
      if (!src) return Promise.reject(err('ERR_NO_SOURCE'));
      var ctl = new AbortController();
      var att = { src: src, ctl: ctl };
      ch.att.push(att);
      if (!ch.t) ch.t = Date.now();
      var to = setTimeout(function () { try { ctl.abort(); } catch (e) { /* */ } }, 45000);
      src.active++;
      return rangeFetch(src, file, ch.a, ch.b, ctl, function (p) { setGot(ch, p); }).then(function (buf) {
        clearTimeout(to);
        if (ch.done) return;
        ch.done = true;
        out.set(buf, ch.a);
        setGot(ch, buf.length);
        finished++;
        ch.att.forEach(function (x) { if (x !== att) try { x.ctl.abort(); } catch (e) { /* */ } });
        src.fail = 0;
      }, function (e) {
        clearTimeout(to);
        src.active--;
        ch.att = ch.att.filter(function (x) { return x !== att; });
        if (ch.done) return;
        if (e && e.message !== 'ERR_NO_RANGE' && e.name !== 'AbortError') { src.fail++; if (src.fail >= 4) src.dead = true; }
        else if (e && e.name === 'AbortError') { src.fail++; if (src.fail >= 4) src.dead = true; }
        if (!ch.att.length) { ch.tries = (ch.tries || 0) + 1; if (ch.tries > 8) { fatal = e; return; } queue.unshift(ch); }
      });
    };

    var worker = function () {
      if (fatal || finished >= n) return Promise.resolve();
      if (!alive().length) return Promise.resolve();
      var ch = queue.shift();
      if (ch && ch.done) return worker();
      if (ch) return runChunk(ch, false).then(worker, function (e) { fatal = e; });
      // kuyruk boş: en yavaş süren parçayı öbür kaynaktan da iste
      var now = Date.now();
      var slow = chunks.filter(function (c) { return !c.done && c.att.length === 1 && now - c.t > 4000; }).sort(function (x, y) { return x.got - y.got; })[0];
      if (slow && alive().length > 1) return runChunk(slow, true).then(worker, function () { return worker(); });
      if (chunks.some(function (c) { return !c.done; })) return new Promise(function (r) { setTimeout(r, 400); }).then(worker);
      return Promise.resolve();
    };

    var ws = [];
    for (var w = 0; w < Math.min(WORKERS, n); w++) ws.push(worker());
    return Promise.all(ws).then(function () {
      if (finished >= n) return out;
      if (fatal) throw fatal;
      throw err('ERR_RANGE_FAILED');
    });
  }

  /** Aralık desteklenmezse: tek akış (kaynaklar sırayla). */
  function streamDownload(m, file, size, meter) {
    var srcs = sources(m);
    var i = 0;
    meter.info.conns = 1;
    var tryNext = function () {
      if (i >= srcs.length) return Promise.reject(err('ERR_UPDATE_DOWNLOAD'));
      var src = srcs[i++];
      var start = meter.done;
      return fetch(src.base + file).then(function (r) {
        if (!r.ok || !r.body) throw err('ERR_HTTP', String(r.status));
        var buf = new Uint8Array(size);
        var p = 0;
        var rd = r.body.getReader();
        var pump = function () {
          return rd.read().then(function (x) {
            if (x.done) { if (p !== size) throw err('ERR_SHORT'); return buf; }
            if (p + x.value.length > size) throw err('ERR_LONG');
            buf.set(x.value, p); p += x.value.length; meter.add(x.value.length);
            return pump();
          });
        };
        return pump();
      }).catch(function (e) { meter.done = start; log('akış', src.name, e && e.message); return tryNext(); });
    };
    return tryNext();
  }

  /** Bir dosyayı en hızlı yoldan indirir ve SHA-256 ile doğrular. */
  function fetchFile(m, file, size, sha, meter) {
    var base = meter.done;
    var check = function (u8) {
      return sha256(u8).then(function (h) { if (h !== sha) throw err('ERR_UPDATE_HASH', file); meter.done = base + size; meter.emit(true); return u8; });
    };
    var reset = function () { meter.done = base; meter.emit(true); };
    var viaNet = function () {
      meter.info.src = 'net';
      return netDownload(m, file, size, meter).then(check).catch(function (e) {
        log('paralel indirme olmadı', e && e.message);
        reset();
        return streamDownload(m, file, size, meter).then(check);
      });
    };
    return lanFind(file, size).then(function (t) {
      if (!t) return viaNet();
      meter.info.src = 'lan';
      meter.info.conns = 2;
      meter.emit(true);
      return lanDownload(t, file, size, meter).then(check).catch(function (e) { log('Wi‑Fi olmadı', e && e.message); reset(); return viaNet(); });
    }, viaNet);
  }

  function sendNative(u, bytes) {
    for (var i = 0; i < bytes.length; i += NATIVE_CHUNK) {
      var a = bytes.subarray(i, Math.min(bytes.length, i + NATIVE_CHUNK));
      var t = '';
      for (var k = 0; k < a.length; k += 32768) t += String.fromCharCode.apply(null, a.subarray(k, k + 32768));
      if (!u.updateChunk(btoa(t))) throw err('ERR_UPDATE_DOWNLOAD');
    }
  }

  /** Yama yolu: hazırlık bütünüyle bitmeden kabuğa tek bayt gönderilmez (olmazsa tam paket temiz başlar). */
  function viaPatch(o, cur, c) {
    var m = o.m;
    var p = m && m.patches && cur && m.patches[cur];
    if (!p || !m.raw || !m.files || !m.raw.sha256 || !m.raw.sig) return Promise.resolve(null);
    if (typeof DecompressionStream !== 'function' || !window.crypto || !crypto.subtle) return Promise.resolve(null);
    var meter = Meter(Number(p.size) || 0, c, { mode: 'patch' });
    meter.emit(true);
    return fetchFile(m, p.file, Number(p.size), p.sha256, meter).then(readPack).then(function (pk) {
      c({ phase: 'verify' });
      var list = m.files;
      var datas = new Array(list.length);
      var idx = 0;
      var one = function () {
        if (idx >= list.length) return Promise.resolve();
        var k = idx++;
        var f = list[k];
        var got = pk.files[f[0]] ? Promise.resolve(pk.files[f[0]]) : localFile(f[0]);
        return got.then(function (d) {
          if (d.length !== f[1]) throw err('ERR_PATCH_LOCAL', f[0] + ' boyut');
          return sha256(d).then(function (h) { if (h !== f[2]) throw err('ERR_PATCH_LOCAL', f[0]); datas[k] = d; });
        }).then(one);
      };
      return Promise.all([one(), one(), one(), one()]).then(function () {
        var gz = storedGzip(buildRaw(m.version, list, datas));
        return sha256(gz).then(function (h) {
          if (h !== m.raw.sha256 || gz.length !== Number(m.raw.size)) throw err('ERR_PATCH_RAW');
          return gz;
        });
      });
    }).catch(function (e) { log('yama kullanılamadı, tam pakete geçiliyor:', e && e.message, e && e.detail); return null; });
  }

  /**
   * index-*.js __fgD yerine: o = {file, size, sha256, sig, m: telefon.json}, u = kabuk köprüsü (updateBegin sonrası),
   * c = ilerleme, cur = kurulu sürüm, apk = APK mı. Yama yolunda o.sha256 / o.sig ham paketinkiyle değiştirilir
   * (updateFinish onu doğrular; imza aynı açık anahtarla "telefon\nsürüm\nsha256").
   */
  function download(o, u, c, cur, apk) {
    var m = o.m || {};
    var first = apk ? Promise.resolve(null) : viaPatch(o, cur, c);
    return first.then(function (gz) {
      if (gz) {
        c({ phase: 'verify' });
        sendNative(u, gz);
        o.sha256 = m.raw.sha256;
        o.sig = m.raw.sig;
        return;
      }
      var size = Number(o.size) || 0;
      if (!size || !o.sha256) throw err('ERR_UPDATE_DOWNLOAD');
      var meter = Meter(size, c, { mode: 'full' });
      meter.emit(true);
      return fetchFile(m, o.file, size, o.sha256, meter).then(function (u8) {
        c({ phase: 'verify' });
        sendNative(u, u8);
      });
    });
  }

  window.FalconHizli = { download: download, storedGzip: storedGzip, buildRaw: buildRaw, crc32: crc32, readPack: readPack, version: 1 };
})();
