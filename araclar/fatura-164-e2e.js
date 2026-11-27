#!/usr/bin/env node
// v1.64 uçtan uca: tek dil (karışık dil yok), özet kartı yok, döviz kuru satırı varsayılan gizli + aç/kapa (TRY/SYP),
// çıktı para birimi çevirisi (kur fatura ile saklanır), önizleme düzeltmeleri kalıcı (dil başına, şablon değişince korunur, geri alma).
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/fatura-164-e2e.js <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-164');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });
const AR = /[؀-ۿ]/;

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-164-'));
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
    localStorage.setItem('falcon-theme', 'dark'); localStorage.setItem('fat.pvNames', 'keep');
    await window.falcon.settings.set('language', 'tr');
    await window.falcon.settings.set('invoice_company', JSON.stringify({ name: 'Falcon System', phone: '+90 212 000 00 00' }));
    const r = await window.falcon.call('saveRates', { rates: { TRY: 50, SYP: 13000 }, source: 'manual' });
    if (!r.ok) throw new Error('kur: ' + r.error);
    const items = [{ name: 'WD19X-P1 19mm Anahtarlı Mandal Buton', qty: 5, unit: 'Adet', price: 8, code: 'BTN.1', depot: 'K1B04', vat: 20 },
      { name: '6 Kanal Oto Bıçak Sigorta Kutusu', qty: 2, unit: 'Adet', price: 10, code: 'KOM.2', depot: 'K1B14', vat: 20 }];
    // meta.fx_rate (düzenleyicide çeviri yapılmış gibi) + Türkçe harfli tip «SATIŞ»
    const x = await window.falcon.call('saveInvoice', { number: 'FAL-2026-0001', date: '2026-11-27', customer: { name: 'İSTANİFY TEKNOLOJİ' }, currency: 'USD', items,
      discount: 0, tax_rate: 0, template: 'falcon', lang: 'en', meta: { inv_type: 'SATIŞ', issue_time: '21:07:43', fx_rate: '1 USD = 51,17 TRY' } });
    if (!x.ok) throw new Error('fatura: ' + x.error);
  }, require('../package.json').version);
  await page.reload();
  await page.waitForSelector('.topbar-actions .fc-update-wrap', { timeout: 30000 });
  const open = async () => {
    await page.evaluate(() => { location.hash = '#/invoices'; });
    await page.waitForSelector('.fatura-page .fat-acts', { timeout: 15000 });
    await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
    await page.evaluate(() => [...document.querySelectorAll('.fatura-page .fat-acts button')].find((b) => /PDF/.test(b.textContent)).click());
    await page.waitForSelector('.fat-pv-steps', { timeout: 10000 });
    await page.waitForFunction(() => { const h = document.querySelector('.fat-pv-host'); return h && h.shadowRoot.querySelector('.inv table.it'); }, null, { timeout: 10000 });
    await page.waitForTimeout(500);
  };
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const sh = (sel) => page.evaluate((s) => { const r = document.querySelector('.fat-pv-host').shadowRoot; return s ? [...r.querySelectorAll(s)].map((x) => x.textContent) : r.querySelector('.inv').textContent; }, sel);
  const close = () => page.click('.fat-modal .modal-footer button:has-text("Kapat")');
  const setting = (k) => page.evaluate((k2) => window.falcon.settings.get(k2), k);

  await open();
  // 1) İngilizce: tek dil, özet kartı yok, kur satırı gizli, tip «Sales»
  let txt = await sh();
  assert.ok(/INVOICE/.test(txt), 'İngilizce başlık');
  assert.ok(!AR.test(txt), 'İngilizce faturada Arapça yazı yok: ' + (txt.match(/[؀-ۿ].{0,20}/) || [''])[0]);
  assert.ok(!/FATURA/.test(txt), 'İngilizce faturada Türkçe başlık yok');
  assert.ok(!/Invoice summary/i.test(txt) && !(await sh('.sumc')).length, 'özet kartı yok');
  assert.ok(/Invoice Type:\s*Sales/.test(txt), 'SATIŞ → Sales: ' + txt.slice(0, 300));
  assert.ok(!/Exchange Rate/.test(txt), 'kur satırı varsayılan gizli');
  await shot('1-en');
  // 2) Türkçe: «Satış», Arapça yok
  await page.click('.fat-pv-lg button:has-text("Türkçe")');
  await page.waitForTimeout(300);
  txt = await sh();
  assert.ok(/Fatura Tipi:\s*Satış/.test(txt) && !AR.test(txt) && !/INVOICE/.test(txt), 'Türkçe tek dil: ' + txt.slice(0, 300));
  // 3) kur satırı aç: TRY + SYP
  await page.click('.fat-pv-bar label:has-text("Döviz kuru") input');
  await page.waitForTimeout(300);
  txt = await sh();
  assert.ok(/Döviz Kuru:\s*1 USD = 50,00 TRY · 1 USD = 13\.000 SYP/.test(txt), 'kur satırı: ' + (txt.match(/Döviz Kuru:.{0,60}/) || [''])[0]);
  await page.click('.fat-pv-fxcs label:has-text("SYP") input');
  await page.waitForTimeout(300);
  txt = await sh();
  assert.ok(/1 USD = 50,00 TRY/.test(txt) && !/13\.000 SYP/.test(txt), 'yalnız TRY');
  await page.click('.fat-pv-fxcs label:has-text("SYP") input');
  // 4) para birimini çevir → TRY (asıl USD); 5×8 + 2×10 = 60 USD = 3.000 TRY
  await page.click('.fat-pv-cur .fat-seg button:has-text("TRY")');
  await page.waitForTimeout(400);
  txt = await sh();
  assert.ok(/3\.000,00 ₺/.test(txt) && /Para Birimi:\s*TRY/.test(txt), 'TRY çevirisi: ' + (txt.match(/Genel Toplam.{0,30}/) || [''])[0]);
  assert.ok(/Türk Lirası/.test(txt), 'yazıyla tutar TRY');
  // elle kur: SYP 15000 → SYP çevirisi 900.000
  await page.fill('.fat-pv-rate:has-text("SYP") input', '15000');
  await page.press('.fat-pv-rate:has-text("SYP") input', 'Tab');
  await page.click('.fat-pv-cur .fat-seg button:has-text("SYP")');
  await page.waitForTimeout(400);
  txt = await sh();
  assert.ok(/900\.000 SYP/.test(txt) && /1 USD = 15\.000 SYP/.test(txt) && !AR.test(txt), 'SYP elle kur, Türkçede «ل.س» yok');
  await shot('2-tr-syp');
  // 5) düzelt: müşteri adı + başlık; Enter satır eklemez
  await page.click('.fat-pv-steps button:has-text("Düzelt")');
  await page.evaluate(() => {
    const r = document.querySelector('.fat-pv-host').shadowRoot;
    r.querySelector('.box b').firstChild.nodeValue = 'İSTANİFY TEKNOLOJİ A.Ş.';
    r.querySelector('.inv').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  let st = JSON.parse(await setting('invoice_pv_FAL-2026-0001'));
  assert.deepStrictEqual(st.ed.tr, [{ o: 'İSTANİFY TEKNOLOJİ', i: 1, n: 'İSTANİFY TEKNOLOJİ A.Ş.' }], 'düzeltme kaydedildi: ' + JSON.stringify(st.ed));
  assert.strictEqual(st.cur, 'SYP'); assert.strictEqual(st.rates.SYP, 15000);
  assert.ok(/1 düzeltme kayıtlı/.test(await page.textContent('.fat-pv-steps')), 'sayaç');
  await shot('3-duzelt');
  // 6) şablon değişince düzeltme korunur; İngilizce'de ayrı (uygulanmaz)
  await page.selectOption('.fat-pv-bar select', 'classic');
  await page.waitForTimeout(300);
  assert.ok(/TEKNOLOJİ A\.Ş\./.test(await sh()), 'şablon değişince korunur');
  await page.click('.fat-pv-lg button:has-text("English")');
  await page.waitForTimeout(300);
  assert.ok(!/A\.Ş\./.test(await sh()), 'İngilizce düzeltmesi ayrı');
  await page.click('.fat-pv-lg button:has-text("Türkçe")');
  await page.waitForTimeout(300);
  assert.ok(/TEKNOLOJİ A\.Ş\./.test(await sh()), 'Türkçe’ye dönünce geri');
  await page.click('.fat-pv-steps button:has-text("Düzeltmeyi bitir")');
  // 7) kapat / yeniden aç: dil, şablon, para birimi, kur, düzeltme yerinde
  await close();
  await page.waitForTimeout(400);
  await open();
  txt = await sh();
  assert.ok(/TEKNOLOJİ A\.Ş\./.test(txt) && /900\.000/.test(txt) && /FATURA/.test(txt), 'yeniden açınca aynı: ' + txt.slice(0, 200));
  assert.ok(await page.evaluate(() => !!document.querySelector('.fat-pv-host').shadowRoot.querySelector('[data-fe]')), 'düzeltme işaretli');
  // 8) PDF: düzeltme ve çeviri PDF'te, işaret yok
  const pdfDir = path.join(ud, 'pdf'); fs.mkdirSync(pdfDir, { recursive: true });
  await app.evaluate(({ dialog, shell }, dir) => { let n = 0; dialog.showSaveDialogSync = (_w, o) => dir + '/' + (++n) + '.pdf'; shell.openPath = async () => ''; }, pdfDir);
  await page.click('.fat-modal .modal-footer button:has-text("PDF olarak kaydet")');
  for (let i = 0; i < 40 && !fs.readdirSync(pdfDir).length; i++) await page.waitForTimeout(250);
  const { execFileSync } = require('child_process');
  const f1 = path.join(pdfDir, fs.readdirSync(pdfDir)[0]);
  const p1 = execFileSync('pdftotext', ['-layout', f1, '-']).toString();
  assert.ok(/TEKNOLOJİ A\.Ş\./.test(p1) && /900\.000/.test(p1), 'PDF: düzeltme + SYP');
  fs.copyFileSync(f1, path.join(OUT, 'fatura-tr-syp.pdf'));
  // 9) tek alanı geri al
  await page.evaluate(() => document.querySelector('.fat-pv-host').shadowRoot.querySelector('[data-fe]').click());
  await page.waitForSelector('.fat-pv-rev', { state: 'visible' });
  await shot('4-geri-al');
  await page.click('.fat-pv-rev');
  await page.waitForTimeout(400);
  assert.ok(!/A\.Ş\./.test(await sh()), 'geri alındı');
  st = JSON.parse(await setting('invoice_pv_FAL-2026-0001'));
  assert.deepStrictEqual(st.ed.tr, [], 'kayıttan silindi');
  // 10) asıl para birimine dön; faturanın kaydı hiç değişmedi
  await page.click('.fat-pv-cur .fat-seg button:has-text("USD")');
  await page.waitForTimeout(300);
  assert.ok(/60,00 \$/.test(await sh()), 'USD');
  const rec = await page.evaluate(() => window.falcon.db.all("SELECT currency_code, total, template FROM invoices WHERE number = 'FAL-2026-0001'"));
  assert.strictEqual(rec[0].currency_code, 'USD'); assert.strictEqual(rec[0].total, 72);
  await shot('5-tr-usd');
  await close();
  await app.close();
  fs.rmSync(ud, { recursive: true, force: true });
  const bad = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND.*\.map|net::|Failed to fetch|ERR_NAME|ERR_INTERNET|ERR_PROXY|ERR_TUNNEL/.test(e));
  if (bad.length) { console.error('HATALAR:\n' + bad.join('\n')); process.exitCode = 1; } else console.log('✓ fatura 1.64 e2e');
})().catch((e) => { console.error(e); process.exit(1); });
