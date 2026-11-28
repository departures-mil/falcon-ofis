// v1.80.0 hızlı telefon güncellemesi — uçtan uca (headless Chrome):
//   node araclar/hizli-180-e2e.js <kurulu-eski-www> <guncelleme-klasörü (telefon.json + fopk + yamalar)> <eski-sürüm>
// Kaynaklar yerel sunucudan (Range + yavaşlatma); kabuk köprüsü taklit edilir, gönderilen bayt toplanır ve denetlenir:
//   1) yama  2) yama yok → tam paket  3) bozuk yerel dosya → tam pakete düşer  4) bir kaynak bozuk → öbürü
//   5) aralık desteklemeyen kaynaklar → tek akış  6) Wi‑Fi (bilgisayardan)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pack = require('../electron/update-pack');
const PW = process.env.PLAYWRIGHT_CORE || '/opt/npm-tools/node_modules/playwright-core';
const { chromium } = require(PW);

const [WWW, G, OLD] = process.argv.slice(2);
if (!WWW || !G || !OLD) throw new Error('kullanım: hizli-180-e2e.js <eski-www> <guncelleme> <eski-sürüm>');
const M = JSON.parse(fs.readFileSync(path.join(G, 'telefon.json'), 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const HG = fs.readFileSync(path.join(__dirname, '..', 'dist', 'assets', 'hizli-guncelleme.js'));
const ctl = { cdn: 'ok', raw: 'ok', rate: 4 * 1048576, broken: '' };
const hits = { cdn: 0, raw: 0, range: 0 };

function serveFile(req, res, file, mode) {
  if (mode === 'fail') { res.writeHead(500, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
  let b;
  try { b = fs.readFileSync(file); } catch (e) { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range', 'Content-Type': 'application/octet-stream' };
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
  const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
  let body = b;
  if (m && mode !== 'norange') {
    hits.range++;
    body = b.subarray(+m[1], +m[2] + 1);
    res.writeHead(206, Object.assign(h, { 'Content-Range': `bytes ${m[1]}-${m[2]}/${b.length}`, 'Content-Length': body.length }));
  } else res.writeHead(200, Object.assign(h, { 'Content-Length': body.length }));
  // yavaşlatma: bağlantı başına ctl.rate bayt/sn
  let p = 0;
  const step = () => {
    if (p >= body.length) return res.end();
    const n = Math.max(16384, Math.floor(ctl.rate / 20));
    res.write(body.subarray(p, p + n)); p += n;
    setTimeout(step, 50);
  };
  step();
}

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/cdn/')) { hits.cdn++; return serveFile(req, res, path.join(G, u.pathname.slice(5)), ctl.cdn); }
  if (u.pathname.startsWith('/raw/')) { hits.raw++; return serveFile(req, res, path.join(G, u.pathname.slice(5)), ctl.raw); }
  if (u.pathname === '/www/__test.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><meta charset="utf-8"><script>window.__hgRaw=location.origin+'/raw/'</script><script src="/__hg.js"></script>`);
  }
  if (u.pathname === '/__hg.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(HG); }
  if (u.pathname.startsWith('/www/')) {
    const rel = decodeURIComponent(u.pathname.slice(5));
    if (ctl.broken && rel === ctl.broken) { res.writeHead(200); return res.end('bozuk'); }
    try { const b = fs.readFileSync(path.join(WWW, rel)); res.writeHead(200); return res.end(b); } catch (e) { res.writeHead(404); return res.end(); }
  }
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', (m) => { if (process.env.DEBUG) console.log('[sayfa]', m.text()); });
  await page.goto(base + '/www/__test.html');
  const full = fs.readFileSync(path.join(G, M.file));
  const newFiles = pack.readPack(full).files;

  async function run(name, cur, opts = {}) {
    Object.assign(ctl, { cdn: 'ok', raw: 'ok', rate: 4 * 1048576, broken: '' }, opts.ctl || {});
    hits.cdn = hits.raw = hits.range = 0;
    const m = Object.assign({}, M, { cdn: base + '/cdn/' });
    const r = await page.evaluate(async ({ m, cur, lan }) => {
      const chunks = [];
      const ev = [];
      const u = { updateChunk: (b) => { chunks.push(b); return true; } };
      if (lan) {
        localStorage.setItem('falcon-lan-meta', JSON.stringify({ pairs: [{ key: 'K', port: 1, hosts: ['10.0.0.5'] }] }));
        window.FalconLan = {
          lanHttp: (id, method, url) => {
            setTimeout(async () => {
              const uu = new URL(url);
              let body;
              if (uu.pathname === '/lan/telefon') body = JSON.stringify({ ok: true, version: m.version, files: lan.files });
              else {
                const f = uu.searchParams.get('ad'); const a = +uu.searchParams.get('bas'); const n = +uu.searchParams.get('uzun');
                const ab = await (await fetch(location.origin + '/raw/' + f, { headers: { Range: `bytes=${a}-${a + n - 1}` } })).arrayBuffer();
                let s = ''; const v = new Uint8Array(ab); for (let i = 0; i < v.length; i += 32768) s += String.fromCharCode.apply(null, v.subarray(i, i + 32768));
                body = JSON.stringify({ ok: true, data: btoa(s) });
              }
              window.__falconLanCb(id, JSON.stringify({ status: 200, body }));
            }, 5);
          }
        };
      } else { delete window.FalconLan; localStorage.removeItem('falcon-lan-meta'); }
      const o = { file: m.file, size: m.size, sha256: m.sha256, sig: m.sig, m };
      const t0 = Date.now();
      let error = null;
      try { await window.FalconHizli.download(o, u, (p) => ev.push(p), cur, false); } catch (e) { error = String(e.message || e); }
      return { error, chunks, ev: ev.filter((e) => e.phase === 'download'), sha: o.sha256, ms: Date.now() - t0 };
    }, { m, cur, lan: opts.lan || null });
    if (r.error) throw new Error(name + ': ' + r.error);
    const got = Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64')));
    const last = r.ev[r.ev.length - 1] || {};
    const sp = r.ev.filter((e) => e.speed > 0).length;
    console.log(`${name}: ${(got.length / 1048576).toFixed(1)} MB gönderildi, indirilen ${(last.total / 1048576).toFixed(2)} MB, ${r.ms} ms, mode=${last.mode} src=${last.src} conns=${last.conns}, hızlı olay ${sp}/${r.ev.length}, istek cdn ${hits.cdn} raw ${hits.raw} range ${hits.range}`);
    if (sha(got) !== r.sha) throw new Error(name + ': gönderilen paketin sha256 tutmadı');
    const files = pack.readPack(got).files;
    if (files.length !== newFiles.length || files.some((f, i) => f.path !== newFiles[i].path || !f.data.equals(newFiles[i].data))) throw new Error(name + ': dosyalar yeni sürümle aynı değil');
    if (opts.expect) opts.expect(r, last);
    return r;
  }

  const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: ${a} ≠ ${b}`); };
  await run('1 yama', OLD, { expect: (r, l) => { eq(l.mode, 'patch', 'yama modu'); eq(r.sha, M.raw.sha256, 'ham sha'); eq(l.total, M.patches[OLD].size, 'yalnız yama iner'); } });
  await run('2 yama yok → tam', '0.0.1', { expect: (r, l) => { eq(l.mode, 'full', 'tam'); eq(r.sha, M.sha256, 'tam sha'); } });
  const someFile = M.files.find((f) => !Object.keys({}).includes(f[0]) && /\.woff2$/.test(f[0]))[0];
  await run('3 bozuk yerel dosya → tam', OLD, { ctl: { broken: someFile }, expect: (r, l) => { eq(l.mode, 'full', 'tam'); eq(r.sha, M.sha256, 'tam sha'); } });
  await run('4 jsDelivr bozuk → GitHub', '0.0.1', { ctl: { cdn: 'fail', rate: 8 * 1048576 }, expect: (r, l) => eq(l.src, 'net', 'internet') });
  await run('5 aralık yok → tek akış', '0.0.1', { ctl: { cdn: 'norange', raw: 'norange', rate: 16 * 1048576 }, expect: (r, l) => eq(l.conns, 1, 'tek bağlantı') });
  const lanFiles = { [M.file]: M.size }; for (const p of Object.values(M.patches)) lanFiles[p.file] = p.size;
  await run('6 Wi‑Fi', OLD, { lan: { files: lanFiles }, ctl: { cdn: 'fail' }, expect: (r, l) => { eq(l.src, 'lan', 'Wi‑Fi'); eq(l.mode, 'patch', 'yama'); } });
  // 7 yavaş hat: paralel + iki kaynak tek akıştan hızlı mı (bağlantı başına 256 KB/sn)
  const slow = await run('7a yavaş hat paralel', '0.0.1', { ctl: { rate: 256 * 1024 } });
  const one = await run('7b yavaş hat tek akış', '0.0.1', { ctl: { rate: 256 * 1024, cdn: 'norange', raw: 'norange' } });
  console.log(`paralel ${(slow.ms / 1000).toFixed(1)} sn / tek akış ${(one.ms / 1000).toFixed(1)} sn → ${(one.ms / slow.ms).toFixed(1)} kat hızlı`);
  if (slow.ms * 2 > one.ms) throw new Error('paralel indirme beklenen kadar hızlı değil');
  await browser.close();
  srv.close();
  console.log('TAMAM');
})().catch((e) => { console.error('HATA', e); process.exit(1); });
