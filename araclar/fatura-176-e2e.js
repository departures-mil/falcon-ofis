#!/usr/bin/env node
// v1.76 uçtan uca: takım tezgâhı ürün adlarının çevrimdışı çevirisi, MK → MT ve «Orijinal kodları koru», yorumlanan kısaltmalar,
// önizlemede düzeltilen çevirinin öğrenilip sonraki faturada kullanılması. (araclar/cikti-e2e.js ile aynı kurulum)
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/fatura-176-e2e.js <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-176');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-176-'));
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(async (ver) => {
    const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
    set('scheme', 'falcon'); set('onboarding.done', true); set('whatsnew.seen', ver);
    localStorage.setItem('falcon-theme', 'dark');
    await window.falcon.settings.set('language', 'tr');
    await window.falcon.settings.set('invoice_company', JSON.stringify({ name: 'Falcon System', phone: '+90 212 000 00 00' }));
    await window.falcon.settings.set('invoice_defaults', JSON.stringify({ currency: 'TRY', tax_rate: 20, template: 'efatura', lang: 'tr' }));
    const r = await window.falcon.call('saveRates', { rates: { TRY: 42, SYP: 13000 }, source: 'manual' });
    if (!r.ok) throw new Error('kur: ' + r.error);
    // kayıtlı ürün (TL fiyatlı): faturada dolara çevrilse de kaydı değişmemeli
    const p = await window.falcon.call('saveProductCard', { name: 'Kayıtlı Sensör', code: 'SNS.1', sale_price: 840, currency: 'TRY', vat_rate: 20 });
    if (!p.ok) throw new Error('ürün: ' + p.error);
  }, require('../package.json').version);
  await page.reload();
  await page.waitForSelector('.topbar-actions .fc-update-wrap', { timeout: 30000 });
  await page.evaluate(() => { location.hash = '#/invoices'; });
  await page.waitForSelector('.fatura-page .fat-tabs', { timeout: 15000 });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  await page.waitForTimeout(600);
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const { execFileSync } = require('child_process');
  const pdfDir = path.join(ud, 'pdf');
  fs.mkdirSync(pdfDir, { recursive: true });
  // kaydet penceresi yerine sabit dosya (yalnız test)
  await app.evaluate(({ dialog, shell }, dir) => { let n = 0; dialog.showSaveDialogSync = (_w, o) => dir + '/' + (++n) + '-' + String((o && o.defaultPath) || 'x.pdf').split('/').pop(); shell.openPath = async () => ''; }, pdfDir);
  const pdfText = (f) => execFileSync('pdftotext', ['-layout', f, '-']).toString();
  const pages = (f) => Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f]).toString())[1]);
  const lastPdf = () => { const l = fs.readdirSync(pdfDir).filter((x) => x.endsWith('.pdf')).sort((a, b) => parseInt(a) - parseInt(b)); return path.join(pdfDir, l[l.length - 1]); };

  const N = ['DÖNER PUNTA MK5-05 TAK.UC- SET- GÖVDE+4UC+ANHT.', 'HYUNDAI SE2600M BMT55 DIŞ ÇAP TUTUCU 25mm KISA', 'HWACHEON CUTEX-160A-B/MC_BMT55 DKT+UDT Ø40 H60',
    'DELİK KATER SOKETİ D40 d12', 'DELİK KATER SOKETİ D40 d20', 'DELİK KATER SOKETİ D40 d25'];
  const mk = (no) => page.evaluate(async (a) => {
    const items = a.N.map((n, i) => ({ name: n, qty: 1, unit: 'Adet', price: 100 + i, vat: 20 }));
    const r = await window.falcon.call('saveInvoice', { number: a.no, date: '2026-11-28', customer: { name: 'TEST MAKİNA' }, currency: 'USD', items, discount: 0, tax_rate: 0, template: 'falcon|nb|nd|nq|ns', lang: 'tr', meta: { inv_type: 'SATIS' } });
    if (!r.ok) throw new Error('fatura: ' + r.error);
  }, { N, no });
  await mk('FAL-2026-0176');
  await page.evaluate(() => { localStorage.setItem('fat.pvNames', 'keep'); localStorage.removeItem('fat.keepCodes'); });
  const openPv = async (no) => {
    await page.reload();
    await page.waitForSelector('.topbar-actions .fc-update-wrap', { timeout: 30000 });
    await page.evaluate(() => { location.hash = '#/invoices'; });
    await page.waitForSelector('.fatura-page .fat-acts', { timeout: 15000 });
    await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
    await page.evaluate((n) => { const row = [...document.querySelectorAll('.fatura-page tr, .fatura-page .fat-row')].find((r) => r.textContent.includes(n)); [...(row || document).querySelectorAll('.fat-acts button')].find((b) => /PDF/.test(b.textContent)).click(); }, no);
    await page.waitForSelector('.fat-pv-steps', { timeout: 10000 });
    await page.click('.fat-pv-lg button:has-text("English")');
    await page.waitForTimeout(300);
  };
  const sh = (sel) => page.evaluate((s) => { const r = document.querySelector('.fat-pv-host').shadowRoot; return s ? [...r.querySelectorAll(s)].map((x) => x.textContent) : r.textContent; }, sel);
  const info = () => page.evaluate(() => document.querySelector('.fat-pv-nm').textContent);
  await openPv('FAL-2026-0176');
  await page.click('.fat-pv-steps button:has-text("Seçilen dile çevir")');
  await page.waitForFunction(() => /çevrimdışı/.test(document.querySelector('.fat-pv-nm').textContent), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  let nm = await sh('table.it td.nm'); console.log(nm);
  assert.ok(nm.some((x) => x.includes('LIVE CENTER MT5-05 WITH INTERCHANGEABLE TIPS - SET: BODY + 4 CENTER TIPS + WRENCH')), 'döner punta');
  assert.ok(nm.some((x) => x.includes('BORING BAR HOLDER + U-DRILL HOLDER Ø40 H60')), 'DKT + UDT');
  assert.ok(nm.some((x) => x.includes('BORING BAR SLEEVE D40 d25')), 'delik kater soketi');
  const inf = await info(); console.log(inf);
  assert.ok(/Yorumlanan kısaltmalar: DKT = delik kater tutucu, UDT = u-matkap tutucu/.test(inf), 'yorumlanan kısaltmalar gösterilir');
  await page.screenshot({ path: path.join(OUT, '1-cevrildi.png') });
  // «Orijinal kodları koru»
  await page.click('label.fat-pv-kc input');
  await page.waitForTimeout(300);
  nm = await sh('table.it td.nm');
  assert.ok(nm.some((x) => x.includes('LIVE CENTER MK5-05')), 'kod korundu');
  await page.click('label.fat-pv-kc input');
  await page.waitForTimeout(300);
  assert.ok((await sh('table.it td.nm')).some((x) => x.includes('LIVE CENTER MT5-05')), 'MT5 geri');
  // düzelt: DKT satırını değiştir → öğrenilir
  await page.click('.fat-pv-steps button:has-text("Düzelt")');
  const NEW = 'HWACHEON CUTEX-160A-B/MC_BMT55 BORING BAR HOLDER + U-DRILL ADAPTER Ø40 H60';
  const ok = await page.evaluate((v) => {
    const r = document.querySelector('.fat-pv-host').shadowRoot;
    const w = document.createTreeWalker(r.querySelector('.inv'), 4); let n;
    while ((n = w.nextNode())) if (/U-DRILL HOLDER/.test(n.nodeValue)) { n.nodeValue = v; r.querySelector('.inv').dispatchEvent(new Event('input', { bubbles: true })); return true; }
    return false;
  }, NEW);
  assert.ok(ok, 'düzeltilecek metin bulundu');
  await page.click('.fat-pv-steps button:has-text("Düzeltmeyi bitir")');
  await page.waitForTimeout(1200);
  const user = await page.evaluate(() => window.falcon.settings.get('invoice_name_user'));
  console.log('invoice_name_user', user);
  assert.ok(JSON.parse(user).en[N[2]] === NEW, 'düzeltme kullanıcı sözlüğüne yazıldı');
  await page.click('.fat-modal .modal-footer button:has-text("Kapat")');
  // yeni fatura: aynı ürün → öğrenilen çeviri
  await mk('FAL-2026-0177');
  await openPv('FAL-2026-0177');
  await page.waitForTimeout(800);
  nm = await sh('table.it td.nm');
  assert.ok(nm.some((x) => x.includes(NEW)), 'öğrenilen çeviri yeni faturada: ' + nm.join(' | '));
  await page.screenshot({ path: path.join(OUT, '2-ogrenilen.png') });
  await app.close();
  fs.rmSync(ud, { recursive: true, force: true });
  const bad = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND.*\.map|net::|Failed to fetch|ERR_NAME|ERR_INTERNET|ERR_PROXY|ERR_TUNNEL|status of 404/.test(e));
  if (bad.length) { console.error('HATALAR:\n' + bad.join('\n')); process.exitCode = 1; } else console.log('✓ 1.76 e2e');
})().catch((e) => { console.error(e); process.exit(1); });
