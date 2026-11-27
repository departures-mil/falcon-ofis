#!/usr/bin/env node
// v1.63 uçtan uca: çıktı akışı (dil → ürün adları olduğu gibi / çevrilmiş → önizle ve düzelt → PDF), yeni PDF düzeni, ürün dökümü dil seçimi.
// (araclar/fatura-fx-e2e.js ile aynı kurulum)
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/cikti-e2e.js <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-cikti');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-ck-'));
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

  // 1) 28 kalemli fatura (aynı KDV) kayıtla
  await page.evaluate(async () => {
    const N = ['SD16 2 Pin 16mm Su Geçirmez Konnektör Takımı - Panel Tipi', 'LP-12-C04PE-02-001 4-Pin Su Geçirmez Konnektör - Erkek', 'LP-12-J04SX-02-101 4-Pin Su Geçirmez Konnektör - Dişi',
      'GX-16 8-Pin Su Geçirmez Mike Konnektör', 'WS-180 12V 200A Yüksek Akım Oto Marş Rölesi', '6 Kanal Oto Bıçak Sigorta Kutusu', 'TL-W5F2 6-36V 5mm PNP NC Endüktif Mesafe Sensörü'];
    const items = [];
    for (let i = 0; i < 28; i++) items.push({ name: N[i % N.length] + (i >= N.length ? ' #' + (i + 1) : ''), qty: 10, unit: 'Adet', price: 3.5 + i, code: 'KOM.KNN.05.' + String(1000 + i), depot: 'K1B15', vat: 20 });
    const r = await window.falcon.call('saveInvoice', { number: 'FAL-2026-0003', date: '2026-11-27', customer: { name: 'İSTANİFY TEKNOLOJİ ANONİM ŞİRKETİ' }, customer_address: 'MAHMUTBEY MAH. TAŞOCAĞI YOLU CAD. BAĞCILAR/ İSTANBUL', customer_tax: '4811330402', currency: 'USD', items, discount: 0, tax_rate: 0, template: 'falcon|nb|nd|nq|ns', lang: 'tr', meta: { inv_type: 'SATIS' } });
    if (!r.ok) throw new Error('fatura: ' + r.error);
  });
  await page.reload();
  await page.waitForSelector('.topbar-actions .fc-update-wrap', { timeout: 30000 });
  await page.evaluate(() => { location.hash = '#/invoices'; });
  await page.waitForSelector('.fatura-page .fat-acts', { timeout: 15000 });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  // 2) listedeki "PDF" doğrudan kaydetmez, çıktı penceresini açar
  await page.evaluate(() => [...document.querySelectorAll('.fatura-page .fat-acts button')].find((b) => /PDF/.test(b.textContent)).click());
  await page.waitForSelector('.fat-pv-steps', { timeout: 10000 });
  await page.waitForTimeout(500);
  assert.strictEqual(fs.readdirSync(pdfDir).length, 0, 'PDF önizlemeden önce kaydedilmedi');
  const sh = (sel) => page.evaluate((s) => { const r = document.querySelector('.fat-pv-host').shadowRoot; return s ? [...r.querySelectorAll(s)].map((x) => x.textContent) : r.textContent; }, sel);
  assert.ok(/FATURA/.test(await sh()), 'Türkçe önizleme');
  assert.ok(!/KDV Oranı/.test((await sh('table.it th')).join('|')), 'aynı KDV oranında KDV sütunu yok');
  assert.ok(/Yalnız:/.test(await sh()), 'yazıyla tutar');
  await shot('1-cikti-tr');
  // 3) İngilizce + ürün adları olduğu gibi
  await page.click('.fat-pv-lg button:has-text("English")');
  await page.waitForTimeout(400);
  let txt = await sh();
  assert.ok(/INVOICE/.test(txt) && /Amount in words:/.test(txt) && !/Invoice summary/i.test(txt), 'İngilizce metinler (1.64: özet kartı yok)');
  assert.ok(!/[\u0600-\u06FF]/.test(txt), 'İngilizce çıktıda Arapça yazı yok');
  assert.ok(/Su Geçirmez Konnektör/.test(txt), 'adlar olduğu gibi');
  // 4) ürün adlarını çevir (yapay zekâ anahtarı yok → çevrimdışı teknik sözlük)
  await page.click('.fat-pv-steps button:has-text("Seçilen dile çevir")');
  await page.waitForFunction(() => /çevrimdışı/.test(document.querySelector('.fat-pv-nm').textContent), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  txt = await sh();
  console.log((await sh('table.it td.nm')).slice(0, 7));
  assert.ok(/LP-12-C04PE-02-001 4-Pin Waterproof Connector - Male/.test(txt), 'çevrimdışı çeviri: ' + txt.slice(0, 0));
  assert.ok(/GX-16 8-Pin Waterproof Aviation Connector/.test(txt), 'mike konnektör');
  assert.ok(/WS-180 12V 200A High Current Automotive Starter Relay/.test(txt), 'röle');
  assert.ok(/10 pcs/.test(txt), 'birim çevrildi');
  await shot('2-cikti-en-cevrilmis');
  // 5) düzelt: müşteri adını önizlemede değiştir → PDF'e aynen girer
  await page.click('.fat-pv-steps button:has-text("Düzelt")');
  await page.evaluate(() => {
    const r = document.querySelector('.fat-pv-host').shadowRoot, b = r.querySelector('.box b');
    b.textContent = 'ISTANIFY TECHNOLOGY INC.'; r.querySelector('.inv').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await shot('3-duzelt');
  await page.click('.fat-modal .modal-footer button:has-text("PDF olarak kaydet")');
  await page.waitForFunction((d) => true, null);
  for (let i = 0; i < 40 && !fs.readdirSync(pdfDir).length; i++) await page.waitForTimeout(250);
  const f1 = lastPdf(); console.log('pdf', f1, pages(f1));
  const p1 = pdfText(f1);
  assert.ok(/ISTANIFY TECHNOLOGY INC\./.test(p1), 'düzeltme PDF’te');
  assert.ok(/Waterproof Connector/.test(p1) && /I\s*N\s*V\s*O\s*I\s*C\s*E/.test(p1), 'çevrilmiş İngilizce PDF');
  assert.ok(!/[\u0600-\u06FF]/.test(p1), 'İngilizce PDF’te Arapça yazı yok');
  assert.ok(/Page 1 \/ 2/.test(p1) && /Page 2 \/ 2/.test(p1), 'sayfa numarası: ' + pages(f1));
  assert.strictEqual(pages(f1), 2, '28 kalem 2 sayfa');
  fs.copyFileSync(f1, path.join(OUT, 'fatura-en.pdf'));
  // 6) Arapça, adlar olduğu gibi
  await page.click('.fat-pv-steps button:has-text("Olduğu gibi bırak")');
  await page.click('.fat-pv-lg button:has-text("العربية")');
  await page.waitForTimeout(400);
  assert.ok(/فقط/.test(await sh()) && /لا غير/.test(await sh()), 'Arapça yazıyla tutar');
  await page.click('.fat-modal .modal-footer button:has-text("PDF olarak kaydet")');
  for (let i = 0; i < 40 && fs.readdirSync(pdfDir).length < 2; i++) await page.waitForTimeout(250);
  const f2 = lastPdf(); const p2 = pdfText(f2);
  assert.ok(/2 \/ 2/.test(p2) && /Su Geçirmez/.test(p2), 'Arapça PDF, adlar Türkçe');
  fs.copyFileSync(f2, path.join(OUT, 'fatura-ar.pdf'));
  await shot('4-cikti-ar');
  await page.click('.fat-modal .modal-footer button:has-text("Kapat")');

  // 7) ürün dökümü (React): PDF önce çıktı penceresinden geçer, dil değişince döküm yeniden üretilir
  const hasExport = await page.evaluate(() => typeof window.FalconCikti === 'object');
  assert.ok(hasExport, 'FalconCikti yüklü');
  const before = fs.readdirSync(pdfDir).length;
  await page.evaluate(() => { location.hash = '#/products'; });
  await page.waitForTimeout(1200);
  const opened = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Dışa aktar|Döküm|PDF/i.test(x.textContent) && !x.closest('.fat-modal')); if (b) { b.click(); return b.textContent; } return null; });
  console.log('döküm düğmesi', opened);
  if (opened) {
    await page.waitForTimeout(600);
    await shot('5-dokum-dialog');
    await page.click('.modal button:has-text("Dökümü oluştur")');
    await page.waitForSelector('.ck-modal', { timeout: 10000 });
    assert.strictEqual(fs.readdirSync(pdfDir).length, before, 'döküm önizlemeden önce kaydedilmedi');
    await page.click('.ck-modal .ck-seg button:has-text("English")');
    await page.waitForTimeout(1200);
    const en = await page.evaluate(() => document.querySelector('.ck-modal iframe').contentDocument.body.textContent);
    console.log('döküm EN', en.slice(0, 120));
    assert.ok(/Product list/.test(en) && /All categories/.test(en), 'döküm İngilizce');
    assert.ok(!/units\./.test(en), 'birim anahtarı görünmez');
    const nmOn = await page.evaluate(() => { const b = [...document.querySelectorAll('.ck-modal .ck-seg button')].find((x) => /Seçilen dile çevir/.test(x.textContent)); return b && b.classList.contains('on'); });
    if (!nmOn) await page.click('.ck-modal .ck-seg button:has-text("Seçilen dile çevir")');
    await page.waitForFunction(() => /Waterproof/.test(document.querySelector('.ck-modal iframe').contentDocument.body.textContent), null, { timeout: 15000 });
    await shot('6-dokum-en');
    await page.click('.ck-modal .modal-footer .btn.primary');
    for (let i = 0; i < 40 && fs.readdirSync(pdfDir).length <= before; i++) await page.waitForTimeout(250);
    assert.ok(fs.readdirSync(pdfDir).length > before, 'döküm PDF kaydedildi');
    fs.copyFileSync(lastPdf(), path.join(OUT, 'dokum-en.pdf'));
    assert.ok(/Waterproof Aviation Connector/.test(pdfText(lastPdf())), 'döküm PDF adları çevrilmiş');
  }
  await app.close();
  fs.rmSync(ud, { recursive: true, force: true });
  const bad = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND.*\.map|net::|Failed to fetch|ERR_NAME|ERR_INTERNET|ERR_PROXY|ERR_TUNNEL/.test(e));
  if (bad.length) { console.error('HATALAR:\n' + bad.join('\n')); process.exitCode = 1; } else console.log('✓ çıktı e2e');
})().catch((e) => { console.error(e); process.exit(1); });
