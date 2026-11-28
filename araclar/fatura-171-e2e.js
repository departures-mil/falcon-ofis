#!/usr/bin/env node
// v1.71 uçtan uca: «Belgeden doldur» — PDF (teklif, 3 sayfa) ve fotoğraf / ekran görüntüsü (JPEG) okuma, kalem seçimi, ürün kayıtları,
// faturaya özel (yalnız bana) dosyalar. Örnekler araclar/fatura-ornek/ (kullanıcının gönderdiği gerçek belgeler).
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/fatura-171-e2e.js <çıktı>
// Yapay zekâ (Gemini) ana süreçte taklit edilir; çevrimdışı okuma gerçek (pdf.js + Tesseract wasm).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-171');
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
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-171-'));
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
    await fc.setFiles(path.join(EX, file));
  };
  const waitPreview = async (ms) => {
    await page.waitForFunction(() => [...document.querySelectorAll('.modal')].some((m) => /Belgeden okunan bilgiler/.test(m.textContent)), null, { timeout: ms || 240000 });
    await sleep(400);
  };
  const rowsOf = () => page.evaluate(() => [...document.querySelectorAll('.fat-imp-t tbody tr')].map((tr) => ({
    code: tr.querySelector('.cd').value, name: tr.querySelector('.nm2').value, qty: tr.querySelector('.q').value, price: tr.querySelector('.p').value,
  })));

  // 1) Yeni fatura → Belgeden doldur → AKKO teklifi (PDF, İngilizce, 3 sayfa, 19 kalem, liste fiyatı + %50 iskonto), çevrimdışı (internet yok)
  await page.click('.fatura-page button:has-text("Yeni fatura")');
  await page.waitForSelector('.modal .fat-pdfbtn', { timeout: 10000 });
  await page.click('.modal .fat-pdfbtn');
  await shot('1-belge-sec');
  await pickDoc('akko-teklif.pdf');
  await waitPreview(120000);
  await shot('2-akko-onizleme');
  let rows = await rowsOf();
  assert.strictEqual(rows.length, 19, 'AKKO 19 kalem: ' + rows.length);
  assert.strictEqual(rows[0].code, 'SCACR 2525 M12');
  assert.ok(/KAPR 90° - 25mm SQ X 150mm OAL RH for CC\.\. 1204 Insert ISO/.test(rows[0].name), 'çok satırlı açıklama: ' + rows[0].name);
  assert.strictEqual(Number(rows[0].price), 30.1, 'net fiyat');
  assert.strictEqual(Number(rows[12].qty), 3);
  let txt = await top().textContent();
  assert.ok(/S157004/.test(txt) && /22\.10\.2026/.test(txt), 'belge no + ABD tarihi: ' + txt.slice(0, 300));
  assert.ok(/✓ Kalemlerin toplamı 1.087,55 · belgedeki ara toplam 1.087,55/.test(txt) || /1\.087,55/.test(txt), 'toplam denetimi');
  const custName = await page.evaluate(() => [...document.querySelectorAll('.fat-imp-c input')][0].value);
  assert.strictEqual(custName, 'Tecnova Corp.', 'müşteri = Customer bloğu');
  // ürün kaydı açık, belge eki açık → aktar
  await page.click('.modal button.primary:has-text("Faturaya aktar")');
  await page.waitForFunction(() => document.querySelectorAll('.modal .fat-items tbody tr').length >= 19, null, { timeout: 30000 });
  await sleep(500);
  await shot('3-fatura-dolu');
  const nProd1 = (await q('SELECT COUNT(*) AS n FROM products'))[0].n;
  assert.strictEqual(nProd1, 20, 'ürün kayıtları: 1 + 19 = ' + nProd1);
  const pr = await q("SELECT p.sale_price, p.cost_currency, p.description FROM products p WHERE p.code = 'APB.04.254.015'");
  assert.ok(pr[0] && pr[0].sale_price === 21.3 && pr[0].cost_currency === 'USD' && /Kaynak/.test(pr[0].description), 'ürün fiyatı + kaynak: ' + JSON.stringify(pr));
  assert.ok(/akko-teklif\.pdf/.test(await top().textContent()), 'okunan belge bekleyen özel dosya');
  await page.click('.modal .modal-footer button:has-text("Kaydet")');
  await sleep(1500);
  const inv = await q("SELECT id, customer_name, items FROM invoices ORDER BY id DESC LIMIT 1");
  assert.strictEqual(inv[0].customer_name, 'Tecnova Corp.');
  assert.strictEqual(JSON.parse(inv[0].items).length, 19);
  let pf = await q('SELECT * FROM invoice_files WHERE invoice_id = ?', [inv[0].id]);
  assert.strictEqual(pf.length, 1, 'faturaya özel dosya eklendi');
  assert.ok(/^belgeler\//.test(pf[0].file_path) && pf[0].original_name === 'akko-teklif.pdf');
  const raw = await page.evaluate((rel) => window.falcon.files.read(rel).then((b) => (b && b.data ? b.data : b).length), pf[0].file_path);
  assert.strictEqual(raw, fs.statSync(path.join(EX, 'akko-teklif.pdf')).size, 'belge bayt bayt');
  // aynı ürünler ikinci kez faturaya girince yeni ürün açılmaz
  assert.strictEqual((await q('SELECT COUNT(*) AS n FROM products'))[0].n, 20, 'fatura kaydı yeni ürün açmadı');

  // 2) Ürünler → Belgeden ürün ekle → temiz ekran görüntüsü (GBT45080, JPEG) çevrimdışı OCR
  await page.click('.fat-tabs button:has-text("Ürünler")');
  await page.click('.fatura-page button:has-text("Belgeden ürün ekle")');
  await pickDoc('gbt45080-ekran.jpg');
  const t0 = Date.now();
  await waitPreview(300000);
  console.log('GBT45080 OCR süresi', Math.round((Date.now() - t0) / 1000), 'sn');
  await shot('4-gbt45080-onizleme');
  rows = await rowsOf();
  console.log('GBT45080 kalemler', rows.length, JSON.stringify(rows.slice(0, 3)));
  assert.strictEqual(rows.length, 13, 'GBT45080 13 kalem: ' + rows.length);
  assert.deepStrictEqual(rows.map((r) => Number(r.qty)), [4, 20, 10, 10, 10, 60, 10, 2, 4, 100, 5, 1, 1], 'miktarlar');
  assert.deepStrictEqual(rows.map((r) => Number(r.price)), [9, 16, 35, 95, 45, 0.55, 3.5, 0.08, 8, 0.65, 5, 250, 300], 'birim fiyatlar');
  assert.ok(/10G SFP\+ Modül/.test(rows[2].name));
  txt = await top().textContent();
  assert.ok(/GBT45080/.test(txt) && /48\.6992/.test(txt), 'belge no + belgedeki kur');
  console.log('eşleşmeler:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.fat-imp-sel')].map((x) => x.options[x.selectedIndex].text))));
  await page.click('.modal button:has-text("Yalnız ürünlere kaydet")');
  await sleep(2500);
  const p10 = await q("SELECT id, sale_price FROM products WHERE name = '10G SFP+ Modül'");
  assert.strictEqual(p10.length, 1, 'aynı ürün ikinci kez açılmadı');
  assert.strictEqual(p10[0].sale_price, 35, 'kayıtlı ürünün fiyatı güncellendi');
  assert.ok((await q('SELECT COUNT(*) AS n FROM product_prices WHERE product_id = ?', [p10[0].id]))[0].n >= 2, 'fiyat geçmişi');
  const nProd2 = (await q('SELECT COUNT(*) AS n FROM products'))[0].n;
  if (nProd2 !== 32) console.log('ürünler:', JSON.stringify(await q("SELECT name, sale_price, description FROM products WHERE description LIKE '%GBT45080%' OR name LIKE '%Port%' OR name LIKE '%Modül%'")), await page.evaluate(() => [...document.querySelectorAll('.toast, [class*=toast]')].map((x) => x.textContent).join(' | ')));
  assert.ok(nProd2 >= 31 && nProd2 <= 32, '20 + 11–12 yeni ürün: ' + nProd2);
  await shot('5-urunler');

  // 3) Fotoğraf (GBT45891) — yapay zekâ ile (taklit): görüntü image/jpeg gider, çevrimdışı OCR aynı anda teyit eder
  await aiMode('ok', AI_891);
  await page.evaluate(() => window.falcon.settings.set('ai_gemini_key', 'TEST-KEY'));
  await page.click('.fatura-page button:has-text("Belgeden ürün ekle")');
  await pickDoc('gbt45891-foto.jpg');
  await waitPreview(300000);
  await shot('6-gbt45891-ai');
  rows = await rowsOf();
  assert.strictEqual(rows.length, 2);
  txt = await top().textContent();
  assert.ok(/ST2400MM0159/.test(txt) && /01D0F5/.test(txt) && /WBMAT6NA/.test(txt), 'Model / P/N / S/N gösterildi');
  aiSeen.push(...await app.evaluate(() => global.__aiSeen));
  assert.ok(aiSeen.includes('image/jpeg'), 'yapay zekâya resim gitti: ' + aiSeen);
  await page.click('.modal button:has-text("Kapat")');
  await aiMode('net');
  await page.evaluate(() => window.falcon.settings.set('ai_gemini_key', ''));

  // 4) Eğik telefon fotoğrafı (GBT45287) çevrimdışı — bilgi amaçlı (Tesseract; yerel zekâ paketi bu ortamda yok)
  await page.click('.fatura-page button:has-text("Belgeden ürün ekle")');
  await pickDoc('gbt45287-foto.jpg');
  try {
    await waitPreview(300000);
    rows = await rowsOf();
    console.log('GBT45287 (çevrimdışı, eğik foto) kalemler:', JSON.stringify(rows));
    await shot('7-gbt45287-cevrimdisi');
    await page.click('.modal button:has-text("Kapat")');
  } catch (e) {
    console.log('GBT45287 çevrimdışı okunamadı (beklenebilir):', String(e.message).slice(0, 80));
    await shot('7-gbt45287-cevrimdisi');
    await page.keyboard.press('Escape').catch(() => {});
  }

  // 4b) Taranmış e-Fatura (NURSAN, resim PDF; tablo çizgili, gölgeli satırlar) çevrimdışı OCR
  await page.click('.fatura-page button:has-text("Belgeden ürün ekle")');
  await pickDoc('taranmis-ornek5.pdf');
  await waitPreview(300000);
  await shot('7b-taranmis-efatura');
  rows = await rowsOf();
  console.log('NURSAN (taranmış) kalemler:', JSON.stringify(rows));
  assert.strictEqual(rows.length, 6, 'taranmış e-Fatura 6 kalem');
  assert.deepStrictEqual(rows.map((r) => Number(r.qty)), [1, 2, 2, 1, 1, 1], 'miktarlar');
  assert.deepStrictEqual(rows.map((r) => Number(r.price)), [14482.364, 16710.42, 16153.406, 1671.042, 1671.042, 1671.042], 'birim fiyatlar');
  txt = await top().textContent();
  assert.ok(/85\.223,13/.test(txt), 'ara toplam TL');
  await page.click('.modal button:has-text("Kapat")');

  // 5) Özel dosyalar: listeden 🔒 → dosya ekle (Word) → not → sil (Silinenler kutusuna)
  await page.click('.fat-tabs button:has-text("Faturalar")');
  await sleep(800);
  const docx = path.join(ud, 'sozlesme-notu.docx');
  fs.writeFileSync(docx, Buffer.from('PK\u0003\u0004 deneme belge', 'latin1'));
  assert.ok(await page.isVisible('.fat-pf-badge:has-text("1")'), 'listede özel dosya sayısı');
  await page.click('.fatura-page .fat-acts button[title^="Özel dosyalar"]');
  await page.waitForSelector('.modal .fat-pf-row', { timeout: 10000 });
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('.modal button:has-text("Dosya ekle")')]);
  await fc2.setFiles(docx);
  await page.waitForFunction(() => document.querySelectorAll('.modal .fat-pf-row').length === 2, null, { timeout: 10000 });
  await page.fill('.modal .fat-pf-row:nth-child(2) .nt input', 'Sözleşme taslağı — yalnız bende');
  await page.press('.modal .fat-pf-row:nth-child(2) .nt input', 'Tab');
  await sleep(600);
  await shot('8-ozel-dosyalar');
  pf = await q('SELECT * FROM invoice_files WHERE invoice_id = ? ORDER BY id', [inv[0].id]);
  assert.strictEqual(pf.length, 2);
  assert.strictEqual(pf[1].original_name, 'sozlesme-notu.docx');
  assert.strictEqual(pf[1].note, 'Sözleşme taslağı — yalnız bende');
  // fatura çıktısında görünmez
  const html = await page.evaluate(async (id) => { const r = await window.falcon.db.all('SELECT * FROM invoices WHERE id = ?', [id]); return JSON.stringify(r[0]); }, inv[0].id);
  assert.ok(!/sozlesme-notu|akko-teklif/.test(html), 'fatura kaydında / çıktıda dosya adı yok');
  await page.click('.modal .fat-pf-row:nth-child(2) button[title="Sil"]');
  await sleep(500);
  await page.click('.modal .fat-confirm-yes');
  await sleep(1200);
  pf = await q('SELECT * FROM invoice_files WHERE invoice_id = ?', [inv[0].id]);
  assert.strictEqual(pf.length, 1, 'silindi');
  const tr = await q("SELECT COUNT(*) AS n FROM trash_items");
  assert.ok(tr[0].n >= 1, 'Silinenler kutusunda');
  await shot('9-silindi');

  // 6) Arapça arayüz
  await page.evaluate(() => window.falcon.settings.set('language', 'ar'));
  await page.reload(); await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  await page.evaluate(() => { location.hash = '#/invoices'; });
  await page.waitForSelector('.fatura-page .fat-acts', { timeout: 15000 });
  await page.click('.fatura-page .fat-acts button[title^="ملفات خاصة"]');
  await page.waitForSelector('.modal .fat-pf-row', { timeout: 10000 });
  await shot('10-ar-ozel-dosyalar');

  const errs = errors.filter((e) => !/Failed to fetch|NetworkError|net::|telegram/i.test(e));
  assert.deepStrictEqual(errs, [], 'sayfa hataları');
  await app.close();
  console.log('fatura-171-e2e: TAMAM');
})().catch((e) => { console.error(e); process.exit(1); });
