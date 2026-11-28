#!/usr/bin/env node
// 1.67.2 Sham Cash dekont okuma hızı (gerçek Electron, boş veri klasörü).
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/dekont-1672-e2e.js [çıktı-klasörü]
// Yapay zekâ (Gemini) ana süreçte taklit edilir; her isteğin gövdesi ve süresi kaydedilir.
// 1) Hızlı online: istek «düşünme kapalı» (thinkingConfig) ve 25 sn süreyle gider; okuma sırasında saniyeli iki durum yazısı; alanlar dolar.
// 2) Model düşünme ayarını kabul etmez (400) → aynı model thinkingBudget ile, sonra ayarsız denenir; çalışan biçim hatırlanır.
// 3) İlk model meşgul (429) → beklemeden sıradaki model.
// 4) Online yavaş (8 sn): offline biter → «⏭ Beklemeden doldur» → alanlar offline okumayla hemen dolar («online arkada sürüyor»);
//    online sonra gelir → okuma tablosu «teyit» olur, alanlar değişmez; Kaydet ile kayıt.
// 5) en / ar durum metinleri.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/tmp/dekont-1672');
const SAMPLE = path.join(__dirname, 'dekont-ornek');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DOC = { kind: 'SEND', ref: '900111333', date: '28/11/2026', time: '09:05:00', from_name: 'Kerem Aydin', from_account: '************3311',
  to_name: 'Omar Saleh', to_account: '************7788', amount: '75', currency: 'USD', note: '-', generated: '28/11/2026' };

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-dekont1672-'));
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  const pickFile = (p) => app.evaluate(({ dialog }, p) => { dialog.showOpenDialogSync = () => [p]; }, p);
  // cfg: { delay, models: [..], fail: { <model>: status }, rejectThinking: bool }
  const aiMode = (cfg) => app.evaluate(({ ipcMain }, cfg) => {
    globalThis.__aiLog = [];
    ipcMain.removeHandler('ai:request');
    ipcMain.handle('ai:request', async (_e, req) => {
      const m = /models\/([^:]+):generateContent/.exec(req.url);
      globalThis.__aiLog.push({ url: req.url, model: m ? decodeURIComponent(m[1]) : null, timeout: req.timeout, gen: req.body && req.body.generationConfig, t: Date.now() });
      if (/models\?/.test(req.url)) return { status: 200, data: { models: (cfg.models || ['gemini-3.8-flash']).map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) } };
      const model = m && decodeURIComponent(m[1]);
      if (cfg.fail && cfg.fail[model]) return { status: cfg.fail[model], data: { error: { message: 'busy' } } };
      const tc = req.body.generationConfig.thinkingConfig;
      if (cfg.rejectThinking && tc && (tc.thinkingLevel || cfg.rejectThinking === 'all')) return { status: 400, data: { error: { code: 400, message: 'Invalid value at generation_config.thinking_config', status: 'INVALID_ARGUMENT' } } };
      if (cfg.delay) await new Promise((r) => setTimeout(r, cfg.delay));
      return { status: 200, data: { candidates: [{ content: { parts: [{ text: JSON.stringify(cfg.doc) }] } }] } };
    });
  }, cfg);
  const aiLog = () => app.evaluate(() => globalThis.__aiLog || []);
  const q = (sql, a) => page.evaluate(([sql, a]) => window.falcon.db.all(sql, a || []), [sql, a]);
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(async (ver) => {
    localStorage.setItem('fc.onboarding.done', 'true'); localStorage.setItem('fc.whatsnew.seen', JSON.stringify(ver));
    await window.falcon.settings.set('language', 'tr');
    await window.falcon.settings.set('ai_gemini_key', 'TEST-KEY');
    await window.falcon.call('saveAccount', { id: 1, name: 'Sham Cash USD', opening_balance: 0 });
  }, require('../package.json').version);
  const home = async (clear) => {
    if (clear) await page.evaluate(() => { localStorage.removeItem('sc_ai_models'); localStorage.removeItem('sc_ai_think'); });
    await page.reload(); await page.waitForSelector('.topbar-actions', { timeout: 30000 });
    await page.addStyleTag({ content: '.aduy-ort{display:none!important}' });
    await page.evaluate(() => { location.hash = '#/cash'; }); await sleep(1500);
  };
  const dlg = page.locator('.modal').last();
  const inputs = () => dlg.evaluate((d) => [...d.querySelectorAll('input')].map((i) => i.value));
  const save = async () => { await dlg.locator('button:visible', { hasText: /^(Kaydet|Save|حفظ)$/ }).last().click(); await dlg.waitFor({ state: 'detached', timeout: 15000 }); };
  const cancel = async () => {
    await dlg.locator('button:visible', { hasText: /^(İptal|Vazgeç|Cancel|إلغاء)$/ }).last().click().catch(() => page.keyboard.press('Escape'));
    await dlg.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  };
  const open = async (btn, file) => {
    await page.getByRole('button', { name: btn }).first().click();
    await dlg.waitFor();
    await pickFile(path.join(SAMPLE, file || 'sham-cikis.pdf'));
  };
  // okuma sırasında görülen durum yazıları
  const watch = () => page.evaluate(() => {
    window.__st = [];
    const tk = setInterval(() => { const b = document.querySelector('.modal .sc-attach-btn'); if (b && b.disabled) { const x = b.textContent; if (window.__st[window.__st.length - 1] !== x) window.__st.push(x); } }, 100);
    window.__stStop = () => clearInterval(tk);
  });
  const seen = () => page.evaluate(() => { window.__stStop && window.__stStop(); return window.__st || []; });

  // 1) hızlı online, düşünme kapalı
  await home(true);
  await aiMode({ doc: DOC, delay: 700, models: ['gemini-3.8-flash', 'gemini-3.6-pro'] });
  await open('Para Çıkışı');
  await sleep(2500); // form açıldı: OCR işçileri önceden hazırlanıyor
  await watch();
  let t0 = Date.now();
  await dlg.locator('.sc-attach-btn').click();
  await dlg.locator('.sc-read').waitFor({ timeout: 60000 });
  const d1 = Date.now() - t0;
  const st1 = await seen();
  console.log('1) süre', d1, 'ms | durumlar:', st1.slice(0, 4).join(' | '));
  assert.ok(st1.some((x) => /🌐 Online: \d+ sn/.test(x) && /📴 Offline teyit: \d+ sn/.test(x)), 'saniyeli iki durum: ' + st1);
  let log = (await aiLog()).filter((x) => x.model);
  assert.strictEqual(log[0].model, 'gemini-3.8-flash');
  assert.deepStrictEqual(log[0].gen.thinkingConfig, { thinkingLevel: 'minimal' }, 'düşünme kapalı');
  assert.strictEqual(log[0].timeout, 25000, 'istek süresi 25 sn');
  let v = await inputs();
  assert.ok(v.includes('75') && v.includes('900111333') && v.includes('Omar Saleh'), 'alanlar ' + v);
  await page.screenshot({ path: path.join(OUT, 'tr-1-hizli.png') });
  await cancel();

  // 2) düşünme ayarı reddedilir → thinkingBudget → ayarsız; hatırlanır
  await home(true);
  await aiMode({ doc: DOC, rejectThinking: 'all', models: ['gemini-3.8-flash'] });
  await open('Para Çıkışı');
  await dlg.locator('.sc-attach-btn').click();
  await dlg.locator('.sc-read').waitFor({ timeout: 60000 });
  log = (await aiLog()).filter((x) => x.model);
  assert.deepStrictEqual(log.map((x) => JSON.stringify(x.gen.thinkingConfig || null)), ['{"thinkingLevel":"minimal"}', '{"thinkingBudget":0}', 'null'], 'biçim sırası');
  assert.ok((await inputs()).includes('900111333'), '400 sonrası okundu');
  const memo = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_ai_think') || '{}'));
  assert.strictEqual(memo['gemini-3.8-flash'], 2, 'çalışan biçim hatırlandı');
  await cancel();

  // 3) ilk model meşgul (429) → hemen sıradaki
  await home(true);
  await aiMode({ doc: DOC, models: ['gemini-3.8-flash', 'gemini-3.6-flash'], fail: { 'gemini-3.8-flash': 429 } });
  await open('Para Çıkışı');
  t0 = Date.now();
  await dlg.locator('.sc-attach-btn').click();
  await dlg.locator('.sc-read').waitFor({ timeout: 60000 });
  log = (await aiLog()).filter((x) => x.model);
  assert.deepStrictEqual(log.map((x) => x.model), ['gemini-3.8-flash', 'gemini-3.6-flash'], '429 → sıradaki model');
  const msg3 = await dlg.locator('.sc-read .sc-msg').first().textContent();
  assert.ok(/Online okundu/.test(msg3), msg3);
  console.log('3) 429 sonrası süre', Date.now() - t0, 'ms');
  await cancel();

  // 4) online yavaş: «Beklemeden doldur» offline okumayla; online arkadan gelir
  await home(false);
  await aiMode({ doc: DOC, delay: 9000, models: ['gemini-3.8-flash'] });
  await open('Para Çıkışı');
  t0 = Date.now();
  await dlg.locator('.sc-attach-btn').click();
  await dlg.locator('.sc-skip').waitFor({ timeout: 8500 });
  await page.screenshot({ path: path.join(OUT, 'tr-4-beklemeden.png') });
  await dlg.locator('.sc-skip').click();
  await dlg.locator('.sc-read').waitFor({ timeout: 5000 });
  const d4 = Date.now() - t0;
  const msg4 = await dlg.locator('.sc-read .sc-msg').first().textContent();
  console.log('4) beklemeden doldur:', d4, 'ms |', msg4);
  assert.ok(d4 < 9000, 'online beklenmedi');
  assert.ok(/online okuma arkada sürüyor/.test(msg4), msg4);
  v = await inputs();
  assert.ok(v.includes('75') && v.includes('900111333'), 'offline alanlar ' + v);
  await dlg.locator('.sc-read .sc-msg', { hasText: /teyit|farklı/ }).first().waitFor({ timeout: 15000 });
  const msg4b = await dlg.locator('.sc-read .sc-msg').first().textContent();
  console.log('4) arkadan online:', msg4b);
  assert.ok(/Online okundu/.test(msg4b), 'online sonucu tabloya eklendi');
  assert.ok(await dlg.locator('.sc-read .st-ok').count() >= 3, 'teyitli satırlar');
  const v4 = await inputs();
  assert.deepStrictEqual(v4, v, 'arkadan gelen okuma alanları değiştirmedi');
  await page.screenshot({ path: path.join(OUT, 'tr-4-arkadan-online.png') });
  await save();
  const tx = (await q("SELECT * FROM cash_transactions WHERE sc_ref = '900111333'"))[0];
  assert.ok(tx && tx.amount === 75, 'kayıt');
  assert.ok(/^both:/.test(JSON.parse(tx.sc_doc).read_by), 'read_by both: ' + JSON.parse(tx.sc_doc).read_by);

  // 5) en / ar durum metinleri
  await aiMode({ doc: Object.assign({}, DOC, { ref: '900111334' }), delay: 2500, models: ['gemini-3.8-flash'] });
  for (const lg of ['en', 'ar']) {
    await page.evaluate((lg) => window.falcon.settings.set('language', lg), lg);
    await home(false);
    await open({ en: 'Cash Out', ar: 'إخراج أموال' }[lg]);
    await watch();
    await dlg.locator('.sc-attach-btn').click();
    await dlg.locator('.sc-read').waitFor({ timeout: 60000 });
    const st5 = await seen();
    assert.ok(st5.some((x) => lg === 'en' ? /Online: \d+ s/.test(x) : /عبر الإنترنت: \d+ ث/.test(x)), lg + ' durum: ' + st5);
    assert.ok(!st5.join('').match(/[ğüşıİ]| sn/), lg + ': Türkçe karışmadı');
    await page.screenshot({ path: path.join(OUT, lg + '-okundu.png') });
    await cancel();
  }

  const bad = errors.filter((e) => !/ResizeObserver/.test(e));
  assert.deepStrictEqual(bad, [], 'sayfa hatası yok');
  await app.close();
  console.log('dekont-1672 e2e: TAMAM →', OUT);
})().catch(async (e) => { console.error('HATA:', e && e.stack || e); process.exit(1); });
