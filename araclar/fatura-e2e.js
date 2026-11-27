#!/usr/bin/env node
// v1.60 fatura uçtan uca denemesi (gerçek Electron + xvfb): PDF'den doldur (çevrimdışı), kaydet, müşteri / ürün kayıtları,
// önizleme (e-Fatura şablonu, tr + ar), ayarlarda düzen. Ekran görüntüleri <çıktı> klasörüne.
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/fatura-e2e.js <çıktı> <fatura.pdf>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-fatura');
const PDF = path.resolve(process.argv[3] || '');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-fatura-'));
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
    await window.falcon.settings.set('invoice_company', JSON.stringify({ name: 'Falcon System', address: 'Örnek Cad. No: 1 İstanbul', phone: '+90 212 000 00 00', email: 'info@falcon.test', tax_office: 'Kadıköy', tax: '1112223334' }));
    await window.falcon.settings.set('invoice_defaults', JSON.stringify({ currency: 'TRY', tax_rate: 20, template: 'efatura', lang: 'tr', scenario: 'TEMELFATURA', inv_type: 'SATIS', customization: 'TR1.2' }));
  }, require('../package.json').version);
  await page.reload();
  await page.waitForSelector('.topbar-actions .fc-update-wrap', { timeout: 30000 });
  await page.evaluate(() => { location.hash = '#/invoices'; });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  await page.waitForSelector('.fatura-page .fat-tabs', { timeout: 15000 });
  await page.waitForTimeout(800);
  // duyuru penceresi (ağdan gelir) denemeyi kapatmasın
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });

  // 1) PDF'den doldur (yapay zeka anahtarı yok → çevrimdışı)
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.fatura-page .toolbar button:has-text("PDF\'den doldur")')]);
  await fc.setFiles(PDF);
  await page.waitForSelector('.fat-imp-st', { timeout: 30000 });
  await page.waitForTimeout(400);
  await shot('1-pdf-onizleme');
  const src = await page.textContent('.fat-imp-src');
  assert.ok(/Çevrimdışı/.test(src), 'çevrimdışı okundu: ' + src);
  await page.click('button:has-text("Faturaya aktar")');
  await page.waitForSelector('.fat-items tbody tr', { timeout: 10000 });
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({
    cust: document.querySelector('.fat-acw input').value,
    rows: document.querySelectorAll('.fat-items tbody tr').length,
    total: document.querySelector('.fat-tot .g b').textContent,
  }));
  console.log('düzenleyici', st);
  assert.ok(/İSTANİFY/.test(st.cust), 'müşteri adı');
  assert.strictEqual(st.rows, 4, 'dört kalem');
  await shot('2-duzenleyici');
  await page.evaluate(() => { const b = document.querySelector('.fat-modal .modal-body'); if (b) b.scrollTop = 1180; });
  await page.waitForTimeout(200);
  await shot('2b-duzenleyici-kalemler');
  // 2) önizleme (e-Fatura) ve kaydet
  await page.click('.fat-modal .modal-footer button:has-text("Önizle")');
  await page.waitForSelector('.fat-pv-host', { timeout: 10000 });
  await page.waitForTimeout(800);
  await shot('3-onizleme-efatura');
  await page.locator('.fat-modal').last().locator('.modal-footer button', { hasText: /^Kaydet$/ }).click();
  await page.waitForTimeout(1200);
  const db = await page.evaluate(async () => {
    const q = (s) => window.falcon.db.all(s);
    return { inv: await q('SELECT number, total, tax, meta, customer_id, items FROM invoices'), cust: await q('SELECT * FROM customers'), prod: await q('SELECT name, code, sale_price, vat_rate, depot FROM products'), prices: await q('SELECT COUNT(*) AS n FROM product_prices') };
  });
  console.log('kayıt', db.inv.map((x) => [x.number, x.total, x.tax]), db.cust.map((c) => [c.name, c.tax_no, c.tax_office, c.city]), db.prod.length, db.prices);
  assert.strictEqual(db.inv.length, 1); assert.strictEqual(db.inv[0].total, 8028.22); assert.strictEqual(db.cust.length, 1); assert.strictEqual(db.prod.length, 4);
  assert.strictEqual(db.cust[0].tax_no, '4811330402'); assert.strictEqual(db.cust[0].tax_office, 'GÜNEŞLİ VERGİ DAİRESİ');
  await page.waitForTimeout(400);
  await shot('4-liste');
  // 3) aynı PDF ikinci kez: müşteri ve ürünler kayıtlı görünür
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('.fatura-page .toolbar button:has-text("PDF\'den doldur")')]);
  await fc2.setFiles(PDF);
  await page.waitForSelector('.fat-imp-st', { timeout: 30000 });
  const st2 = await page.textContent('.fat-imp-c .fat-imp-st');
  assert.ok(/Kayıtlı müşteri/.test(st2), 'ikinci kez: kayıtlı müşteri');
  const sel = await page.evaluate(() => [...document.querySelectorAll('.fat-imp-sel')].map((s) => s.value));
  assert.ok(sel.every(Boolean), 'ikinci kez: ürünler eşleşti ' + sel);
  await shot('5-pdf-ikinci-kez');
  await page.click('.fat-modal .modal-footer button:has-text("Kapat")');
  // 4) müşteriler / ürünler sekmeleri
  await page.click('.fat-tabs button:has-text("Müşteriler")');
  await page.waitForTimeout(600);
  await shot('6-musteriler');
  await page.click('.fatura-page .fat-click:visible');
  await page.waitForTimeout(700);
  await shot('7-musteri-karti');
  await page.click('.fat-modal .modal-footer button:has-text("Kapat")');
  await page.click('.fat-tabs button:has-text("Ürünler")');
  await page.waitForTimeout(600);
  await shot('8-urunler');
  await page.click('.fatura-page .fat-click:visible');
  await page.waitForTimeout(700);
  await shot('9-urun-karti');
  await page.click('.fat-modal .modal-footer button:has-text("Kapat")');
  // 5) ayarlar → düzen
  await page.click('.fat-tabs button:has-text("Faturalar")');
  await page.click('.fatura-page .toolbar button:has-text("Fatura ayarları")');
  await page.waitForTimeout(600);
  await page.evaluate(() => { const h = [...document.querySelectorAll('.fat-modal .section-title')].find((x) => /düzeni/.test(x.textContent)); if (h) h.scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(300);
  await shot('10-ayarlar-duzen');
  await page.click('.fat-modal .modal-footer button:has-text("Kapat")');
  // 6) Arapça önizleme
  await page.evaluate(async () => { const r = await window.falcon.db.all('SELECT * FROM invoices'); r[0].lang = 'ar'; window.__inv = r[0]; });
  await page.evaluate(() => document.querySelector('.fatura-page .fat-acts button').click());
  await page.waitForSelector('.fat-pv-host');
  await page.selectOption('.fat-pv-bar select:nth-of-type(2)', 'ar');
  await page.waitForTimeout(700);
  await shot('11-onizleme-ar');
  await page.selectOption('.fat-pv-bar select:nth-of-type(1)', 'falcon');
  await page.waitForTimeout(700);
  await shot('12-onizleme-falcon-ar');
  // tam sayfa PDF HTML'i (iki şablon) — ekran görüntüsü için dosyaya
  for (const tp of ['efatura', 'falcon']) {
    const h = await page.evaluate(async (tp) => { const r = await window.falcon.db.all('SELECT * FROM invoices'); const inv = Object.assign({}, r[0], { template: tp, lang: 'tr' });
      const g = (k) => window.falcon.settings.get(k);
      const cfg = { company: JSON.parse(await g('invoice_company') || '{}'), layout: JSON.parse(await g('invoice_layout') || '{}'), logo: 'falcon', prefix: 'FAL' };
      return window.FalconFatura.html(inv, cfg, true); }, tp);
    fs.writeFileSync(path.join(OUT, 'fatura-' + tp + '.html'), h);
  }
  await app.close();
  fs.rmSync(ud, { recursive: true, force: true });
  const bad = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND.*\.map/.test(e));
  if (bad.length) { console.error('HATALAR:\n' + bad.join('\n')); process.exitCode = 1; } else console.log('✓ fatura e2e');
})().catch((e) => { console.error(e); process.exit(1); });
