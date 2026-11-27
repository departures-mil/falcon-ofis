#!/usr/bin/env node
// v1.61 uçtan uca: para birimi değişince fiyat çevirisi (orijinalden, gidiş-dönüş kayıpsız), kur kutusu, PDF'te kur satırı,
// ürün kaydının fiyatı değişmez; PDF içe aktarmada toplu pasif / aktif (okuyucu taklit edilir).
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/fatura-fx-e2e.js <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-fx');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-fx-'));
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
  const disc = () => page.evaluate(() => { const f = [...document.querySelectorAll('.fat-modal .field')].find((x) => /^İndirim/.test(x.textContent.trim())); return f && f.querySelector('input').value; });

  // 1) yeni fatura: TL fiyatlar
  await page.click('.fatura-page .toolbar button:has-text("Yeni fatura")');
  await page.waitForSelector('.fat-items tbody tr');
  await page.fill('.fat-acw input', 'Deneme Müşteri');
  await page.fill('.fat-items tbody tr:nth-child(1) textarea.nm', 'Ürün A');
  await page.fill('.fat-items tbody tr:nth-child(1) input.q', '2');
  await page.fill('.fat-items tbody tr:nth-child(1) input.p', '420');
  await page.click('.fat-modal button:has-text("Kalem ekle")');
  await page.fill('.fat-items tbody tr:nth-child(2) textarea.nm', 'Ürün B');
  await page.fill('.fat-items tbody tr:nth-child(2) input.p', '84.5');
  await page.click('.fat-modal button:has-text("Kalem ekle")');
  await page.fill('.fat-items tbody tr:nth-child(3) textarea.nm', 'Kayıtlı Sensör');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await prices(), ['420', '84.5', '840'], 'TL fiyatlar');
  const discIn = page.locator('.fat-modal .field', { hasText: /^İndirim/ }).locator('input');
  await discIn.fill('42');
  const curSel = page.locator('.fat-modal .field', { hasText: 'Para birimi' }).locator('select');
  // 2) USD: hepsi çevrilir
  await curSel.selectOption('USD');
  await page.waitForTimeout(500);
  const usd = await prices();
  console.log('USD', usd, await disc());
  assert.deepStrictEqual(usd, ['10', '2.0119', '20'], 'USD fiyatlar');
  assert.strictEqual(await disc(), '1', 'indirim USD');
  await page.evaluate(() => document.querySelector('.fat-fx').scrollIntoView({ block: 'center' }));
  await shot('1-usd');
  // 3) SYP, sonra TL: orijinale birebir döner
  await curSel.selectOption('SYP');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(await prices(), ['130000', '26155', '260000'], 'SYP fiyatlar');
  await curSel.selectOption('TRY');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(await prices(), ['420', '84.5', '840'], 'TL’ye geri dönüş kayıpsız');
  assert.strictEqual(await disc(), '42');
  // 4) kur elle: 1 USD = 40 TL → USD fiyatları yeniden
  await curSel.selectOption('USD');
  await page.waitForTimeout(300);
  await page.locator('.fat-fx-i', { hasText: 'TRY' }).locator('input').fill('40');
  await page.locator('.fat-fx-i', { hasText: 'TRY' }).locator('input').dispatchEvent('change');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(await prices(), ['10.5', '2.1125', '21'], 'elle kur');
  // 5) elle değiştirilen fiyat orijinal olur
  await page.fill('.fat-items tbody tr:nth-child(2) input.p', '3');
  await shot('2-elle-kur');
  // önizleme HTML'inde kur satırı
  await page.click('.fat-modal .modal-footer button:has-text("Önizle")');
  await page.waitForSelector('.fat-pv-host', { timeout: 10000 });
  await page.waitForTimeout(800);
  await shot('3-onizleme');
  await page.locator('.fat-modal').last().locator('.modal-footer button', { hasText: /^Kaydet$/ }).click();
  await page.waitForTimeout(1200);
  const db = await page.evaluate(async () => {
    const q = (s) => window.falcon.db.all(s);
    return { inv: await q('SELECT * FROM invoices'), prod: await q('SELECT name, sale_price, cost_currency FROM products ORDER BY id') };
  });
  const inv = db.inv[0], items = JSON.parse(inv.items), meta = JSON.parse(inv.meta || '{}');
  console.log('kayıt', inv.currency_code, inv.total, items.map((x) => [x.price, x.fx]), meta.fx_rate, db.prod);
  assert.strictEqual(inv.currency_code, 'USD');
  assert.deepStrictEqual(items[0].fx, { p: 420, c: 'TRY' });
  assert.strictEqual(items[1].fx, undefined, 'elle fiyat → fx yok');
  assert.ok(/1 USD = 40[.,]00 TRY/.test(meta.fx_rate), 'meta kur: ' + meta.fx_rate);
  const sensor = db.prod.find((p) => p.name === 'Kayıtlı Sensör');
  assert.deepStrictEqual([sensor.sale_price, sensor.cost_currency], [840, 'TRY'], 'kayıtlı ürün fiyatı değişmedi');
  const a = db.prod.find((p) => p.name === 'Ürün A');
  assert.deepStrictEqual([a.sale_price, a.cost_currency], [420, 'TRY'], 'yeni ürün orijinal TL fiyatıyla açıldı');
  const html = await page.evaluate(async () => { const r = await window.falcon.db.all('SELECT * FROM invoices'); return window.FalconFatura.html(r[0], { company: {}, layout: {}, logo: 'falcon' }, true); });
  assert.ok(/Döviz Kuru/.test(html) && /1 USD = 40/.test(html), 'PDF HTML kur satırı');
  fs.writeFileSync(path.join(OUT, 'fatura-usd.html'), html);

  // 6) PDF içe aktarma: toplu pasif / aktif (okuyucu taklit)
  await page.evaluate(() => {
    window.FalconFaturaPdf = { read: async () => ({ source: 'offline', currency: 'TRY', warnings: [], buyer: { name: 'PDF Alıcı' }, seller: { name: 'PDF Satıcı' }, meta: {},
      totals: { subtotal: 600 }, items: [{ name: 'P1', qty: 1, price: 100 }, { name: 'P2', qty: 2, price: 100 }, { name: 'P3', qty: 3, price: 100 }] }) };
  });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.fatura-page .toolbar button:has-text("PDF\'den doldur")')]);
  await fc.setFiles(path.join(ROOT, 'package.json'));
  await page.waitForSelector('.fat-imp-bulk', { timeout: 10000 });
  assert.ok(/3 \/ 3 aktif/.test(await page.textContent('.fat-imp-bulk')));
  await page.click('.fat-imp-bulk button:has-text("Tümünü pasif yap")');
  assert.ok(/0 \/ 3 aktif/.test(await page.textContent('.fat-imp-bulk')));
  assert.strictEqual(await page.$$eval('.fat-imp-t tbody tr.off', (x) => x.length), 3);
  await page.click('.fat-imp-t tbody tr:nth-child(2) input[type=checkbox]');
  assert.ok(/1 \/ 3 aktif/.test(await page.textContent('.fat-imp-bulk')));
  await shot('4-ice-aktar-pasif');
  await page.click('button:has-text("Faturaya aktar")');
  await page.waitForTimeout(600);
  const names = await page.$$eval('.fat-items tbody textarea.nm', (xs) => xs.map((x) => x.value));
  assert.deepStrictEqual(names, ['P2'], 'yalnız aktif kalem: ' + names);
  await shot('5-yalniz-aktif');
  // arayüz İngilizce / Arapça metinler
  await app.close();
  fs.rmSync(ud, { recursive: true, force: true });
  const bad = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND.*\.map|net::|Failed to fetch|ERR_NAME|ERR_INTERNET|ERR_PROXY|ERR_TUNNEL/.test(e));
  if (bad.length) { console.error('HATALAR:\n' + bad.join('\n')); process.exitCode = 1; } else console.log('✓ fatura döviz e2e');
})().catch((e) => { console.error(e); process.exit(1); });
