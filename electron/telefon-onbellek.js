'use strict';
// v1.80.0: telefon güncellemesinin bilgisayardaki kopyası. Program arka planda (tepside de) açık olduğundan yeni telefon
// sürümünü kendisi indirir; aynı Wi‑Fi'deki eşleşmiş telefon güncellemeyi internete çıkmadan buradan alır
// (lan-server `/lan/telefon`, `/lan/telefon/parca`). Paket imzası ve SHA-256 denetlenmeden sunulmaz.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pack = require('./update-pack');

const RAW = 'https://raw.githubusercontent.com/departures-mil/falcon-ofis/main/guncelleme/';
const NAME_RE = /^telefon-(yama-)?[0-9.]+(-[0-9.]+)?\.fopk$/;
let dir = null;
let busy = false;
let state = { version: '', files: {} };

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function load() {
  try { state = JSON.parse(fs.readFileSync(path.join(dir, 'durum.json'), 'utf8')) || state; } catch (e) { /* ilk açılış */ }
  // kayıtlı ama diskte olmayan / boyutu tutmayan dosyalar sunulmaz
  const files = {};
  for (const [n, s] of Object.entries(state.files || {})) {
    try { if (fs.statSync(path.join(dir, n)).size === s) files[n] = s; } catch (e) { /* */ }
  }
  state.files = files;
}

async function get(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

/** telefon.json'u okur; yeni sürüm varsa tam paketi ve yamaları indirir, doğrular, eskileri siler. */
async function refresh() {
  if (!dir || busy) return state;
  busy = true;
  try {
    const m = JSON.parse((await get(RAW + 'telefon.json?t=' + Date.now(), 20000)).toString('utf8'));
    if (!m || !m.version || !m.file || !m.sha256) return state;
    const want = [[m.file, Number(m.size), m.sha256]];
    for (const p of Object.values(m.patches || {})) if (p && p.file) want.push([p.file, Number(p.size), p.sha256]);
    if (state.version === m.version && want.every(([n, s]) => state.files[n] === s)) return state;
    if (!pack.verify('telefon', m.version, m.sha256, m.sig)) throw new Error('imza');
    fs.mkdirSync(dir, { recursive: true });
    const files = {};
    for (const [n, s, h] of want) {
      if (!NAME_RE.test(n)) continue;
      const fp = path.join(dir, n);
      let ok = false;
      try { ok = fs.statSync(fp).size === s && sha(fs.readFileSync(fp)) === h; } catch (e) { /* yok */ }
      if (!ok) {
        const b = await get(RAW + n, 30 * 60000);
        if (b.length !== s || sha(b) !== h) throw new Error('sha ' + n);
        fs.writeFileSync(fp + '.tmp', b);
        fs.renameSync(fp + '.tmp', fp);
      }
      files[n] = s;
    }
    for (const f of fs.readdirSync(dir)) if (NAME_RE.test(f) && !files[f]) try { fs.rmSync(path.join(dir, f)); } catch (e) { /* */ }
    state = { version: m.version, files, at: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, 'durum.json'), JSON.stringify(state));
    return state;
  } catch (e) {
    return state;
  } finally { busy = false; }
}

/** lan-server için: {ok, version, files: {ad: boyut}} */
function info() { return { ok: !!state.version, version: state.version, files: state.files }; }

/** Bir dosyanın parçası (base64). En çok 4 MB. */
function part(name, start, len) {
  if (!NAME_RE.test(String(name)) || !(name in state.files)) return null;
  start = Math.max(0, Math.floor(Number(start) || 0));
  len = Math.min(4 * 1048576, Math.max(0, Math.floor(Number(len) || 0)));
  if (!len || start >= state.files[name]) return null;
  const fd = fs.openSync(path.join(dir, name), 'r');
  try {
    const b = Buffer.alloc(Math.min(len, state.files[name] - start));
    fs.readSync(fd, b, 0, b.length, start);
    return b.toString('base64');
  } finally { fs.closeSync(fd); }
}

/** Açılıştan 90 sn sonra, sonra 30 dakikada bir (internet yoksa sessizce geçer). */
function setup(d) {
  dir = d;
  load();
  setTimeout(() => refresh().catch(() => {}), 90000);
  setInterval(() => refresh().catch(() => {}), 30 * 60000);
}

module.exports = { setup, refresh, info, part, NAME_RE };
