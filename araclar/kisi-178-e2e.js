#!/usr/bin/env node
// v1.78 uçtan uca: Kişi formunda program başına numara + @kullanıcı adı (alt alta), kayıt, liste ipucu, arama, aç/kapa simgesinin bilgiyi korunması.
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/kisi-178-e2e.js <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-178');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-178-'));
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
  }, require('../package.json').version);
  await page.reload();
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
  await page.evaluate(() => { location.hash = '#/people'; });
  await page.click('button:has-text("Yeni kişi")');
  await page.waitForSelector('.fo-reach', { timeout: 10000 });
  const row = (label) => page.locator('.fo-reach-row', { has: page.locator('span', { hasText: label }) }).first();
  await page.fill('.modal input[required]', 'Nuh');
  await page.locator('.modal .field', { has: page.locator('.field-label', { hasText: /^Telefon/ }) }).first().locator('input').fill('+90 555 000 00 00');
  await row('WhatsApp').locator('.fo-reach-no').fill('+963 944 111 222');
  await row('Telegram').locator('.fo-reach-user').fill('nuh_falcon');
  await row('Telegram').locator('.fo-reach-user').blur();
  await row('Signal').locator('.fo-reach-no').fill('+49 151 2345');
  await row('Signal').locator('.fo-reach-user').fill('@nuh.42');
  assert.strictEqual(await row('Telegram').locator('.fo-reach-user').inputValue(), '@nuh_falcon', '@ kendiliğinden eklenir');
  assert.strictEqual(await row('Normal arama').locator('.fo-reach-user').count(), 0, 'normal aramada kullanıcı adı yok');
  await page.screenshot({ path: path.join(OUT, '1-yeni-kisi.png') });
  await page.click('.modal .modal-footer button:has-text("Kaydet")');
  await sleep(1000);
  const p = (await q("SELECT contacts FROM people WHERE name = 'Nuh'"))[0];
  const c = JSON.parse(p.contacts);
  assert.deepStrictEqual(c, { whatsapp: 1, telegram: 1, signal: 1, _d: { whatsapp: { no: '+963 944 111 222' }, telegram: { user: '@nuh_falcon' }, signal: { no: '+49 151 2345', user: '@nuh.42' } } }, JSON.stringify(c));
  // listede simgeyi kapat / aç: programa özel bilgiler kaybolmaz
  const tg = page.locator('table .contact-icons button[title^="Telegram"]').first();
  assert.ok(/@nuh_falcon/.test(await tg.getAttribute('title')), 'ipucunda @kullanıcı adı');
  await tg.click(); await sleep(500);
  let c2 = JSON.parse((await q("SELECT contacts FROM people WHERE name = 'Nuh'"))[0].contacts);
  assert.ok(!c2.telegram && c2._d.telegram.user === '@nuh_falcon', 'kapatınca bilgi korunur');
  await tg.click(); await sleep(500);
  // arama: programa özel numara ve kullanıcı adıyla bulunur
  await page.fill('.search input', 'nuh.42'); await sleep(500);
  assert.ok(await page.isVisible('table td strong:has-text("Nuh")'), 'kullanıcı adıyla arama');
  await page.fill('.search input', '944 111'); await sleep(500);
  assert.ok(await page.isVisible('table td strong:has-text("Nuh")'), 'WhatsApp numarasıyla arama');
  await page.fill('.search input', '');
  // düzenle: alanlar dolu gelir
  await page.locator('table tr', { hasText: 'Nuh' }).locator('button.icon-btn').nth(1).click();
  await page.waitForSelector('.fo-reach', { timeout: 10000 });
  assert.strictEqual(await row('WhatsApp').locator('.fo-reach-no').inputValue(), '+963 944 111 222');
  await page.screenshot({ path: path.join(OUT, '2-duzenle.png') });
  // Arapça: alan yer tutucuları
  await page.click('.modal .modal-footer button:has-text("İptal")').catch(() => {});
  assert.deepStrictEqual(errors, [], 'sayfa hataları');
  await app.close();
  console.log('kisi-178-e2e: TAMAM');
})().catch((e) => { console.error(e); process.exit(1); });
