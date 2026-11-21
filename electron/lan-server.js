'use strict';
// v1.50: Wi‑Fi (yerel ağ) eşitlemesi — masaüstü sunucusu. İnternet gerekmez: aynı modem / Wi‑Fi ya da telefonun
// hotspot'u yeterlidir. Sunucu programın arka plan sürecinde çalışır: pencere kapalıyken (tepside) de eşitler.
//
// Protokol (HTTP, yalnızca yerel ağ; her istek X-Lan-Key ister):
//   GET  /lan/ping  → {ok, app, name}
//   POST /lan/sync  {v, app, account, dev, op?, state | id/data}
//        op yok     : karşının kayıtları birleştirilir, bu bilgisayarın (birleştirme öncesi) kayıtları döner
//        op getBlob : dosya (base64) döner;  op putBlob: eksikse dosya yazılır (var olanın üstüne yazılmaz)
// Yanlış anahtar 403; 15 yanlış denemeden sonra sunucu 10 dakika kimseyi kabul etmez.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BODY = 300 * 1024 * 1024;
const APP_ID = 'falcon-ofis';

let cfg = null;
let server = null;
let port = 0;
let bad = 0;
let lockedUntil = 0;
let chain = Promise.resolve();

function basePort(appId) {
  let h = 0;
  for (const ch of String(appId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 47000 + (h % 900);
}

function newKey() {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}

function prefs() {
  try { return JSON.parse(fs.readFileSync(cfg.prefsFile, 'utf8')); } catch (e) { return {}; }
}
function savePrefs(p) {
  fs.mkdirSync(path.dirname(cfg.prefsFile), { recursive: true });
  fs.writeFileSync(cfg.prefsFile + '.tmp', JSON.stringify(p));
  fs.renameSync(cfg.prefsFile + '.tmp', cfg.prefsFile);
}
function state() {
  const p = prefs();
  if (!p.lanKey) { p.lanKey = newKey(); savePrefs(p); }
  return p;
}

/** Bu bilgisayarın yerel ağ adresleri; ev/ofis ağları (192.168.x, 10.x, 172.16-31.x) önce. */
function lanIps() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach((list) => (list || []).forEach((a) => {
    if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
  }));
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return [...new Set(out)].sort((a, b) => rank(a) - rank(b));
}

function send(res, status, obj) {
  const body = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Hesap ve sürüm: aynı bulut hesabındaki (ya da hiç bağlanmamış) cihazlar eşitlenir; sürümler aynı olmalı.
function accountCheck(theirs, mine) {
  const [tu, tv] = String(theirs || '').split('|');
  const [mu, mv] = String(mine || '').split('|');
  if (tu && mu && tu !== mu) return 'account';
  if (tv && mv && tv !== mv) return 'e_ver';
  return '';
}

/** Kayıtlar arka plan sürecinde birleştirilir (pencere açık olmasa da). Aynı anda tek eşitleme. */
function serverSync(p) {
  const run = chain.then(async () => {
    const h = cfg.hooks();
    if (!h) return { ok: false, error: 'busy' };
    for (let i = 0; i < 120 && h.busy(); i++) await new Promise((r) => setTimeout(r, 250));
    const mine = h.account();
    if (p.op === 'getBlob') {
      const rel = String(p.id || '');
      if (!h.files.exists(rel)) return { ok: false };
      return { ok: true, data: Buffer.from(h.files.read(rel)).toString('base64') };
    }
    if (p.op === 'putBlob') {
      const rel = String(p.id || '');
      if (!h.files.exists(rel) && p.data) h.files.write(rel, new Uint8Array(Buffer.from(String(p.data), 'base64')));
      return { ok: true };
    }
    const local = h.store.exportState();
    const merged = h.store.merge(local, p.state || {});
    const pv = h.store.preview(local, merged);
    if ((pv.updated || pv.removed) && h.backup) h.backup(); // üstüne yazmadan / silmeden önce tam yedek
    const rep = h.store.applyState(merged, { dev: (p.dev && p.dev.name) || '' });
    h.changed(rep, (p.dev && p.dev.name) || '');
    const refs = h.store.fileRefs(merged);
    return { ok: true, v: 1, account: mine, dev: { id: 'pc', name: os.hostname() }, state: local, blobs: refs.filter((r) => h.files.exists(r)) };
  });
  chain = run.catch(() => {});
  return run;
}

async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    if (Date.now() < lockedUntil) return send(res, 429, { ok: false, error: 'locked' });
    const key = req.headers['x-lan-key'] || '';
    if (key !== state().lanKey) {
      if (++bad >= 15) { bad = 0; lockedUntil = Date.now() + 10 * 60000; }
      return send(res, 403, { ok: false, error: 'key' });
    }
    bad = 0;
    if (url.pathname === '/lan/ping') return send(res, 200, { ok: true, app: APP_ID, name: os.hostname(), v: 1 });
    if (url.pathname === '/lan/sync' && req.method === 'POST') {
      let p;
      try { p = JSON.parse((await readBody(req)).toString('utf8')); } catch (e) { return send(res, 400, { ok: false, error: 'json' }); }
      if (p.app !== APP_ID) return send(res, 409, { ok: false, error: 'app' });
      const h = cfg.hooks();
      if (!h) return send(res, 200, { ok: false, error: 'busy' });
      const mine = h.account();
      const accErr = accountCheck(p.account, mine);
      if (accErr) return send(res, 200, { ok: false, error: accErr, account: mine });
      if (h.locked && h.locked()) return send(res, 200, { ok: false, error: 'e_locked' });
      const r = await serverSync(p);
      return send(res, 200, r);
    }
    send(res, 404, { ok: false });
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
}

function listen(tryPort, left) {
  return new Promise((resolve) => {
    const s = http.createServer(handle);
    s.on('error', () => { s.close(); resolve(left > 0 ? listen(tryPort + 1, left - 1) : null); });
    s.listen(tryPort, '0.0.0.0', () => resolve(s));
  });
}

async function start() {
  if (server) return info();
  const s = await listen(basePort(APP_ID), 8);
  if (!s) return { ok: false, error: 'port' };
  server = s;
  port = s.address().port;
  const p = state();
  if (!p.lanOn) { p.lanOn = true; savePrefs(p); }
  return info();
}

function stop(remember) {
  if (server) { server.close(); server = null; }
  if (remember) { const p = state(); p.lanOn = false; savePrefs(p); }
  return { ok: true };
}

function info() {
  const p = state();
  return { ok: true, on: !!server, ips: lanIps(), port, key: p.lanKey, app: APP_ID, name: os.hostname() };
}

/* ---------- istemci (bu bilgisayar başka bir bilgisayara bağlanırken) ---------- */

function clientHttp(method, url, body, timeoutMs, key) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ status: 0, body: 'url' }); }
    const headers = { 'X-Lan-Key': key || '' };
    if (body) { headers['Content-Type'] = 'application/json; charset=utf-8'; headers['Content-Length'] = Buffer.byteLength(body); }
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers, timeout: timeoutMs || 30000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, body: String(e.message || e) }));
    if (body) req.write(body);
    req.end();
  });
}

/** Kayıtlı adres değiştiyse aynı ağda (/24) eşleşmiş cihazı arar. */
async function find(port0, key, appId) {
  const mine = new Set(lanIps());
  const hosts = [];
  lanIps().forEach((ip) => { const b = ip.split('.').slice(0, 3).join('.'); for (let i = 1; i < 255; i++) { const h = b + '.' + i; if (!mine.has(h) && !hosts.includes(h)) hosts.push(h); } });
  let found = null;
  let idx = 0;
  const worker = async () => {
    while (!found && idx < hosts.length) {
      const h = hosts[idx++];
      const r = await clientHttp('GET', `http://${h}:${port0}/lan/ping`, null, 600, key);
      if (r.status === 200) { try { if (JSON.parse(r.body).app === appId) found = h; } catch (e) { /* başka program */ } }
    }
  };
  await Promise.all(Array.from({ length: 48 }, worker));
  return { ok: !!found, host: found || '' };
}

function setup(c) {
  cfg = c;
  if (state().lanOn) start().catch(() => {});
}

module.exports = {
  setup, start, stop, info, lanIps, basePort, accountCheck, clientHttp, find, APP_ID,
  resetKey: () => { const p = state(); p.lanKey = newKey(); savePrefs(p); return info(); },
};
