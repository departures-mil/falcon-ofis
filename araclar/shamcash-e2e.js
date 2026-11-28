#!/usr/bin/env node
// v1.65 uçtan uca: Sham Cash dekontu (gerçek Electron).
//  1) dekont kutusuna konan PDF + doğrulanmış .json → kendiliğinden kasaya çıkış (Arapça adlar aynen, orijinal dosya bayt bayt)
//  2) aynı PDF .json'suz → çevrimdışı okuma (tesseract) → alanlar doğru (işlem no, tarih, saat, tutar, hesaplar), aynı işlem no tekrar yazılmaz
//  3) Kasa: Sham Cash çipi, "Sham Cash ile" süzgeci, Arapça aramada bulunur, ayrıntıda dekont bilgileri + not düzenleme
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/shamcash-e2e.js <dekont.pdf> <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const PDF = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3] || 'ekran-165');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });
const SENDER = 'متن ارجن جولر', RECIP = 'خليل ابراهيم علاء الدين شنكحيا';

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-165-'));
  const inbox = path.join(ud, 'Sham Cash Dekontları');
  fs.mkdirSync(inbox, { recursive: true });
  const NAME = 'sham_cash_receipt_20261126_190349_261126_191707';
  fs.copyFileSync(PDF, path.join(inbox, NAME + '.pdf'));
  fs.writeFileSync(path.join(inbox, NAME + '.json'), JSON.stringify({ kind: 'SEND', ref: '626382846', date: '26/11/2026', time: '19:03:45', from_name: SENDER, from_account: '************0951',
    to_name: RECIP, to_account: '************5465', amount: '300', currency: 'USD', note: '-', generated: '26/11/2026', me_name: SENDER, me_account: '0951', direction: 'out' }));
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(async (ver) => {
    const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
    set('scheme', 'falcon'); set('onboarding.done', true); set('whatsnew.seen', ver);
    localStorage.setItem('falcon-theme', 'dark');
    await window.falcon.settings.set('language', 'tr');
  }, require('../package.json').version);
  await page.reload();
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const q = (sql, p) => page.evaluate(([s, a]) => window.falcon.db.all(s, a || []), [sql, p]);

  // 1) kutudaki dekont + .json → kendiliğinden kayıt
  await page.waitForFunction(() => window.FalconShamDekont && window.FalconShamDekont.version, null, { timeout: 10000 });
  await page.evaluate(() => window.FalconShamDekont.checkInbox());
  let rows = [];
  for (let i = 0; i < 40 && !rows.length; i++) { await page.waitForTimeout(500); rows = await q('SELECT * FROM cash_transactions WHERE sc_ref = ?', ['626382846']); }
  assert.strictEqual(rows.length, 1, 'kendiliğinden kaydedilmedi');
  const tx = rows[0];
  assert.strictEqual(tx.direction, 'out'); assert.strictEqual(tx.amount, 300); assert.strictEqual(tx.date, '2026-11-26'); assert.strictEqual(tx.pay_method, 'shamcash');
  assert.strictEqual(tx.sc_name, RECIP); assert.strictEqual(JSON.parse(tx.sc_doc).from_name, SENDER);
  const acc = (await q('SELECT currency_code FROM cash_accounts WHERE id = ?', [tx.account_id]))[0];
  assert.strictEqual(acc.currency_code, 'USD');
  const rc = (await q('SELECT * FROM receipts WHERE transaction_id = ?', [tx.id]))[0];
  assert.ok(rc, 'dekont dosyası bağlanmadı');
  const stored = path.join(ud, 'data', 'files', rc.file_path);
  assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(stored)).digest('hex'), crypto.createHash('sha256').update(fs.readFileSync(PDF)).digest('hex'), 'orijinal bozulmuş');
  assert.ok(fs.existsSync(path.join(inbox, 'İşlendi', NAME + '.pdf')), 'işlendi klasörüne taşınmadı');
  assert.ok(!fs.existsSync(path.join(inbox, NAME + '.pdf')));
  const me = JSON.parse(await page.evaluate(() => window.falcon.settings.get('shamcash_me')));
  assert.deepStrictEqual(me, { names: [SENDER], accounts: ['0951'] });
  console.log('1) kendiliğinden kayıt ✓');

  // 2) .json'suz aynı dekont → çevrimdışı okuma
  const t0 = Date.now();
  const res = await page.evaluate(async (b64) => {
    const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const r = await window.FalconShamDekont.read(u8, 'application/pdf', 'sham_cash_receipt_20261126_190349_261126_191707.pdf');
    return { doc: r.doc, source: r.source, diffs: r.diffs };
  }, fs.readFileSync(PDF).toString('base64'));
  console.log('   çevrimdışı okuma', Date.now() - t0, 'ms', JSON.stringify(res));
  assert.strictEqual(res.source, 'offline');
  const d = res.doc;
  assert.strictEqual(d.ref, '626382846'); assert.strictEqual(d.date, '26/11/2026'); assert.strictEqual(d.time, '19:03:45');
  assert.strictEqual(d.amount, '300'); assert.strictEqual(d.currency, 'USD'); assert.strictEqual(d.kind, 'SEND');
  assert.match(d.from_account, /0951$/); assert.match(d.to_account, /5465$/);
  assert.strictEqual(d.from_name, SENDER, 'bilinen ad (boşluklar) eşleşmedi');
  // aynı dosya kutuya yeniden konursa: kopya — ikinci kez yazılmaz
  fs.copyFileSync(PDF, path.join(inbox, 'tekrar.pdf'));
  await page.evaluate(() => window.FalconShamDekont.open({}));
  await page.waitForSelector('.scd-modal .scd-top');
  await shot('01-pencere');
  await page.evaluate(() => document.querySelector('.scd-modal .modal-header .icon-btn').click());
  await page.evaluate(() => { document.querySelectorAll('.scd-toast').forEach((x) => x.remove()); window.FalconShamDekont.checkInbox(); });
  await page.waitForSelector('.scd-toast .btn.primary', { timeout: 60000 });
  await shot('02-bekleyen');
  await page.evaluate(() => document.querySelector('.scd-toast .btn.primary').click());
  await page.waitForSelector('.scd-card .scd-st.warn', { timeout: 60000 });
  const st = await page.textContent('.scd-card .scd-st');
  assert.match(st, /zaten kayıtlı/, 'kopya uyarısı yok: ' + st);
  await shot('03-kopya');
  assert.strictEqual((await q('SELECT COUNT(*) AS n FROM cash_transactions WHERE sc_ref = ?', ['626382846']))[0].n, 1);
  await page.evaluate(() => document.querySelector('.scd-modal .modal-header .icon-btn').click());
  console.log('2) çevrimdışı okuma + kopya engeli ✓');

  // 3) Kasa sayfası
  await page.evaluate(() => { location.hash = '#/cash'; });
  await page.waitForSelector('.sc-dk-btn', { timeout: 15000 });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  await page.waitForSelector('.sc-chip', { timeout: 15000 });
  await shot('04-kasa');
  const search = page.locator('input[type="search"], input[placeholder*="Ara"]').first();
  await search.fill('شنكحيا');
  await page.waitForTimeout(800);
  assert.ok(await page.locator('.sc-chip').count() >= 1, 'Arapça arama bulamadı');
  await search.fill('0951');
  await page.waitForTimeout(800);
  assert.ok(await page.locator('.sc-chip').count() >= 1, 'gönderen hesabıyla arama bulamadı');
  await search.fill('');
  await page.locator('.sc-chip').first().click();
  await page.waitForSelector('.sc-doc', { timeout: 10000 });
  const docTxt = await page.textContent('.sc-doc');
  assert.ok(docTxt.includes(SENDER) && docTxt.includes(RECIP) && docTxt.includes('626382846'), 'ayrıntıda dekont bilgileri yok');
  await page.click('.sc-note-row button:has-text("Notu düzenle")');
  await page.fill('.sc-note-ed input', 'Gerçek sahibi: Ahmet');
  await page.click('.sc-note-ed button.primary');
  await page.waitForTimeout(600);
  assert.strictEqual((await q('SELECT sc_note FROM cash_transactions WHERE id = ?', [tx.id]))[0].sc_note, 'Gerçek sahibi: Ahmet');
  await shot('05-ayrinti');
  await page.keyboard.press('Escape');
  for (const lg of ['en', 'ar']) {
    await page.evaluate((l) => window.falcon.settings.set('language', l), lg);
    await page.reload(); await page.waitForSelector('.topbar-actions'); await page.evaluate(() => { location.hash = '#/cash'; });
    await page.waitForSelector('.sc-dk-btn', { timeout: 15000 });
    await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
    await page.click('.sc-dk-btn');
    await page.waitForSelector('.scd-modal');
    await shot('06-' + lg);
    await page.keyboard.press('Escape');
  }
  console.log('3) Kasa: düğme, çip, arama, ayrıntı, not, 3 dil ✓');
  await app.close();
  if (errors.length) { console.log('HATALAR:\n' + errors.join('\n')); process.exit(1); }
  console.log('TAMAM');
})().catch((e) => { console.error(e); process.exit(1); });
