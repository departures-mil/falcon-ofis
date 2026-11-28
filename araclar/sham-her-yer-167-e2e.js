#!/usr/bin/env node
// 1.67 Sham Cash her yerde (gerçek Electron, boş veri klasörü; dosya seçme penceresi ana süreçte taklit edilir):
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/sham-her-yer-167-e2e.js [çıktı-klasörü]
// 1) Para girişi formunda Sham Cash bölümü; yöntem Sham Cash → kasa Sham Cash USD, Nakit → Sham Cash olmayan kasa; kasa listesinden Sham Cash kasası → yöntem Sham Cash
// 2) «Sham Cash dekontu ekle» → tutar / tarih / gönderen / işlem no / kasa dolar; kayıtta sc_doc + orijinal dosya (bayt bayt aynı) + receipts
// 3) Aynı dekont ikinci kez eklenmez  4) Para çıkışı: yön öğrenilen addan (gönderen benim) → çıkış, alıcı adı
// 5) Aktarımda Sham Cash kasası tarafı pay_method=shamcash  6) Girişteki Sham Cash bilgisi düzenleyip kaydedince silinmez  7) tr/en/ar ekran
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto'), assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/tmp/sham-167');
const SAMPLE = path.join(__dirname, 'dekont-ornek');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-sham167-'));
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  const pickFile = (p) => app.evaluate(({ dialog }, p) => { dialog.showOpenDialogSync = () => [p]; }, p);
  const q = (sql, a) => page.evaluate(([sql, a]) => window.falcon.db.all(sql, a || []), [sql, a]);
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  // internetten gelen admin duyurusu testte tıklamaları kapatmasın
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.aduy-ort{display:none!important}'; document.head.appendChild(st); }); });
  await page.addStyleTag({ content: '.aduy-ort{display:none!important}' });
  await page.evaluate(async (ver) => {
    localStorage.setItem('fc.onboarding.done', 'true'); localStorage.setItem('fc.whatsnew.seen', JSON.stringify(ver));
    await window.falcon.settings.set('language', 'tr');
    await window.falcon.call('saveAccount', { id: 1, name: 'Sham Cash USD', opening_balance: 0 });
  }, require('../package.json').version);
  await page.reload();
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(() => { location.hash = '#/cash'; });
  await page.waitForTimeout(1500);
  const dlg = page.locator('.modal').last();
  const accSel = () => dlg.locator('select').first();
  const accName = async () => accSel().evaluate((s) => s.options[s.selectedIndex].textContent);
  const pm = (k) => dlg.locator('.pm-seg .pm-' + k);

  // 1) para girişi: yöntem ↔ kasa
  await page.getByRole('button', { name: 'Para Girişi' }).first().click();
  await dlg.waitFor();
  await accSel().selectOption({ label: 'Nakit Dolar (USD)' });
  assert.ok(await pm('shamcash').count(), 'girişte Sham Cash bölümü');
  await pm('shamcash').click(); await sleep(200);
  assert.strictEqual(await accName(), 'Sham Cash USD (USD)', 'Sham Cash → Sham Cash kasası');
  await pm('cash').click(); await sleep(200);
  assert.notStrictEqual(await accName(), 'Sham Cash USD (USD)', 'Nakit → Sham Cash olmayan kasa');
  await accSel().selectOption({ label: 'Sham Cash USD (USD)' }); await sleep(200);
  assert.ok(/active/.test(await pm('shamcash').getAttribute('class')), 'Sham Cash kasası → yöntem Sham Cash');
  await accSel().selectOption({ label: 'Nakit Dolar (USD)' });
  await pm('cash').click();

  // 2) dekont ekle
  await pickFile(path.join(SAMPLE, 'sham-giris.pdf'));
  await dlg.locator('.sc-attach-btn').click();
  await dlg.locator('.sc-attach a').waitFor({ timeout: 30000 });
  // 1.67.1: yön bilinmiyorsa dekont türü esas (SEND → Çıkış + uyarı); kullanıcı Giriş'i seçince gönderen dekonttan yeniden alınır
  if (/out/.test(await dlg.locator('.segmented button.active').first().getAttribute('class'))) {
    assert.ok(await dlg.locator('.sc-read .sc-msg.warn').count() >= 1, 'tür uyarısı');
    await dlg.locator('.segmented button', { hasText: /^Giriş$/ }).first().click(); await sleep(400);
  }
  const vals = await dlg.evaluate((d) => [...d.querySelectorAll('input')].map((i) => i.value));
  assert.ok(vals.includes('250'), 'tutar doldu ' + vals);
  assert.ok(vals.includes('2026-11-27'), 'tarih doldu');
  assert.ok(vals.includes('Ahmad Khalil'), 'gönderen adı doldu');
  assert.ok(vals.includes('900111222'), 'işlem no doldu');
  assert.strictEqual(await accName(), 'Sham Cash USD (USD)', 'dekont → Sham Cash kasası');
  assert.ok(await dlg.getByText('Gönderenin adı').count(), 'girişte gönderen etiketi');
  await page.screenshot({ path: path.join(OUT, 'tr-giris-dekont.png') });
  await dlg.locator('button:visible', { hasText: /^(Kaydet|Save|حفظ)$/ }).last().click();
  await dlg.waitFor({ state: 'detached', timeout: 15000 });
  let tx = (await q("SELECT * FROM cash_transactions WHERE sc_ref = '900111222'"))[0];
  assert.ok(tx, 'kayıt');
  assert.strictEqual(tx.direction, 'in'); assert.strictEqual(tx.amount, 250); assert.strictEqual(tx.pay_method, 'shamcash');
  assert.strictEqual(tx.sc_name, 'Ahmad Khalil');
  const doc = JSON.parse(tx.sc_doc);
  assert.strictEqual(doc.to_name, 'Metin Ercan Guler'); assert.ok(doc.file_path, 'dosya yolu');
  const rc = await q('SELECT * FROM receipts WHERE transaction_id = ?', [tx.id]);
  assert.strictEqual(rc.length, 1, 'dekont kayda bağlı');
  const dataDir = await page.evaluate(() => window.FalconCore && window.FalconCore.info ? window.FalconCore.info().dataDir : null);
  const cand = [dataDir, ud].filter(Boolean).map((d) => [path.join(d, 'files', rc[0].file_path), path.join(d, rc[0].file_path)]).flat().find((p) => fs.existsSync(p));
  if (cand) assert.strictEqual(sha(cand), sha(path.join(SAMPLE, 'sham-giris.pdf')), 'orijinal bayt bayt');
  const me = await page.evaluate(() => window.falcon.settings.get('shamcash_me'));
  assert.ok(/Metin/.test(String(me)), 'adım öğrenildi ' + me);

  // 3) aynı dekont ikinci kez
  await page.getByRole('button', { name: 'Para Girişi' }).first().click();
  await dlg.waitFor();
  await dlg.locator('.sc-attach-btn').click();
  await sleep(4000);
  assert.strictEqual(await dlg.locator('.sc-attach a').count(), 0, 'aynı dekont eklenmedi');
  await dlg.locator('button', { hasText: /Vazgeç|İptal/ }).first().click().catch(() => page.keyboard.press('Escape'));
  await sleep(500);

  // 4) para çıkışı: gönderen benim → çıkış, alıcı adı
  await page.getByRole('button', { name: 'Para Çıkışı' }).first().click();
  await dlg.waitFor();
  await pickFile(path.join(SAMPLE, 'sham-cikis.pdf'));
  await dlg.locator('.sc-attach-btn').click();
  await dlg.locator('.sc-attach a').waitFor({ timeout: 30000 });
  await dlg.locator('button:visible', { hasText: /^(Kaydet|Save|حفظ)$/ }).last().click();
  await dlg.waitFor({ state: 'detached', timeout: 15000 });
  tx = (await q("SELECT * FROM cash_transactions WHERE sc_ref = '900111333'"))[0];
  assert.strictEqual(tx.direction, 'out'); assert.strictEqual(tx.amount, 75); assert.strictEqual(tx.sc_name, 'Omar Saleh');

  // 5) aktarım: Sham Cash kasası tarafı
  await page.evaluate(() => window.falcon.call('transfer', { from_account: 101, to_account: 1, amount_from: 40, amount_to: 40, date: '2026-11-28', description: 'yatırma' }));
  const tr = await q("SELECT account_id, direction, pay_method FROM cash_transactions WHERE related_type = 'transfer' ORDER BY id");
  assert.deepStrictEqual(tr.map((r) => [r.account_id, r.direction, r.pay_method]), [[101, 'out', null], [1, 'in', 'shamcash']]);

  // 6) elle girilen Sham Cash girişini düzenle → bilgi silinmez
  const id6 = await page.evaluate(() => window.falcon.call('saveCashTx', { account_id: 1, direction: 'in', amount: 10, date: '2026-11-28', category: 'other', pay_method: 'shamcash', sc_on: true, sc_name: 'Ali', sc_ref: 'R-6' }));
  const t6 = (await q('SELECT * FROM cash_transactions WHERE id = ?', [id6.data.id]))[0];
  assert.strictEqual(t6.sc_name, 'Ali'); assert.strictEqual(t6.pay_method, 'shamcash');
  await page.reload(); await page.waitForSelector('.topbar-actions'); await page.evaluate(() => { location.hash = '#/cash'; }); await sleep(1500);
  await page.locator('tr', { hasText: 'Ali' }).locator('button.icon-btn').first().click();
  await dlg.waitFor(); await dlg.locator('button:visible', { hasText: /^(Kaydet|Save|حفظ)$/ }).last().click(); await dlg.waitFor({ state: 'detached' });
  const t6b = (await q('SELECT * FROM cash_transactions WHERE id = ?', [id6.data.id]))[0];
  assert.strictEqual(t6b.sc_name, 'Ali', 'düzenlemede silinmedi'); assert.strictEqual(t6b.sc_ref, 'R-6');

  // 7) dekonttan gelen kaydın formu (değiştirilemez) + dil ekranları
  for (const lg of ['tr', 'en', 'ar']) {
    await page.evaluate((lg) => window.falcon.settings.set('language', lg), lg);
    await page.reload(); await page.waitForSelector('.topbar-actions'); await page.evaluate(() => { location.hash = '#/cash'; }); await sleep(1500);
    await page.locator('tbody tr').filter({ hasText: /250/ }).first().locator('button.icon-btn').first().click();
    await dlg.waitFor();
    assert.ok(await dlg.locator('.sc-doc').count(), lg + ': dekont bilgileri formda');
    await page.screenshot({ path: path.join(OUT, lg + '-dekontlu-kayit.png') });
    await page.keyboard.press('Escape'); await sleep(400);
    if (await dlg.count()) await dlg.locator('button').filter({ hasText: /Vazgeç|Cancel|إلغاء/ }).first().click().catch(() => {});
    await sleep(300);
    const btnName = { tr: 'Para Çıkışı', en: 'Cash Out', ar: 'إخراج أموال' }[lg];
    await page.getByRole('button', { name: btnName }).first().click().catch(() => {});
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, lg + '-cikis-formu.png') });
    await page.keyboard.press('Escape'); await sleep(300);
  }
  await app.close();
  assert.deepStrictEqual(errors, []);
  console.log('tamam');
})().catch((e) => { console.error(e); process.exit(1); });
