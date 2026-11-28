#!/usr/bin/env node
// 1.67.1 Para Girişi / Çıkışı: Sham Cash dekontundan otomatik doldurma + onay (gerçek Electron, boş veri klasörü).
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/dekont-1671-e2e.js [çıktı-klasörü]
// Yapay zekâ (Gemini) ana süreçte taklit edilir: ai:request → hazır yanıt ya da «internet yok».
// 1) Para Çıkışı + GÖRÜNTÜ TABANLI dekont (yazı katmanı yok): online okundu + offline teyit; farklı alanlar seçilebilir; SEND → Çıkış;
//    tutar / tarih / kasa / alıcı (Arapça aynen) / hesap / işlem no / Kişiler doldu; vurgu; kayıt yalnız Kaydet ile; saat sc_doc'ta; orijinal bayt bayt
// 2) Para Girişi + SEND dekontu → Tür Çıkış yapılır, uyarı görünür; İptal → hiçbir şey yazılmaz
// 3) İnternet yok + SÜRÜKLE-BIRAK → yalnız offline okuma, «internet yok» bildirimi; kayıt
// 4) «Fişten oku» Sham Cash dekontunu tanır ve aynı yoldan doldurur  5) tr / en / ar ekranları
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto'), assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/tmp/dekont-1671');
const SAMPLE = path.join(__dirname, 'dekont-ornek');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// sham-goruntu.pdf'in doğru değerleri (yapay zekâ yanıtı)
const AI_DOC = { kind: 'SEND', ref: '612340987', date: '28/11/2026', time: '10:15:20', from_name: 'متن ارجن جولر', from_account: '************0951',
  to_name: 'سامر خليل فخر الدين', to_account: '************4455', amount: '120', currency: 'USD', note: '-', generated: '28/11/2026' };

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-dekont1671-'));
  if (process.env.YZ_PAKET) fs.cpSync(process.env.YZ_PAKET, path.join(ud, 'yerel-zeka'), { recursive: true }); // 1.70: çevrimdışı yapay zekâ kurulu deneme
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  const pickFile = (p) => app.evaluate(({ dialog }, p) => { dialog.showOpenDialogSync = () => [p]; }, p);
  // mode: 'ok' (AI_DOC) | 'net' (internet yok)
  const aiMode = (mode, doc) => app.evaluate(({ ipcMain }, [mode, doc]) => {
    ipcMain.removeHandler('ai:request');
    ipcMain.handle('ai:request', async (_e, req) => {
      if (mode === 'net') return { status: 0, data: null, error: 'net::ERR_INTERNET_DISCONNECTED' };
      if (/models\?/.test(req.url)) return { status: 200, data: { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] } };
      return { status: 200, data: { candidates: [{ content: { parts: [{ text: JSON.stringify(doc) }] } }] } };
    });
  }, [mode, doc || AI_DOC]);
  const q = (sql, a) => page.evaluate(([sql, a]) => window.falcon.db.all(sql, a || []), [sql, a]);
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.addStyleTag({ content: '.aduy-ort{display:none!important}' });
  await page.evaluate(async (ver) => {
    localStorage.setItem('fc.onboarding.done', 'true'); localStorage.setItem('fc.whatsnew.seen', JSON.stringify(ver));
    await window.falcon.settings.set('language', 'tr');
    await window.falcon.settings.set('ai_gemini_key', 'TEST-KEY');
    await window.falcon.call('saveAccount', { id: 1, name: 'Sham Cash USD', opening_balance: 0 });
  }, require('../package.json').version);
  const home = async () => {
    await page.reload(); await page.waitForSelector('.topbar-actions', { timeout: 30000 });
    await page.addStyleTag({ content: '.aduy-ort{display:none!important}' });
    await page.evaluate(() => { location.hash = '#/cash'; }); await sleep(1500);
  };
  await home();
  const dlg = page.locator('.modal').last();
  const accName = () => dlg.locator('select').first().evaluate((s) => s.options[s.selectedIndex].textContent);
  const inputs = () => dlg.evaluate((d) => [...d.querySelectorAll('input')].map((i) => i.value));
  const save = async () => { await dlg.locator('button:visible', { hasText: /^(Kaydet|Save|حفظ)$/ }).last().click(); await dlg.waitFor({ state: 'detached', timeout: 15000 }); };
  const cancel = async () => {
    await dlg.locator('button:visible', { hasText: /^(İptal|Vazgeç|Cancel|إلغاء)$/ }).last().click().catch(() => page.keyboard.press('Escape'));
    await dlg.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  };
  const dirActive = () => dlg.locator('.segmented button.active').first().getAttribute('class');

  // 1) Para Çıkışı + görüntü tabanlı dekont, online + offline teyit
  await aiMode('ok');
  await page.getByRole('button', { name: 'Para Çıkışı' }).first().click();
  await dlg.waitFor();
  assert.ok(await dlg.locator('.sc-drop-hint').count(), 'sürükle-bırak ipucu');
  await pickFile(path.join(SAMPLE, 'sham-goruntu.pdf'));
  await dlg.locator('.sc-attach-btn').click();
  await dlg.locator('.sc-read').waitFor({ timeout: 90000 });
  // 1.67.2: offline teyit online sonuçtan sonra arkadan gelebilir — bitmesi beklenir
  await page.waitForFunction(() => { const m = document.querySelector('.modal .sc-read .sc-msg'); return m && !/arkada sürüyor/.test(m.textContent); }, null, { timeout: 90000 });
  await sleep(400);
  const msg1 = await dlg.locator('.sc-read .sc-msg').first().textContent();
  assert.ok(/Online okundu/.test(msg1), 'okuma yöntemi yazıyor: ' + msg1);
  const rowTxt = await dlg.locator('.sc-read table').textContent();
  assert.ok(/SEND → Çıkış/.test(rowTxt), 'tür satırı ' + rowTxt);
  assert.ok(/10:15:20/.test(rowTxt), 'saat gösteriliyor');
  // offline okuma (normal yazı tipiyle üretilmiş örnekte) bazı rakamları farklı okur → seçim düğmeleri
  const diffs = await dlg.locator('.sc-read .st-diff').count();
  const oks = await dlg.locator('.sc-read .st-ok').count();
  console.log('farklı alan:', diffs, 'teyitli alan:', oks, '|', msg1);
  assert.ok(oks >= 4, 'teyitli alanlar var');
  let v = await inputs();
  assert.ok(v.includes('120'), 'tutar ' + v);
  assert.ok(v.includes('2026-11-28'), 'tarih');
  assert.ok(v.includes('سامر خليل فخر الدين'), 'alıcı adı Arapça aynen');
  assert.ok(v.includes('************4455'), 'alıcı hesabı');
  assert.ok(v.includes('612340987'), 'işlem no (online)');
  assert.strictEqual(await accName(), 'Sham Cash USD (USD)', 'kasa');
  assert.ok(/out/.test(await dirActive()), 'SEND → Çıkış');
  assert.ok(await dlg.locator('.sc-filled').count() >= 3, 'doldurulan alanlar vurgulu');
  if (await dlg.locator('.sc-row-ref .sc-ch-off').count()) {
    await dlg.locator('.sc-row-ref .sc-ch-off').click(); await sleep(300);
    v = await inputs(); assert.ok(!v.includes('612340987'), 'offline değer seçildi');
    await dlg.locator('.sc-row-ref .sc-ch-ai').click(); await sleep(300);
    v = await inputs(); assert.ok(v.includes('612340987'), 'online değere dönüldü');
  }
  await page.screenshot({ path: path.join(OUT, 'tr-1-cikis-okundu.png') });
  // onay beklenir: Kaydet'e basılmadan kayıt yok
  assert.strictEqual((await q("SELECT id FROM cash_transactions WHERE sc_ref = '612340987'")).length, 0, 'kendiliğinden kaydedilmedi');
  await save();
  let tx = (await q("SELECT * FROM cash_transactions WHERE sc_ref = '612340987'"))[0];
  assert.ok(tx, 'Kaydet ile eklendi');
  assert.strictEqual(tx.direction, 'out'); assert.strictEqual(tx.amount, 120); assert.strictEqual(tx.account_id, 1); assert.strictEqual(tx.pay_method, 'shamcash');
  assert.strictEqual(tx.sc_name, 'سامر خليل فخر الدين');
  let doc = JSON.parse(tx.sc_doc);
  assert.strictEqual(doc.time, '10:15:20'); assert.strictEqual(doc.from_name, 'متن ارجن جولر'); assert.strictEqual(doc.ref, '612340987');
  const people = await q('SELECT p.name FROM cash_tx_people x JOIN people p ON p.id = x.person_id WHERE x.transaction_id = ?', [tx.id]).catch(() => []);
  console.log('kişiler:', JSON.stringify(people), 'person:', tx.person_name || tx.person_id);
  const rc = await q('SELECT * FROM receipts WHERE transaction_id = ?', [tx.id]);
  assert.strictEqual(rc.length, 1, 'dekont kayda bağlı');
  const dataDir = await page.evaluate(() => window.FalconCore && window.FalconCore.info ? window.FalconCore.info().dataDir : null);
  const cand = [dataDir, ud].filter(Boolean).map((d) => [path.join(d, 'files', rc[0].file_path), path.join(d, rc[0].file_path)]).flat().find((p) => fs.existsSync(p));
  if (cand) assert.strictEqual(sha(cand), sha(path.join(SAMPLE, 'sham-goruntu.pdf')), 'orijinal bayt bayt');

  // 2) Para Girişi + SEND dekontu (yön bilinmiyor) → Çıkış + uyarı; İptal → kayıt yok
  await aiMode('ok', { kind: 'SEND', ref: '900111333', date: '28/11/2026', time: '09:05:00', from_name: 'Kerem Aydin', from_account: '************3311', to_name: 'Omar Saleh', to_account: '************7788', amount: '75', currency: 'USD', note: 'kira' });
  await page.getByRole('button', { name: 'Para Girişi' }).first().click();
  await dlg.waitFor();
  await pickFile(path.join(SAMPLE, 'sham-cikis.pdf'));
  await dlg.locator('.sc-attach-btn').click();
  await dlg.locator('.sc-read').waitFor({ timeout: 60000 });
  const all2 = await dlg.locator('.sc-read').textContent();
  assert.ok(/SEND: Tür «Çıkış» yapıldı/.test(all2), 'yön uyarısı ' + all2);
  assert.ok(/out/.test(await dirActive()), 'Tür Çıkış yapıldı');
  v = await inputs();
  assert.ok(v.includes('kira'), 'dekont notu → Sham Cash notu');
  await page.screenshot({ path: path.join(OUT, 'tr-2-giris-send-uyari.png') });
  await cancel();
  assert.strictEqual((await q("SELECT id FROM cash_transactions WHERE sc_ref = '900111333'")).length, 0, 'İptal: hiçbir şey yazılmadı');

  // 3) İnternet yok + sürükle-bırak → yalnız offline
  await aiMode('net');
  await page.getByRole('button', { name: 'Para Girişi' }).first().click();
  await dlg.waitFor();
  const bytes = [...fs.readFileSync(path.join(SAMPLE, 'sham-giris.pdf'))];
  await dlg.evaluate((d, b) => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(b)], 'sham_cash_receipt_20261127_143210.pdf', { type: 'application/pdf' }));
    d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, bytes);
  await dlg.locator('.sc-read').waitFor({ timeout: 60000 });
  const msg3 = await dlg.locator('.sc-read .sc-msg').first().textContent();
  assert.ok(/İnternet yok: offline okundu/.test(msg3), 'offline bildirimi: ' + msg3);
  v = await inputs();
  assert.ok(v.includes('250') && v.includes('900111222') && v.includes('Ahmad Khalil'), 'offline alanlar ' + v);
  await page.screenshot({ path: path.join(OUT, 'tr-3-surukle-offline.png') });
  await save();
  tx = (await q("SELECT * FROM cash_transactions WHERE sc_ref = '900111222'"))[0];
  assert.ok(tx && tx.amount === 250, 'sürükle-bırak kaydı');
  const rc3 = await q('SELECT * FROM receipts WHERE transaction_id = ?', [tx.id]);
  assert.strictEqual(rc3.length, 1, 'bırakılan dosya kayda bağlı');

  // 4) «Fişten oku» Sham Cash dekontunu tanır
  await aiMode('net');
  await page.getByRole('button', { name: 'Para Çıkışı' }).first().click();
  await dlg.waitFor();
  await pickFile(path.join(SAMPLE, 'sham-cikis.pdf'));
  await dlg.locator('.fx-ocr-btn').click();
  await dlg.locator('.sc-read').waitFor({ timeout: 60000 });
  v = await inputs();
  assert.ok(v.includes('900111333') && v.includes('75') && v.includes('Omar Saleh'), 'Fişten oku → Sham Cash ' + v);
  await page.screenshot({ path: path.join(OUT, 'tr-4-fisten-oku.png') });
  await cancel();

  // 5) en / ar
  await aiMode('ok', { kind: 'SEND', ref: '900111333', date: '28/11/2026', time: '09:05:00', from_name: 'Kerem Aydin', from_account: '************3311', to_name: 'Omar Saleh', to_account: '************7788', amount: '75', currency: 'USD', note: '-' });
  for (const lg of ['en', 'ar']) {
    await page.evaluate((lg) => window.falcon.settings.set('language', lg), lg);
    await home();
    await page.getByRole('button', { name: { en: 'Cash Out', ar: 'إخراج أموال' }[lg] }).first().click();
    await dlg.waitFor();
    await pickFile(path.join(SAMPLE, 'sham-cikis.pdf'));
    await dlg.locator('.sc-attach-btn').click();
    await dlg.locator('.sc-read').waitFor({ timeout: 60000 });
    const tx5 = await dlg.locator('.sc-read').textContent();
    assert.ok(lg === 'en' ? /Read online/.test(tx5) : /قُرئ عبر الإنترنت/.test(tx5), lg + ' metni');
    assert.ok(!/[ğüşıİ]/.test(tx5), lg + ': Türkçe karışmadı');
    await page.screenshot({ path: path.join(OUT, lg + '-cikis-okundu.png') });
    await cancel();
  }

  const bad = errors.filter((e) => !/ResizeObserver/.test(e));
  assert.deepStrictEqual(bad, [], 'sayfa hatası yok');
  await app.close();
  console.log('dekont-1671 e2e: TAMAM →', OUT);
})().catch(async (e) => { console.error('HATA:', e && e.stack || e); process.exit(1); });
