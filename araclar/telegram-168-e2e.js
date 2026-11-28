#!/usr/bin/env node
// 1.68 / 1.69.1 Telegram «Kayıtlı Mesajlar» → Sham Cash dekontu otomatik kayıt (gerçek Electron, boş veri klasörü, Telegram istemcisi taklit).
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/telegram-168-e2e.js [çıktı-klasörü]
// 1) PDF + altyazı «Ekle» (1.69.1: mesaj «ekle» ile başlar; «şunu da ekle» tetik değildir; «sisteme ekle» de geçerli) → online okuma → Para Girişi 250 USD (ad «benim»), Telegram'a «✅ … eklendi» yanıtı, günlük, orijinal dosya bayt bayt.
// 2) PDF, ardından ayrı mesaj «Sisteme ekle: kira» → online 30 sn sürüyor → 3 sn sonra offline okumayla Para Çıkışı 75 USD, Notum «kira».
// 3) Aynı dekont tekrar → «zaten kayıtlı», ikinci kayıt yok. 4) Dekontsuz eski tetik → «bulunamadı». 5) Yanıtlanmış tetik atlanır.
// 6) Ayarlar kartı (tr / ar), «gözden geçir» listesi; kayıt düzenlenince işaret kalkar.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert'), crypto = require('crypto');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/tmp/telegram-168');
const SAMPLE = path.join(__dirname, 'dekont-ornek');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GIRIS = { kind: 'SEND', ref: '900111222', date: '27/11/2026', time: '14:32:10', from_name: 'Ahmad Khalil', from_account: '************1234',
  to_name: 'Metin Ercan Guler', to_account: '************0951', amount: '250', currency: 'USD', note: '-' };

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-tg168-'));
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  const aiMode = (cfg) => app.evaluate(({ ipcMain }, cfg) => {
    ipcMain.removeHandler('ai:request');
    ipcMain.handle('ai:request', async (_e, req) => {
      if (/models\?/.test(req.url)) return { status: 200, data: { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] } };
      if (cfg.delay) await new Promise((r) => setTimeout(r, cfg.delay));
      return { status: 200, data: { candidates: [{ content: { parts: [{ text: JSON.stringify(cfg.doc) }] } }] } };
    });
  }, cfg);
  const q = (sql, a) => page.evaluate(([sql, a]) => window.falcon.db.all(sql, a || []), [sql, a]);
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(async (ver) => {
    localStorage.setItem('fc.onboarding.done', 'true'); localStorage.setItem('fc.whatsnew.seen', JSON.stringify(ver));
    await window.falcon.settings.set('language', 'tr');
    await window.falcon.settings.set('ai_gemini_key', 'TEST-KEY');
    await window.falcon.settings.set('shamcash_me', JSON.stringify({ names: ['Metin Ercan Guler'], accounts: [] }));
    await window.falcon.call('saveAccount', { id: 1, name: 'Sham Cash USD', opening_balance: 0 });
    localStorage.setItem('tg_api', '123456:0123456789abcdef0123456789abcdef');
    localStorage.setItem('tg_session', 'TEST-SESSION'); localStorage.setItem('tg_user', 'Metin (test)'); localStorage.setItem('tg_wait', '3');
  }, require('../package.json').version);
  // Telegram istemcisi taklidi: Kayıtlı Mesajlar listesi sayfada tutulur
  const fake = (files) => page.evaluate((files) => {
    const b = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    window.__tg = { msgs: [], sent: [], id: 100 };
    const now = () => Math.floor(Date.now() / 1000);
    window.__tgAdd = (o) => { const m = Object.assign({ id: ++window.__tg.id, date: now(), message: '' }, o);
      if (o.file) { const f = files[o.file]; m.media = {}; m.document = { mimeType: 'application/pdf', size: f.length, attributes: [{ fileName: o.file }] }; m.__bytes = b(f); }
      window.__tg.msgs.push(m); return m.id; };
    const client = { connected: true, connect: async () => {}, checkAuthorization: async () => true, addEventHandler() {},
      getMessages: async (_p, o) => window.__tg.msgs.slice().sort((x, y) => y.id - x.id).slice(0, o.limit),
      downloadMedia: async (m) => m.__bytes,
      sendMessage: async (_p, o) => { window.__tg.sent.push(o); window.__tgAdd({ message: o.message, replyTo: { replyToMsgId: o.replyTo } }); } };
    window.FalconGram = { Api: {}, NewMessage: function () {} };
    window.FalconTelegram._test.setClient(client);
  }, files);
  const files = {}; for (const f of ['sham-giris.pdf', 'sham-cikis.pdf']) files[f] = fs.readFileSync(path.join(SAMPLE, f)).toString('base64');
  await page.reload(); await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.addStyleTag({ content: '.aduy-ort{display:none!important}' });
  await fake(files);

  // 1) PDF + altyazı
  await aiMode({ doc: GIRIS });
  const m1 = await page.evaluate(() => window.__tgAdd({ file: 'sham-giris.pdf', message: 'Ekle' }));
  await page.evaluate(() => window.FalconTelegram.scan(true));
  let tx = await q("SELECT id, direction, amount, sc_ref, sc_name, description, json_extract(sc_doc,'$.file_path') AS fp FROM cash_transactions WHERE sc_ref IS NOT NULL ORDER BY id");
  console.log('1)', JSON.stringify(tx));
  assert.strictEqual(tx.length, 1); assert.strictEqual(tx[0].direction, 'in'); assert.strictEqual(tx[0].amount, 250); assert.strictEqual(tx[0].sc_ref, '900111222');
  assert.strictEqual(tx[0].sc_name, 'Ahmad Khalil'); assert.strictEqual(tx[0].description, '📨 Telegram');
  const rec = await q('SELECT file_path FROM receipts WHERE transaction_id = ?', [tx[0].id]);
  const stored = fs.readFileSync(path.join(ud, 'data', 'files', rec[0].file_path));
  assert.strictEqual(crypto.createHash('sha256').update(stored).digest('hex'), crypto.createHash('sha256').update(fs.readFileSync(path.join(SAMPLE, 'sham-giris.pdf'))).digest('hex'), 'orijinal bayt bayt');
  let sent = await page.evaluate(() => window.__tg.sent);
  console.log('   yanıt:', JSON.stringify(sent[0]));
  assert.strictEqual(sent[0].replyTo, m1); assert.ok(/^🦅 Falcon Ofis: ✅ Para Girişi eklendi · 250 USD · Sham Cash USD · #900111222/.test(sent[0].message), sent[0].message);

  // 2) PDF sonra ayrı tetik + not; online yavaş → offline ile
  await aiMode({ doc: Object.assign({}, GIRIS, { ref: '900111333', amount: '75', from_name: 'Metin Ercan Guler', to_name: 'Omar Saleh' }), delay: 30000 });
  await page.evaluate(() => { window.__tgAdd({ message: 'şunu da ekle' }); window.__tgAdd({ file: 'sham-cikis.pdf' }); window.__tgAdd({ message: 'ekle: kira' }); });
  let t0 = Date.now();
  await page.evaluate(() => window.FalconTelegram.scan(true));
  const d2 = Date.now() - t0;
  tx = await q("SELECT id, direction, amount, sc_ref, sc_note, json_extract(sc_doc,'$.read_by') AS rb FROM cash_transactions WHERE sc_ref = '900111333'");
  console.log('2)', d2, 'ms', JSON.stringify(tx));
  assert.strictEqual(tx.length, 1); assert.strictEqual(tx[0].direction, 'out'); assert.strictEqual(tx[0].amount, 75); assert.strictEqual(tx[0].sc_note, 'kira');
  assert.ok(/^offline/.test(tx[0].rb), 'offline okumayla: ' + tx[0].rb); assert.ok(d2 < 20000, 'beklemedi');
  sent = await page.evaluate(() => window.__tg.sent);
  assert.ok(/Para Çıkışı eklendi · 75 USD/.test(sent[1].message) && /offline/.test(sent[1].message), sent[1].message);

  // 3) aynı dekont tekrar
  await aiMode({ doc: GIRIS });
  await page.evaluate(() => window.__tgAdd({ file: 'sham-giris.pdf', message: 'sisteme ekle' }));
  await page.evaluate(() => window.FalconTelegram.scan(true));
  assert.strictEqual((await q("SELECT id FROM cash_transactions WHERE sc_ref = '900111222'")).length, 1, 'kopya yok');
  sent = await page.evaluate(() => window.__tg.sent);
  assert.ok(/zaten kayıtlı \(#900111222\)/.test(sent[2].message), sent[2].message);

  // 4) dekontsuz eski tetik; 5) yanıtlanmış tetik ve sıradan mesaj atlanır
  await page.evaluate(() => { window.__tgAdd({ message: 'merhaba' }); window.__tgAdd({ message: 'sisteme ekle', date: Math.floor(Date.now() / 1000) - 600 }); });
  await page.evaluate(() => window.FalconTelegram.scan(true));
  await page.evaluate(() => window.FalconTelegram.scan(true));
  sent = await page.evaluate(() => window.__tg.sent);
  assert.strictEqual(sent.length, 4, 'tek «bulunamadı» yanıtı: ' + sent.length); assert.ok(/bulunamadı/.test(sent[3].message));
  // başka cihazın yanıtladığı tetik (yerel işlenmiş listesi boş olsa da) atlanır
  await page.evaluate(() => { localStorage.removeItem('tg_done'); });
  await page.evaluate(() => window.FalconTelegram.scan(true));
  assert.strictEqual((await page.evaluate(() => window.__tg.sent)).length, 4, 'yanıtlı tetikler tekrar işlenmedi');
  assert.strictEqual((await q("SELECT id FROM cash_transactions WHERE sc_ref IS NOT NULL")).length, 2);

  // 6) Ayarlar kartı
  await page.evaluate(() => { location.hash = '#/settings'; }); await sleep(2000);
  await page.locator('.tgf-kart').waitFor({ timeout: 15000 });
  await page.locator('.tgf-kart .tgf-it').first().waitFor({ timeout: 10000 });
  const txt = await page.locator('.tgf-kart').textContent();
  assert.ok(/Telegram → Sham Cash dekontu/.test(txt) && /Bağlı: Metin \(test\)/.test(txt) && /Para Girişi · 250/.test(txt) && /Metin Ercan Guler/.test(txt), txt.slice(0, 400));
  const order = await page.evaluate(() => { const g = document.querySelector('.settings-grid'); return g ? g.lastElementChild.id : ''; });
  assert.strictEqual(order, 'fo-contact', 'Admin ile iletişim en sonda');
  await page.locator('.tgf-kart').scrollIntoViewIfNeeded();
  await page.locator('.tgf-kart').screenshot({ path: path.join(OUT, 'tr-kart.png') });
  // «gözden geçir»: notfound kaydı işaretli; ✓ ile kalkar
  let rv = await page.locator('.tgf-kart .tgf-it.rv').count();
  assert.ok(rv >= 1, 'gözden geçir satırı');
  await page.locator('.tgf-kart .tgf-it.rv button', { hasText: 'Gözden geçirdim' }).first().click(); await sleep(800);
  assert.strictEqual(await page.locator('.tgf-kart .tgf-it.rv').count(), rv - 1);
  // ar
  await page.evaluate(async () => { await window.falcon.settings.set('language', 'ar'); });
  await page.reload(); await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.addStyleTag({ content: '.aduy-ort{display:none!important}' });
  await page.evaluate(() => { location.hash = '#/settings'; }); await sleep(2500);
  await page.locator('.tgf-kart .tgf-it').first().waitFor({ timeout: 15000 });
  const ar = await page.locator('.tgf-kart').textContent();
  assert.ok(/تيليغرام/.test(ar) && /إدخال نقدية/.test(ar), ar.slice(0, 200));
  assert.strictEqual(await page.locator('.tgf-kart').getAttribute('dir'), 'rtl');
  await page.locator('.tgf-kart').scrollIntoViewIfNeeded();
  await page.locator('.tgf-kart').screenshot({ path: path.join(OUT, 'ar-kart.png') });
  // bağlı değilken: «Telegram'a bağlan» → numara alanı
  await page.evaluate(() => { localStorage.removeItem('tg_session'); });
  await page.reload(); await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(async () => { await window.falcon.settings.set('language', 'tr'); });
  await page.reload(); await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.addStyleTag({ content: '.aduy-ort{display:none!important}' });
  await page.evaluate(() => { location.hash = '#/settings'; }); await sleep(2500);
  await page.locator('.tgf-kart button', { hasText: "Telegram'a bağlan" }).click();
  await page.locator('.tgf-kart input[type=tel]').waitFor();
  await page.locator('.tgf-kart').screenshot({ path: path.join(OUT, 'tr-baglan.png') });

  const bad = errors.filter((e) => !/ResizeObserver/.test(e));
  assert.deepStrictEqual(bad, [], 'sayfa hatası: ' + bad.join(' | '));
  await app.close();
  console.log('TAMAM telegram-168', OUT);
})().catch((e) => { console.error('HATA', e); process.exit(1); });
