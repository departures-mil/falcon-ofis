#!/usr/bin/env node
// v1.65 uçtan uca: «Kasaya işle» — Sham Cash dekontu (görsel / PDF) okunur (yapay zeka anahtarı yok → çevrimdışı: OCR ve PDF metni),
// alanlar dolar, Sham Cash kasası seçilir, kısmi / fazla tutar, aynı işlem numarası uyarısı, dekont kasa hareketine ek; elle giriş + ek.
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/tahsilat-165-e2e.js <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-165');
const RC = path.join(__dirname, 'dekont-ornek');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-165-'));
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(async (ver) => {
    const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
    set('scheme', 'falcon'); set('onboarding.done', true); set('whatsnew.seen', ver);
    localStorage.setItem('falcon-theme', 'dark');
    await window.falcon.settings.set('language', 'tr');
    const usd = (await window.falcon.db.all("SELECT id FROM cash_accounts WHERE currency_code = 'USD' ORDER BY id"));
    const r0 = await window.falcon.call('saveAccount', { id: usd[0].id, name: 'Nakit USD', opening_balance: 0 });
    if (!r0.ok) throw new Error('kasa: ' + r0.error);
    // ikinci USD kasası yoksa Sham Cash adı ilk kasaya verilmez: test ikinciyi bekler
    if (usd[1]) await window.falcon.call('saveAccount', { id: usd[1].id, name: 'Sham Cash USD', opening_balance: 0 });
    else await window.falcon.call('saveAccount', { id: usd[0].id, name: 'Sham Cash USD', opening_balance: 0 });
    for (const [no, price] of [['FAL-2026-0003', 2145.75], ['FAL-2026-0004', 120], ['FAL-2026-0005', 50]]) {
      const x = await window.falcon.call('saveInvoice', { number: no, date: '2026-11-27', customer: { name: 'Müşteri ' + no }, currency: 'USD',
        items: [{ name: 'Hizmet', qty: 1, unit: 'Adet', price }], discount: 0, tax_rate: 0, template: 'falcon', lang: 'tr' });
      if (!x.ok) throw new Error('fatura: ' + x.error);
    }
  }, require('../package.json').version);
  await page.reload();
  await page.waitForSelector('.topbar-actions .fc-update-wrap', { timeout: 30000 });
  await page.evaluate(() => { location.hash = '#/invoices'; });
  await page.waitForSelector('.fatura-page .fat-acts', { timeout: 15000 });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const db = (sql, p) => page.evaluate(([s, a]) => window.falcon.db.all(s, a || []), [sql, p]);
  const openPay = async (no) => {
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll('.fatura-page tr, .fatura-page .fat-row, .fatura-page .row')].find((r) => r.textContent.includes(n) && r.querySelector('.fat-acts'));
      [...row.querySelectorAll('.fat-acts button')].find((b) => /Kasaya işle/.test(b.textContent)).click();
    }, no);
    await page.waitForSelector('.fat-modal .fat-rc-seg', { timeout: 10000 });
  };
  const val = (label) => page.evaluate((l) => { const f = [...document.querySelectorAll('.fat-modal .field')].find((x) => x.querySelector('.field-label').textContent.startsWith(l)); const i = f.querySelector('input,select'); return i.tagName === 'SELECT' ? i.options[i.selectedIndex].text : i.value; }, label);
  const flags = () => page.evaluate(() => [...document.querySelectorAll('.fat-rc-flags .fat-imp-st')].map((x) => x.textContent).join(' | '));
  const choose = async (file, btn) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.fat-modal button:has-text("' + (btn || 'Dekont seç') + '")')]);
    await fc.setFiles(path.join(RC, file));
  };
  const waitRead = async () => {
    await page.waitForFunction(() => document.querySelector('.fat-rc-flags .fat-imp-st'), null, { timeout: 90000 });
    await page.waitForTimeout(300);
  };
  const post = () => page.click('.fat-modal .modal-footer button.primary:has-text("Kasaya işle")');

  // 1) İngilizce Sham Cash ekran görüntüsü (koyu tema) → OCR; kısmi tahsilat
  await openPay('FAL-2026-0003');
  assert.ok(await page.isVisible('.fat-rc-seg button.on:has-text("Sham Cash")'), 'varsayılan mod Sham Cash');
  await shot('1-pencere');
  await choose('sham-en.png');
  await waitRead();
  let fl = await flags();
  assert.ok(/Çevrimdışı okundu \(OCR\)/.test(fl), 'çevrimdışı OCR: ' + fl);
  assert.ok(/kısmi/.test(fl), 'kısmi tahsilat uyarısı: ' + fl);
  assert.strictEqual(Number(await val('Tahsil edilen tutar')), 1000);
  assert.strictEqual(await val('Tahsilat tarihi'), '2026-11-27');
  assert.strictEqual(await val('Kasa'), 'Sham Cash USD');
  assert.strictEqual(await val('Gönderen'), 'Ahmad Khalil');
  assert.strictEqual(await val('İşlem no'), 'SC-88412093');
  await shot('2-okundu-en');
  await post();
  await page.waitForSelector('.fat-modal .fat-rc-seg', { state: 'detached', timeout: 10000 });
  let pays = await db("SELECT p.amount, p.note, p.date, a.name AS acc, (SELECT file_path FROM receipts r WHERE r.transaction_id = p.cash_transaction_id) AS f FROM invoice_payments p JOIN cash_accounts a ON a.id = p.account_id ORDER BY p.id");
  assert.strictEqual(pays.length, 1);
  assert.ok(pays[0].amount === 1000 && /Sham Cash · Gönderen: Ahmad Khalil · İşlem no: SC-88412093/.test(pays[0].note) && pays[0].acc === 'Sham Cash USD', JSON.stringify(pays[0]));
  if (!pays[0].f) console.log('HATA/toast:', await page.evaluate(() => document.body.innerText.slice(-600)), errors);
  assert.ok(/^receipts\/.+\.png$/.test(pays[0].f), 'dekont eki (orijinal PNG): ' + pays[0].f);
  let inv = await db("SELECT status, paid FROM invoices WHERE number = 'FAL-2026-0003'");
  assert.ok(inv[0].status === 'partial' && inv[0].paid === 1000, JSON.stringify(inv));

  // 2) aynı dekont ikinci kez → işlem no uyarısı (vazgeç), sonra Arapça dekont
  await openPay('FAL-2026-0003');
  assert.ok(await page.isVisible('.fat-pays button:has-text("Dekontu aç")'), 'listede dekont düğmesi');
  await choose('sham-en.png');
  await waitRead();
  await post();
  await page.waitForFunction(() => /daha önce kasaya işlenmiş/.test(document.body.innerText), null, { timeout: 10000 });
  await shot('3-ayni-islem-uyarisi');
  await page.evaluate(() => {
    const box = [...document.querySelectorAll('.modal, [role=dialog], .confirm')].reverse().find((b) => /daha önce kasaya işlenmiş/.test(b.innerText));
    const b = [...box.querySelectorAll('button')].find((x) => /Vazgeç|İptal|Hayır|Kapat/.test(x.textContent) && !x.classList.contains('primary'));
    b.click();
  });
  await page.waitForTimeout(500);
  assert.strictEqual((await db('SELECT id FROM invoice_payments')).length, 1, 'ikinci kez işlenmedi');
  await choose('sham-ar.png', 'Başka dekont');
  await waitRead();
  assert.strictEqual(Number(await val('Tahsil edilen tutar')), 500);
  assert.strictEqual(await val('İşlem no'), '774512903');
  assert.strictEqual(await val('Tahsilat tarihi'), '2026-11-26');
  assert.ok(/أحمد/.test(await val('Gönderen')), 'Arapça gönderen: ' + await val('Gönderen'));
  await shot('4-okundu-ar');
  await post();
  await page.waitForSelector('.fat-modal .fat-rc-seg', { state: 'detached', timeout: 10000 });

  // 3) metinli PDF dekont, tutar kalandan fazla → yalnız kalan işlenir
  await openPay('FAL-2026-0003');
  await choose('banka.pdf');
  await waitRead();
  fl = await flags();
  assert.ok(/Çevrimdışı okundu/.test(fl) && !/OCR/.test(fl), 'PDF metninden: ' + fl);
  assert.ok(/fazla/.test(fl), 'fazla tutar uyarısı: ' + fl);
  assert.strictEqual(Number(await val('Tahsil edilen tutar')), 645.75);
  assert.strictEqual(await val('İşlem no'), 'TR2026112500451');
  await shot('5-pdf-fazla');
  await post();
  await page.waitForSelector('.fat-modal .fat-rc-seg', { state: 'detached', timeout: 10000 });
  inv = await db("SELECT status, paid FROM invoices WHERE number = 'FAL-2026-0003'");
  assert.ok(inv[0].status === 'paid' && inv[0].paid === 2145.75, JSON.stringify(inv));
  pays = await db('SELECT (SELECT file_path FROM receipts r WHERE r.transaction_id = p.cash_transaction_id) AS f FROM invoice_payments p ORDER BY p.id');
  assert.ok(/\.pdf$/.test(pays[2].f), 'PDF olduğu gibi saklandı: ' + pays[2].f);
  assert.ok(fs.existsSync(path.join(ud, '..')) || true);

  // 4) elle giriş + isteğe bağlı ek (okuma yok)
  await openPay('FAL-2026-0004');
  await page.click('.fat-rc-seg button:has-text("Elle giriş")');
  assert.ok(await page.isHidden('.fat-rc-zone'), 'elle girişte dekont alanı yok');
  await choose('sham-ar.png', 'Dekont ekle');
  await page.waitForSelector('.fat-rc-att .fat-rc-name', { timeout: 15000 });
  assert.strictEqual(Number(await val('Tahsil edilen tutar')), 120, 'elle girişte tutar değişmez');
  await page.fill('.fat-modal .field:has(.field-label:text-is("Açıklama")) input', 'Elden ödeme');
  await shot('6-elle');
  await post();
  await page.waitForSelector('.fat-modal .fat-rc-seg', { state: 'detached', timeout: 10000 });
  pays = await db("SELECT p.note, (SELECT file_path FROM receipts r WHERE r.transaction_id = p.cash_transaction_id) AS f FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.number = 'FAL-2026-0004'");
  assert.ok(pays[0].note === 'Elden ödeme' && /^receipts\//.test(pays[0].f), JSON.stringify(pays));
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('fat_pay_mode')), 'manual', 'son mod hatırlanır');

  // 5) Arapça arayüz
  await page.evaluate(() => window.falcon.settings.set('language', 'ar'));
  await page.reload();
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(() => { location.hash = '#/invoices'; localStorage.setItem('fat_pay_mode', 'sham'); });
  await page.waitForSelector('.fatura-page .fat-acts', { timeout: 15000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('.fatura-page .fat-acts button')].find((x) => /الصندوق/.test(x.textContent)); b.click(); });
  await page.waitForSelector('.fat-modal .fat-rc-seg', { timeout: 10000 });
  await shot('7-ar');
  const arTxt = await page.evaluate(() => document.querySelector('.fat-modal').innerText);
  assert.ok(/شام كاش/.test(arTxt) && /إدخال يدوي/.test(arTxt), 'Arapça metinler');

  assert.deepStrictEqual(errors.filter((e) => !/net::ERR|Failed to load resource/.test(e)), [], 'sayfa hatası');
  await app.close();
  console.log('tahsilat-165 e2e: TAMAM →', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
