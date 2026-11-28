#!/usr/bin/env node
// Geliştirme aracı: verilen belgeleri (PDF / resim) programın çevrimdışı okuyucusuyla okur ve kalemleri yazar.
//   PLAYWRIGHT_CORE=… xvfb-run -a node araclar/ekran-oku.js <dosya>… [--birlestir]
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
(async () => {
  const files = process.argv.slice(2).filter((x) => !x.startsWith('--')), merge = process.argv.includes('--birlestir'), dbg = (process.argv.find((x) => x.startsWith('--satirlar=')) || '').slice(11);
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-oku-'));
  const app = await pw._electron.launch({ executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1' } });
  const page = await app.firstWindow();
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.waitForFunction(() => window.FalconFaturaPdf, null, { timeout: 30000 });
  if (process.env.NOBAND) await page.evaluate(() => { window.__NOBAND = 1; });
  if (process.env.NOFIX) await page.evaluate(() => { window.__NOFIX = 1; });
  const docs = files.map((f) => ({ name: path.basename(f), b64: fs.readFileSync(f).toString('base64') }));
  const out = await page.evaluate(async ([docs, merge, dbg]) => {
    const fl = docs.map((d) => { const b = Uint8Array.from(atob(d.b64), (c) => c.charCodeAt(0)); return new File([b], d.name); });
    const P = window.FalconFaturaPdf; if (window.__NOBAND) window.__noBand = true; if (window.__NOFIX) window.__noFix = true;
    if (dbg) { const D = window.FalconDekont, out = []; for (const f of fl) { const img = await D.loadImg(f); const cv = D.toCanvas(img, 99999); const pg = await D.docOcr(cv, { mode: dbg.split(':')[0], min: +(dbg.split(':')[1] || 2600), tess: true });
      const all = P._g.linesOf(pg.items); all.forEach((l) => { l.page = 0; l.W = pg.width; }); all.forEach((l, i) => { const h = P._g.gHeaderAt(all, i); out.push((h ? 'H[' + h.cols.map((c) => c.key + ':' + c.label + '@' + Math.round(c.x0) + '-' + Math.round(c.x1)).join(' | ') + '] ' : '') + 'y' + Math.round(l.y) + ' ' + l.items.map((x) => x.str + '@' + Math.round(x.x)).join(' ')); }); }
      return [{ _name: 'satırlar', lines: out }]; }
    if (merge && P.readMany) { const r = await P.readMany(fl, { ai: false }); return [r]; }
    const res = []; for (const f of fl) { const t0 = Date.now(); try { const r = await P.read(f, { ai: false }); r._ms = Date.now() - t0; r._name = f.name; delete r._file; res.push(r); } catch (e) { res.push({ _name: f.name, err: String(e && e.message || e) }); } }
    return res;
  }, [docs, merge, dbg]);
  for (const r of out) {
    if (r.lines) { r.lines.forEach((x) => console.log(x.slice(0, 420))); continue; }
    console.log('==', r._name || 'birleşik', r.err || '', r._ms ? r._ms + ' ms' : '', 'para:', r.currency, 'ayrıştırıcı:', r.parser, 'uyarı:', (r.warnings || []).join(','));
    (r.items || []).forEach((it, i) => console.log(String(i + 1).padStart(3), JSON.stringify(Object.fromEntries(Object.entries(it).filter(([, v]) => v !== '' && v != null)))));
    console.log('   toplam:', JSON.stringify(r.totals || {}), 'meta:', JSON.stringify(r.meta || {}).slice(0, 200));
  }
  await app.close(); fs.rmSync(ud, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
