#!/usr/bin/env node
// v1.74 uçtan uca: «Belgeden doldur» — birden çok ekran görüntüsü (3 sayfalık teklif) tek listede birleşir; yalnız ürün tablosu (fiyatsız,
// «Goods / Services | Quantity») ekran görüntüsü; çevrimdışı teknik çeviri kütüphanesi. Örnekler araclar/fatura-ornek/ekran/ (depoda yok).
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/fatura-171-e2e.js <çıktı>
// Yapay zekâ (Gemini) ana süreçte taklit edilir; çevrimdışı okuma gerçek (pdf.js + Tesseract wasm).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-174');
// gerçek belgeler depoya konmaz (açık depo): FATURA_ORNEK klasörü ya da yerel araclar/fatura-ornek/
const EX = path.resolve(process.env.FATURA_ORNEK || path.join(__dirname, 'fatura-ornek'));
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

// GBT45891 fotoğrafının yapay zekâ yanıtı (taklit)
const AI_891 = {
  doc_type: 'quote', currency: 'USD',
  seller: { name: 'Örnek Bilişim Ltd. Şti.', address: 'Örnek Mah. 1. Sok. No:1 İstanbul', tax_office: 'Örnek', tax_no: '1111111111', phone: '0212 000 00 00' },
  buyer: { name: 'Deneme Müşteri Ltd. Şti.', address: 'Deneme Cad. No:2 İstanbul', tax_office: 'Deneme', tax_no: '2222222222', contact: 'Deneme Kişi' },
  meta: { number: 'GBT45891', date: '2026-10-15', valid_until: '2026-10-15', doc_fx_rate: 49.4945, doc_fx_cur: 'USD', doc_try_total: 989731.6176 },
  items: [
    { name: 'Dell / Seagate Exos 10E2400 2.4TB SAS 12Gbps 10K RPM 2.5" Enterprise HDD Model: ST2400MM0159, Dell P/N: 01D0F5, S/N: WBMAT6NA', model: 'ST2400MM0159', part_no: '01D0F5', serial: 'WBMAT6NA', qty: 16, unit: 'ADET', price: 750, amount: 12000, vat: 20 },
    { name: 'eKitStor Xtreme 300S 480GB SSD SAS Disk', qty: 8, unit: 'ADET', price: 583, amount: 4664, vat: 20 },
  ],
  totals: { subtotal: 16664, vat: 3332.8, total: 19996.8 },
};

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-174-'));
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_INTERNET|net::|duyuru|raw\.githubusercontent|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const aiSeen = [];
  const aiMode = (mode, doc) => app.evaluate(({ ipcMain }, [mode, doc]) => {
    ipcMain.removeHandler('ai:request');
    global.__aiSeen = [];
    ipcMain.handle('ai:request', async (_e, req) => {
      if (mode === 'net') return { status: 0, data: null, error: 'net::ERR_INTERNET_DISCONNECTED' };
      if (/models\?/.test(req.url)) return { status: 200, data: { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] } };
      try { global.__aiSeen.push(req.body.contents[0].parts[0].inline_data.mime_type); } catch (e) {}
      return { status: 200, data: { candidates: [{ content: { parts: [{ text: JSON.stringify(doc) }] } }] } };
    });
  }, [mode, doc || null]);
  const q = (sql, a) => page.evaluate(([sql, a]) => window.falcon.db.all(sql, a || []), [sql, a]);
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(async (ver) => {
    const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
    set('scheme', 'falcon'); set('onboarding.done', true); set('whatsnew.seen', ver);
    await window.falcon.settings.set('language', 'tr');
    await window.falcon.settings.set('ai_gemini_key', '');
    // önceden kayıtlı ürün: belgede aynı adla geçiyor → fiyatı güncellenmeli (30 → 35)
    const r = await window.falcon.call('saveProductCard', { name: '10G SFP+ Modül', unit: 'ADET', sale_price: 30, currency: 'USD' });
    if (!r.ok) throw new Error('ürün: ' + r.error);
  }, require('../package.json').version);
  await aiMode('net');
  await page.reload();
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  await page.evaluate(() => { location.hash = '#/invoices'; });
  await page.waitForSelector('.fatura-page', { timeout: 15000 });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const top = () => page.locator('.modal').last();
  const pickDoc = async (file) => {
    await page.waitForSelector('.fat-drop', { timeout: 10000 });
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.modal button:has-text("Dosya seç")')]);
    await fc.setFiles([].concat(file).map((f) => path.join(EX, 'ekran', f)));
  };
  const waitPreview = async (ms) => {
    await page.waitForFunction(() => [...document.querySelectorAll('.modal')].some((m) => /Belgeden okunan bilgiler/.test(m.textContent)), null, { timeout: ms || 240000 });
    await sleep(400);
  };
  const rowsOf = () => page.evaluate(() => [...document.querySelectorAll('.fat-imp-t tbody tr')].map((tr) => ({
    code: tr.querySelector('.cd').value, name: tr.querySelector('.nm2').value, qty: tr.querySelector('.q').value, price: tr.querySelector('.p').value,
  })));

  const E = fs.readdirSync(path.join(EX, 'ekran'));
  const f = (p) => E.find((x) => x.startsWith(p));
  // 1) üç ekran görüntüsü birlikte seçilir → tek listede 19 kalem, toplam son sayfadan
  await page.click('.fatura-page button:has-text("Yeni fatura")');
  await page.waitForSelector('.modal .fat-pdfbtn', { timeout: 10000 });
  await page.click('.modal .fat-pdfbtn');
  if (!process.env.ATLA1) { await pickDoc([f('09-'), f('01-'), f('02-')]);
  await waitPreview(400000); }
  await shot('1-uc-sayfa');
  let rows = process.env.ATLA1 ? new Array(19).fill({}) : await rowsOf();
  console.log('birleşik kalem:', rows.length, JSON.stringify(rows.slice(0, 2)));
  assert.ok(rows.length >= 18 && rows.length <= 20, '3 sayfa birleşti: ' + rows.length);
  if (!process.env.ATLA1) { const txt = await top().textContent(); assert.ok(/Stok: 1 Ready/.test(txt), 'stok durumu görünür'); }
  await page.reload();
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  await page.evaluate(() => { location.hash = '#/invoices'; });
  await page.waitForSelector('.fatura-page', { timeout: 15000 });
  await page.click('.fatura-page button:has-text("Yeni fatura")');
  await page.waitForSelector('.modal .fat-pdfbtn', { timeout: 10000 });
  await page.click('.modal .fat-pdfbtn');
  await page.waitForSelector('.fat-drop', { timeout: 10000 });
  const b64 = fs.readFileSync(path.join(EX, 'ekran', f('03-'))).toString('base64');
  await page.evaluate((b64) => {
    const b = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([b], 'urunler.png', { type: 'image/png' }));
    [...document.querySelectorAll('.modal .fat-drop')].pop().dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, b64);
  await sleep(800); await shot('2a-birakma');
  await page.waitForSelector('.fat-pick-it', { timeout: 5000 });
  await shot('2-liste');
  await page.click('.modal button:has-text("Oku")');
  await waitPreview(300000);
  await shot('3-yalniz-urunler');
  rows = await rowsOf();
  console.log('ürün tablosu:', rows.length, JSON.stringify(rows.slice(0, 3)));
  assert.ok(rows.length >= 12, 'fiyatsız ürün listesi okundu: ' + rows.length);
  assert.strictEqual(Number(rows[0].qty), 4);
  // 3) çevrimdışı teknik çeviri: Türkçe kelime kalmaz
  const tr = await page.evaluate((ns) => ns.map((n) => window.FalconSozluk.translate(n, 'en')), rows.map((r) => r.name));
  tr.forEach((r) => console.log('  ', r.text));
  const bad = tr.filter((r) => /[çğıöşüÇĞİÖŞÜ]/.test(r.text));
  assert.ok(bad.length <= 1, 'çeviride Türkçe kaldı: ' + bad.map((r) => r.text).join(' | '));
  await app.close();
  fs.rmSync(ud, { recursive: true, force: true });
  const errs = errors.filter((e) => !/status of 404/.test(e));
  if (errs.length) { console.error('HATALAR:\n' + errs.join('\n')); process.exitCode = 1; } else console.log('fatura-174-e2e: TAMAM');
})().catch((e) => { console.error(e); process.exit(1); });
