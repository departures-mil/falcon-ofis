#!/usr/bin/env node
// 1.65.1 Kasa: TUTAR başlığına tıklayınca tutara göre sıralama (gerçek Electron, boş veri klasörü):
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/kasa-sirala-e2e.js [çıktı-klasörü]
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/tmp/kasa-sirala');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  for (const lang of ['tr', 'en', 'ar']) {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-sirala-'));
    const app = await pw._electron.launch({
      executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
      env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
    });
    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(lang + ': ' + e.message));
    await page.waitForSelector('.topbar-actions', { timeout: 30000 });
    await page.evaluate(async ({ lang, ver }) => {
      const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
      set('onboarding.done', true); set('whatsnew.seen', ver);
      await window.falcon.settings.set('language', lang);
      const db = window.falcon.db;
      const acc = await db.all(`SELECT id, currency_code FROM cash_accounts`);
      const id = (c) => (acc.find((a) => a.currency_code === c) || {}).id;
      await window.falcon.call('saveRates', { rates: { TRY: 50, SYP: 10000 } });
      const rows = [
        ['USD', 'in', 100, '2026-11-25', 'A +100 USD'],
        ['USD', 'out', 300, '2026-11-26', 'B -300 USD'],
        ['TRY', 'in', 10000, '2026-11-24', 'C +10000 TRY (=200 USD)'],
        ['SYP', 'in', 7600, '2026-11-27', 'D +7600 SYP (=0,76 USD)'],
        ['USD', 'in', 20, '2026-11-28', 'E +20 USD'],
      ];
      for (const [c, d, a, dt, ds] of rows)
        await window.falcon.call('saveCashTx', { account_id: id(c), direction: d, amount: a, date: dt, category: 'other', description: ds });
    }, { lang, ver: require('../package.json').version });
    await page.reload();
    await page.waitForSelector('.topbar-actions', { timeout: 30000 });
    await page.evaluate(() => { location.hash = '#/cash'; });
    await page.waitForSelector('th[aria-sort]', { timeout: 15000 });
    await page.waitForTimeout(800);
    const order = () => page.$$eval('table.table tbody tr', (trs) => trs.map((tr) => (tr.textContent.match(/\b[A-E] [+-]/) || ['?'])[0][0]).join(''));
    const th = page.locator('th[aria-sort]');
    const seen = { date: await order() };
    await th.click(); await page.waitForTimeout(300); seen.desc = await order(); seen.descAria = await th.getAttribute('aria-sort');
    await page.screenshot({ path: path.join(OUT, lang + '-buyukten-kucuge.png') });
    await th.click(); await page.waitForTimeout(300); seen.asc = await order(); seen.ascAria = await th.getAttribute('aria-sort');
    await page.screenshot({ path: path.join(OUT, lang + '-kucukten-buyuge.png') });
    await th.click(); await page.waitForTimeout(300); seen.back = await order();
    seen.title = await th.getAttribute('title');
    console.log(lang, JSON.stringify(seen));
    assert.strictEqual(seen.date, 'EDBAC');
    assert.strictEqual(seen.desc, 'CAEDB');   // 200 > 100 > 20 > 0,76 > -300 (USD karşılığı)
    assert.strictEqual(seen.asc, 'BDEAC');
    assert.strictEqual(seen.back, 'EDBAC');
    assert.strictEqual(seen.descAria, 'descending'); assert.strictEqual(seen.ascAria, 'ascending');
    await app.close();
  }
  assert.deepStrictEqual(errors, []);
  console.log('tamam');
})().catch((e) => { console.error(e); process.exit(1); });
