#!/usr/bin/env node
// v1.62 uçtan uca: fatura kâr ekleme (toplu / tekli), üst üste binmez, döviz çevirisiyle uyum, kayıt ve ürün fiyatı korunur.
// (araclar/fatura-fx-e2e.js ile aynı kurulum)
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/fatura-kar-e2e.js <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-kar');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-kar-'));
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
  const prices = () => page.$$eval('.fat-items tbody input.p', (xs) => xs.map((x) => x.value));
  const badges = () => page.$$eval('.fat-items tbody .fat-mk-b', (xs) => xs.map((x) => x.textContent));
  const curSel = page.locator('.fat-modal .field', { hasText: /^Para birimi/ }).locator('select');

  // 1) yeni fatura (TL)
  await page.click('.fatura-page .toolbar button:has-text("Yeni fatura")');
  await page.waitForSelector('.fat-items tbody tr');
  await page.fill('.fat-acw input', 'Kâr Müşteri');
  await page.fill('.fat-items tbody tr:nth-child(1) textarea.nm', 'Ürün A');
  await page.fill('.fat-items tbody tr:nth-child(1) input.q', '2');
  await page.fill('.fat-items tbody tr:nth-child(1) input.p', '100');
  await page.click('.fat-modal button:has-text("Kalem ekle")');
  await page.fill('.fat-items tbody tr:nth-child(2) textarea.nm', 'Ürün B');
  await page.fill('.fat-items tbody tr:nth-child(2) input.p', '50.5');
  await page.click('.fat-modal button:has-text("Kalem ekle")');
  await page.fill('.fat-items tbody tr:nth-child(3) textarea.nm', 'Kayıtlı Sensör');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await prices(), ['100', '50.5', '840']);
  // 2) toplu %15
  await page.locator('.fat-mk .fat-mk-c', { hasText: '%15' }).click();
  await page.click('.fat-mk button:has-text("Tüm kalemlere uygula")');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await prices(), ['115', '58.075', '966'], 'toplu %15');
  assert.deepStrictEqual(await badges(), ['+%15', '+%15', '+%15']);
  // 3) tekrar %10: üst üste binmez (ilk fiyattan)
  await page.fill('.fat-mk input', '10');
  await page.click('.fat-mk button:has-text("Tüm kalemlere uygula")');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await prices(), ['110', '55.55', '924'], 'üst üste binmez');
  // toplam: 2×110 + 55.55 + 924 = 1199.55; KDV %20 → 1439.46; kâr 20+5.05+84 = 109.05
  const tot = await page.textContent('.fat-tot');
  assert.ok(/1\.199,55/.test(tot) && /1\.439,46/.test(tot) && /Dahil kâr \(3\)/.test(tot) && /109,05/.test(tot), 'toplamlar: ' + tot);
  assert.ok(/3 kalemde kâr var/.test(await page.textContent('.fat-mk')));
  // 4) tekli: 2. kaleme %20
  await page.click('.fat-items tbody tr:nth-child(2) .fat-mk-b');
  await page.waitForSelector('.fat-mk-p');
  await shot('2-tekli-pencere');
  await page.locator('.fat-mk-p .fat-mk-c', { hasText: '%20' }).click();
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await prices(), ['110', '60.6', '924'], 'tekli %20');
  assert.deepStrictEqual(await badges(), ['+%10', '+%20', '+%10']);
  await page.evaluate(() => document.querySelector('.fat-mk').scrollIntoView({ block: 'center' }));
  await shot('1-kar-toplu');
  // 5) döviz: USD'ye geçip TL'ye dönünce kâr korunur, kayıpsız
  await curSel.selectOption('USD');
  await page.waitForTimeout(400);
  console.log('USD', await prices());
  assert.deepStrictEqual(await prices(), ['2.6191', '1.4429', '22'], 'USD kârlı');
  assert.deepStrictEqual(await badges(), ['+%10', '+%20', '+%10']);
  await curSel.selectOption('TRY');
  await page.waitForTimeout(400);
  assert.deepStrictEqual(await prices(), ['110', '60.6', '924'], 'TL’ye dönüş');
  // 6) elle fiyat → o kalemin kârı sıfırlanır
  await page.fill('.fat-items tbody tr:nth-child(3) input.p', '900');
  assert.deepStrictEqual(await badges(), ['+%10', '+%20', '％']);
  // 7) kaydet
  await page.locator('.fat-modal').last().locator('.modal-footer button', { hasText: /^Kaydet$/ }).click();
  await page.waitForTimeout(1200);
  const db = await page.evaluate(async () => {
    const q = (s) => window.falcon.db.all(s);
    return { inv: await q('SELECT * FROM invoices'), prod: await q('SELECT name, sale_price, cost_currency FROM products ORDER BY id') };
  });
  const inv = db.inv[0], items = JSON.parse(inv.items);
  console.log('kayıt', inv.total, items.map((x) => [x.price, x.mk]), db.prod);
  assert.deepStrictEqual(items.map((x) => x.price), [110, 60.6, 900]);
  assert.deepStrictEqual(items[0].mk, { b: 100, r: 10 });
  assert.deepStrictEqual(items[1].mk, { b: 50.5, r: 20 });
  assert.strictEqual(items[2].mk, undefined);
  const pr = (n) => db.prod.find((p) => p.name === n).sale_price;
  assert.strictEqual(pr('Ürün A'), 100, 'yeni ürün kârsız fiyatla açıldı');
  assert.strictEqual(pr('Ürün B'), 50.5);
  assert.strictEqual(pr('Kayıtlı Sensör'), 900, 'kârsız (elle) fiyat ürüne yazılır');
  // 8) yeniden aç: kâr görünür; tümünü kaldır → ilk fiyatlar
  await page.evaluate(() => [...document.querySelectorAll('.fatura-page .fat-acts button')].find((b) => b.textContent === '✎').click());
  await page.waitForSelector('.fat-items tbody tr');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(await badges(), ['+%10', '+%20', '％'], 'kayıttan geri geldi');
  await page.click('.fat-mk button:has-text("Tüm kârları kaldır")');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await prices(), ['100', '50.5', '900'], 'kâr kaldırıldı');
  assert.ok(/Henüz kâr eklenmedi/.test(await page.textContent('.fat-mk')));
  await page.evaluate(() => document.querySelector('.fat-mk').scrollIntoView({ block: 'center' }));
  await shot('3-kaldirildi');
  await app.close();
  fs.rmSync(ud, { recursive: true, force: true });
  const bad = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND.*\.map|net::|Failed to fetch|ERR_NAME|ERR_INTERNET|ERR_PROXY|ERR_TUNNEL/.test(e));
  if (bad.length) { console.error('HATALAR:\n' + bad.join('\n')); process.exitCode = 1; } else console.log('✓ fatura kâr e2e');
})().catch((e) => { console.error(e); process.exit(1); });
