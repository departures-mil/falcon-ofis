#!/usr/bin/env node
// v1.72 uçtan uca: «Kasaya işle» → «Tahsil edildi (kasaya eklenmez)»: fatura ödendi / kısmi sayılır, kasa hareketi oluşmaz, silinince geri döner.
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/fatura-172-e2e.js <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-172');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-172-'));
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  const q = (sql, a) => page.evaluate(([sql, a]) => window.falcon.db.all(sql, a || []), [sql, a]);
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(async (ver) => {
    const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
    set('scheme', 'falcon'); set('onboarding.done', true); set('whatsnew.seen', ver);
    await window.falcon.settings.set('language', 'tr');
    for (const [no, price] of [['FAL-2026-0001', 10600], ['FAL-2026-0002', 2750]]) {
      const x = await window.falcon.call('saveInvoice', { number: no, date: '2026-11-27', customer: { name: 'Nuh' }, currency: 'USD',
        items: [{ name: 'Hizmet', qty: 1, unit: 'Adet', price }], discount: 0, tax_rate: 0, template: 'falcon', lang: 'tr' });
      if (!x.ok) throw new Error('fatura: ' + x.error);
    }
  }, require('../package.json').version);
  await page.reload();
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  await page.evaluate(() => { location.hash = '#/invoices'; });
  await page.waitForSelector('.fatura-page .fat-acts', { timeout: 15000 });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const tx0 = (await q('SELECT COUNT(*) AS n FROM cash_transactions'))[0].n;
  const openPay = async (no) => {
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll('.fatura-page tr')].find((r) => r.textContent.includes(n) && r.querySelector('.fat-acts'));
      [...row.querySelectorAll('.fat-acts button')].find((b) => /Kasaya işle|Tahsilatlar/.test(b.textContent)).click();
    }, no);
    await page.waitForSelector('.fat-modal .fat-rc-seg', { timeout: 10000 });
  };

  // 1) tam tutar: kasaya eklenmeden tahsil edildi
  await openPay('FAL-2026-0001');
  await page.click('.fat-rc-seg button:has-text("Tahsil edildi (kasaya eklenmez)")');
  await sleep(300);
  assert.ok(await page.isVisible('.fat-modal .notice:has-text("kasaya para girişi yazılmaz")'), 'açıklama');
  assert.ok(!(await page.isVisible('.fat-modal .field:has-text("Kasa") select')), 'kasa alanı gizli');
  await shot('1-tahsil-edildi');
  await page.fill('.fat-modal .field:has-text("Açıklama") input', 'Elden alındı, başka hesapta');
  await page.click('.fat-modal .modal-footer button.primary:has-text("Tahsil edildi olarak işaretle")');
  await sleep(1200);
  let inv = await q("SELECT status, paid, total FROM invoices WHERE number = 'FAL-2026-0001'");
  assert.strictEqual(inv[0].status, 'paid', 'fatura ödendi');
  assert.strictEqual(inv[0].paid, 10600);
  assert.strictEqual((await q('SELECT COUNT(*) AS n FROM cash_transactions'))[0].n, tx0, 'kasa hareketi yok');
  const pay = await q("SELECT * FROM invoice_payments WHERE invoice_id = (SELECT id FROM invoices WHERE number = 'FAL-2026-0001')");
  assert.ok(pay.length === 1 && pay[0].cash_transaction_id == null && pay[0].account_id == null && pay[0].note === 'Elden alındı, başka hesapta');
  await shot('2-liste');

  // 2) kısmi tutar
  await openPay('FAL-2026-0002');
  await page.click('.fat-rc-seg button:has-text("Tahsil edildi (kasaya eklenmez)")');
  await page.fill('.fat-modal .field:has-text("Tahsil edilen tutar") input', '1000');
  await page.click('.fat-modal .modal-footer button.primary');
  await sleep(1200);
  inv = await q("SELECT status, paid FROM invoices WHERE number = 'FAL-2026-0002'");
  assert.strictEqual(inv[0].status, 'partial'); assert.strictEqual(inv[0].paid, 1000);
  // 3) tahsilat penceresinde «kasaya eklenmedi» etiketi; silinince fatura geri döner
  await openPay('FAL-2026-0002');
  assert.ok(await page.isVisible('.fat-modal .fat-nocash'), 'etiket');
  assert.ok(!(await page.isVisible('.fat-rc-seg button.on:has-text("Tahsil edildi")')), 'varsayılan mod hatırlanmaz');
  await shot('3-etiket');
  await page.click('.fat-modal .fat-pays button:has-text("Sil")');
  await page.click('.modal .fat-confirm-yes');
  await sleep(1200);
  inv = await q("SELECT status, paid FROM invoices WHERE number = 'FAL-2026-0002'");
  assert.strictEqual(inv[0].status, 'pending'); assert.strictEqual(inv[0].paid, 0);
  assert.strictEqual((await q('SELECT COUNT(*) AS n FROM cash_transactions'))[0].n, tx0);
  assert.deepStrictEqual(errors, [], 'sayfa hataları');
  await app.close();
  console.log('fatura-172-e2e: TAMAM');
})().catch((e) => { console.error(e); process.exit(1); });
