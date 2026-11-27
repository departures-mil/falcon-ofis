// Falcon Ofis — Node testleri (Electron gerekmez): sürüm, ortak çekirdek kopyası, arayüz bağlantıları, güncelleme kanalı,
// eşitlemede "hiçbir kayıt silinmez" kuralı (Wi‑Fi + bulut → arşiv), eski kanal paketi, paketleme ayarları.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const semver = (v) => String(v).split('.').map(Number);
const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };

test('sürüm: X.Y.Z, yayınlanmış en yüksek sürümden (1.57.0) büyük, notlar üç dilde', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.ok(cmp(pkg.version, '1.57.0') > 0, pkg.version);
  const notes = JSON.parse(read('release-notes.json'));
  for (const l of ['tr', 'en', 'ar']) assert.ok(String(notes[l] || '').length > 20, 'release-notes ' + l);
  assert.match(read('dist/assets/fc-falcon.js'), new RegExp(`'${pkg.version.replace(/\./g, '\\.')}': \\{`), 'neler yeni (NEWS) bu sürüm');
  assert.strictEqual(pkg.name, 'falcon-ofis');
  assert.strictEqual(pkg.productName, 'Falcon Ofis');
  assert.strictEqual(pkg.build.appId, 'com.falcon.ofis');
  assert.strictEqual(pkg.build.productName, 'Falcon Ofis');
  assert.strictEqual(String(pkg.falconElectron), String(pkg.devDependencies.electron).replace(/^\D*/, '').split('.')[0], 'falconElectron = Electron ana sürümü (eski kabuk köprüsü)');
});

test('ortak çekirdek kopyası: VERSION, dosyalar, kapsamlı CSS', () => {
  const v1 = read('cekirdek/VERSION'), v2 = read('dist/cekirdek/VERSION');
  assert.match(v1, /^ortak-cekirdek [0-9a-f]{40}\n/);
  assert.strictEqual(v1, v2);
  for (const f of ['cekirdek/electron/fc-electron-main.js', 'cekirdek/electron/fc-preload.js', 'cekirdek/electron/fcd1.js', 'dist/cekirdek/fc-core.js', 'dist/cekirdek/css/tokens.css', 'dist/cekirdek/css/core.css', 'dist/cekirdek/css/core-falcon.css']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const core = read('dist/cekirdek/fc-core.js');
  for (const m of ['FC.updater = api', 'FC.topbar = api', 'FC.crash = api', 'FC.onboarding = api', 'FC.whatsnew', 'FC.agent']) assert.ok(core.includes(m), m);
  assert.ok(/HTTP_404\\b\/\.test\(txt\)\) return null/.test(core), 'kabuk indirmesinde 404 = güncel (çekirdekte)');
  assert.ok(core.includes("status: p ? (bgOk ? 'queued' : 'available')"), 'otomatik güncelleme (arka planda indir, kapanınca kur)');
  // core-falcon.css: Falcon'un kendi görünümünü değiştiren kapsamsız seçici yok
  const css = read('dist/cekirdek/css/core-falcon.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const sels = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter((s) => s && !s.startsWith('@'));
  for (const s of sels) for (const p of s.split(/,(?![^()]*\))/)) assert.ok(/\.fc-scope/.test(p), 'kapsamsız seçici: ' + p);
  assert.ok(!fs.existsSync(path.join(ROOT, 'dist/assets/fc-agent.js')), 'bağımsız fc-agent kopyası kaldırıldı (çekirdek FC.agent)');
  assert.ok(!fs.existsSync(path.join(ROOT, 'electron/fc-agent-main.js')));
});

test('arayüz: index.html çekirdeği yükler, CSP gerekli adresleri içerir', () => {
  const html = read('dist/index.html');
  const i = (s) => html.indexOf(s);
  assert.ok(i('cekirdek/fc-core.js') > 0 && i('cekirdek/fc-core.js') < i('assets/fc-falcon.js'), 'fc-core.js → fc-falcon.js');
  assert.ok(i('assets/fc-falcon.js') < i('type="module"'), 'yapıştırıcı React paketinden önce');
  assert.ok(i('index-') < i('cekirdek/css/tokens.css'), 'tokens.css Falcon CSS\'inden sonra (şemalar geçerli olsun)');
  assert.ok(i('cekirdek/css/core-falcon.css') > 0 && i('cekirdek/css/core.css') < 0, 'yalnız kapsamlı çekirdek CSS');
  for (const h of ['https://firestore.googleapis.com', 'https://formsubmit.co', 'https://generativelanguage.googleapis.com', 'https://github.com']) assert.ok(html.includes(h), 'CSP ' + h);
  assert.ok(!/fc-agent\.js|agent-baslat/.test(html));
  const bundle = fs.readdirSync(path.join(ROOT, 'dist/assets')).find((f) => /^index-.*\.js$/.test(f));
  assert.ok(read('dist/assets/' + bundle).includes('window.falcon?.appInfo().then(e=>o(e.version))'), 'ekranda tam sürüm (patch-ui-158)');
  const glue = read('dist/assets/fc-falcon.js');
  for (const m of ["data-win': 'half'", 'FC.settings.about', 'FC.crash.card', 'FC.onboarding.maybeStart', 'fo-contact', "setupChannel: 'win-setup'", 'fo.bridge.title']) assert.ok(glue.includes(m), m);
  assert.ok(!glue.includes("registerScheme('klasik'"), 'klasik şema kaydedilmez (Falcon görünümü zaten varsayılan)');
});

test('güncelleme yalnız GitHub: eski Firebase / raw güncelleyici ve yayın kutusu kaldırıldı', () => {
  const main = read('electron/main.js'), pre = read('electron/preload.js');
  assert.ok(!fs.existsSync(path.join(ROOT, 'electron/updater.js')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'electron/yayin.js')));
  assert.ok(!/createUpdater|createPublisher|guncellemeler|update:install|watchLocalUpdate/.test(main));
  assert.ok(!/'update:check'|update:\s*\{/.test(pre), 'eski falcon.update köprüsü yok');
  assert.ok(pre.includes("require('../cekirdek/electron/fc-preload.js')"));
  assert.ok(main.includes("require('../cekirdek/electron/fc-electron-main')"));
  for (const m of ["'fc:update:full'", "'fc:update:patch'", 'writeDataPointer', 'Uninstall Falcon Ofis.exe', 'rememberCrash', 'beforeUpdate']) assert.ok(main.includes(m), m);
  const wf = read('.github/workflows/release.yml');
  assert.ok(wf.includes('departures-mil/ortak-cekirdek/.github/workflows/reusable-release.yml@main'));
  assert.ok(/win-app=app\.asar/.test(wf) && /win-setup=\*Setup\*\.exe/.test(wf));
  assert.ok(/needs: \[test, build\]/.test(wf));
  assert.ok(!fs.existsSync(path.join(ROOT, '.github/workflows/kurulum.yml')), 'eski kurulum iş akışı kaldırıldı (release ile çakışmasın)');
});

test('paketleme: NSIS kullanıcı başına, tek tık, tr/en/ar; çekirdek pakette', () => {
  const b = pkg.build;
  assert.deepStrictEqual(b.win.target.map((t) => t.target), ['nsis']);
  assert.strictEqual(b.nsis.oneClick, true);
  assert.strictEqual(b.nsis.perMachine, false);
  assert.strictEqual(b.nsis.deleteAppDataOnUninstall, false);
  assert.deepStrictEqual(b.nsis.installerLanguages, ['tr_TR', 'en_US', 'ar_SA']);
  assert.ok(b.files.includes('cekirdek/**'));
  assert.ok(fs.existsSync(path.join(ROOT, b.win.icon)), 'simge');
  assert.match(b.nsis.artifactName, /Setup/);
});

async function openDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')) });
  const { DatabaseCore } = require('../electron/db-core');
  class Mem extends DatabaseCore { save() {} }
  return new Mem().openWith(SQL, null);
}

test('Wi‑Fi eşitleme: öbür cihazda silinen kayıt silinmez, arşive alınır ve geri yüklenebilir', async () => {
  const { createLanStore, merge } = require('../electron/lan-db');
  const A = await openDb(), B = await openDb();
  const la = createLanStore(A), lb = createLanStore(B);
  la.prepare(); lb.prepare();
  A.run("INSERT INTO people (id, name) VALUES (777, 'Ahmet')");
  // ilk eşitleme: kayıt iki tarafta
  let m = merge(la.exportState(), lb.exportState());
  la.applyState(m); lb.applyState(m);
  assert.ok(B.get('SELECT name FROM people WHERE id = 777'));
  // A'da silinir, sonra eşitlenir
  await new Promise((r) => setTimeout(r, 5));
  A.run('DELETE FROM people WHERE id = 777');
  m = merge(la.exportState(), lb.exportState());
  const rep = lb.applyState(m, { dev: 'telefon' });
  assert.strictEqual(rep.deleted, 0);
  assert.strictEqual(rep.archived, 1);
  const arc = lb.archiveList();
  assert.strictEqual(arc.length, 1);
  assert.strictEqual(arc[0].tbl, 'people');
  assert.strictEqual(JSON.parse(arc[0].data).name, 'Ahmet');
  assert.strictEqual(arc[0].kaynak, 'wifi');
  // geri yükleme
  lb.archiveRestore(arc[0].n);
  assert.strictEqual(B.get('SELECT name FROM people WHERE id = 777').name, 'Ahmet');
  assert.ok(lb.archiveList()[0].restored_at);
  assert.throws(() => lb.archiveRestore(arc[0].n), /ERR_ARCHIVE_TAKEN/);
  assert.strictEqual(fs.readFileSync(path.join(ROOT, 'electron/lan-db.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'dist/assets/lan-db.js'), 'utf8'), 'masaüstü ve arayüz kopyası aynı');
});

test('bulut eşitleme: buluttan gelen silme de arşive gider (dosyalar silinmez)', () => {
  const s = read('electron/sync.js');
  assert.ok(/archiveRow\(db, tbl, pk, old, 'bulut'/.test(s));
  assert.ok(!/removedFiles\.add\(/.test(s), 'silinen kaydın dosyası silinmez');
});

test('eski kanal paketi (FOPK1): oluşturma / açma, yol güvenliği, imza doğrulaması', () => {
  const pack = require('../electron/update-pack');
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-pack-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'merhaba');
  const gz = pack.createPack('1.58.0', [{ path: 'package.json', file: path.join(ROOT, 'package.json') }, { path: 'electron/a.txt', file: path.join(dir, 'a.txt') }]);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-out-'));
  const r = pack.extractPack(gz, out);
  assert.strictEqual(r.version, '1.58.0');
  assert.strictEqual(fs.readFileSync(path.join(out, 'electron/a.txt'), 'utf8'), 'merhaba');
  assert.strictEqual(pack.verify('masaustu', '1.58.0', pack.sha256(gz), 'bozuk'), false);
  const crypto = require('crypto');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const sig = pack.sign(privateKey.export({ type: 'pkcs8', format: 'pem' }), 'masaustu', '1.58.0', pack.sha256(gz));
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  assert.ok(pack.verify('masaustu', '1.58.0', pack.sha256(gz), sig, pub));
  assert.ok(!pack.verify('telefon', '1.58.0', pack.sha256(gz), sig, pub), 'platform imzaya dahil');
  assert.strictEqual(pack.compareVersions('1.58.0', '1.57.0'), 1);
});

test('her açılışta tam ekran (1.58.1): pencere seçimi kalıcı değil, açılış ayara bağlı değil', () => {
  const m = read('electron/main.js');
  assert.ok(!/security\.windowMode\(\)/.test(m), 'açılış security.windowMode() okumamalı');
  assert.ok(!/security\.setWindowMode\(/.test(m), 'pencere seçimi kalıcı kaydedilmemeli');
  assert.match(m, /const fullscreen = true;/);
  const js = fs.readdirSync(path.join(ROOT, 'dist/assets')).filter((f) => /^index-.*\.js$/.test(f)).map((f) => read('dist/assets/' + f)).join('');
  assert.ok(js.includes('`rate-value rate-empty`'), 'kur girilmedi küçük metin yaması');
  assert.match(read('dist/assets/fc-falcon.css'), /html\[dir=rtl\] \.fa-fab/);
});

test('güncelleme takası betiği (1.58.2): gizli, takılmaz, Türkçe yol betiğe yazılmaz', () => {
  const takas = require('../electron/takas');
  const s = takas.script();
  assert.ok(/^[\x00-\x7f]*$/.test(s), 'betik yalnız ASCII (yollar ortam değişkeninde)');
  assert.ok(!/\(\s*[^)]*%[NM]%/.test(s) && !s.includes('!N!'), 'sayaç parantez bloğu içinde okunmuyor');
  assert.match(s, /if %N% EQU 15 taskkill \/F \/PID %FCU_PID%/, 'kapanmayan program zorla kapatılır');
  assert.match(s, /if %N% GEQ 30 goto gone/, 'bekleme sınırlı');
  assert.match(s, /if %M% GEQ 10 goto copy/, 'taşıma denemesi sınırlı, sonra kopyalama');
  assert.match(s, /fc \/B "%FCU_N%" "%FCU_T%" >NUL 2>&1 \|\| goto crestore/, 'kopya bayt bayt doğrulanır, tutmazsa eskisi geri konur');
  assert.ok(read('electron/main.js').includes("a !== '--hidden'"), 'Güncelle sonrası program görünür açılır (--hidden taşınmaz)');
  const main = read('electron/main.js');
  assert.ok(main.includes("require('./takas').start("), 'main.js güvenli takası kullanır');
  assert.ok(/FCU_NORUN%"=="1" goto son/.test(s), 'kapanışta kurulum: program yeniden açılmaz');
  assert.ok(main.includes("ipcMain.handle('fc:update:applyStaged'") && main.includes("app.on('will-quit'"), 'otomatik güncelleme: hazırla, kapanınca kur');
  assert.ok(!/spawn\(exe, \[\], \{ detached: true, stdio: 'ignore', windowsHide: false \}\)/.test(main), 'kurulum görünür açılmaz (sessiz)');
  assert.ok(!/fcMain\.swapAndRelaunch\(\{\}, st\);\s*return 'restarting'/.test(main), 'çekirdeğin pencereli betiği kullanılmıyor');
  assert.ok(read('.github/workflows/release.yml').includes('node test/win-takas.js'), 'Windows CI testi');
});

test('fatura (1.59): kalemler, vergi, kasaya giriş yap / yapma, kısmi tahsilat, silme; para çıkışında ödeme yöntemi', async () => {
  const db = await openDb();
  const s = require('../electron/services').createServices(db);
  const r = s.call('saveInvoice', { date: '2026-11-27', customer: { name: 'Ahmet' }, currency: 'USD', items: [{ name: 'Kablo', qty: 2, price: 10.5 }, { name: 'Montaj', qty: 1, price: 30 }], discount: 1, tax_rate: 10, record_cash: true, pay_amount: 20 });
  let inv = db.get('SELECT * FROM invoices WHERE id = ?', [r.id]);
  assert.strictEqual(inv.total, 55); assert.strictEqual(inv.paid, 20); assert.strictEqual(inv.status, 'partial');
  assert.match(inv.number, /^FAL-2026-0001$/);
  const tx = db.get("SELECT * FROM cash_transactions WHERE related_type = 'invoice'");
  assert.strictEqual(tx.direction, 'in'); assert.strictEqual(tx.amount, 20); assert.strictEqual(tx.category, 'sale');
  const r2 = s.call('saveInvoice', { date: '2026-11-27', customer: 'Veli', currency: 'SYP', items: [{ name: 'X', qty: 1, price: 150000 }] });
  assert.strictEqual(db.get('SELECT status FROM invoices WHERE id = ?', [r2.id]).status, 'pending');
  assert.strictEqual(db.get("SELECT COUNT(*) AS n FROM cash_transactions WHERE related_type = 'invoice'").n, 1, 'kasaya giriş yapma: kasa değişmez');
  assert.throws(() => s.call('addInvoicePayment', { invoice_id: r.id, amount: 36 }), /ERR_INVOICE_OVERPAY/);
  s.call('addInvoicePayment', { invoice_id: r.id, amount: 35, date: '2026-11-28' });
  assert.strictEqual(db.get('SELECT status FROM invoices WHERE id = ?', [r.id]).status, 'paid');
  s.call('deleteInvoice', { id: r.id });
  assert.strictEqual(db.get("SELECT COUNT(*) AS n FROM cash_transactions WHERE related_type = 'invoice'").n, 0);
  assert.ok(db.get("SELECT COUNT(*) AS n FROM trash_items WHERE kind = 'invoices'").n >= 1, 'silinenler kutusunda');
  s.call('saveGift', { person: { name: 'Ali' }, amount: 5, currency: 'USD', date: '2026-11-27', pay_method: 'shamcash', sc_account: '123', sc_save_payee: true });
  assert.strictEqual(db.get("SELECT pay_method FROM cash_transactions WHERE related_type = 'gift'").pay_method, 'shamcash');
  const acc = db.get("SELECT id FROM cash_accounts WHERE currency_code = 'USD'").id;
  const c = s.call('saveCashTx', { account_id: acc, direction: 'out', amount: 3, date: '2026-11-27', pay_method: 'bank', sc_ref: 'H-1', sc_account: 'x' });
  const ct = db.get('SELECT pay_method, sc_ref, sc_account FROM cash_transactions WHERE id = ?', [c.id]);
  assert.deepStrictEqual([ct.pay_method, ct.sc_ref, ct.sc_account], ['bank', 'H-1', null]);
});

test('fatura (1.60): PDF çevrimdışı okuma — e-Fatura düzeni (satıcı, SAYIN, bilgiler, kalemler, toplamlar)', () => {
  const P = require('../dist/assets/fatura-pdf.js');
  const r = P.normalize(P.parseLayout(JSON.parse(read('test/fixtures/efatura-sayfa.json'))));
  assert.strictEqual(r.buyer.name, 'İSTANİFY TEKNOLOJİ ANONİM ŞİRKETİ');
  assert.strictEqual(r.buyer.tax_no, '4811330402'); assert.strictEqual(r.buyer.tax_office, 'GÜNEŞLİ VERGİ DAİRESİ');
  assert.strictEqual(r.buyer.city, 'İSTANBUL'); assert.strictEqual(r.buyer.district, 'BAĞCILAR'); assert.strictEqual(r.buyer.email, 'istanify@gmail.com');
  assert.strictEqual(r.seller.name, 'İNFOTEK ELEKTRONİK SAN.VE TİC.A.Ş.'); assert.strictEqual(r.seller.tax_no, '4781182963'); assert.strictEqual(r.seller.mersis, '0478118296300001');
  assert.deepStrictEqual([r.meta.date, r.meta.number, r.meta.scenario, r.meta.inv_type, r.meta.customization, r.meta.issue_time], ['2026-11-12', 'ARM2026000030399', 'TEMELFATURA', 'SATIS', 'TR1.2', '15:05:03']);
  assert.strictEqual(r.meta.ettn, '67104465-1801-4E2A-92F7-5ECE6F290863'); assert.strictEqual(r.meta.campaign, 'MT1211551886'); assert.match(r.meta.cargo, /^MNG KARGO/);
  assert.strictEqual(r.items.length, 4); assert.strictEqual(r.currency, 'TRY');
  assert.deepStrictEqual(r.items[0], { name: 'WD19X-P1 19mm Anahtarlı Mandal Buton 2NO+2NC', code: 'BTN.MTL.01.000621', depot: 'K1B04', qty: 5, unit: 'Adet', price: 357, amount: 1785, vat: 20, vat_amount: 357, disc_rate: null, disc_amount: null });
  assert.strictEqual(r.items[1].price, 291.72); assert.strictEqual(r.items[3].qty, 20);
  assert.deepStrictEqual(r.totals, { subtotal: 6690.18, discount: 0, vat: 1338.04, total: 8028.22, payable: 8028.22 });
  const r2 = P.normalize(P.parseLayout(JSON.parse(read('test/fixtures/earsiv-sayfa.json'))));
  assert.deepStrictEqual(r2.items.map((x) => [x.name, x.qty, x.unit, x.price, x.vat, x.disc_amount]), [['Laptop çantası 15.6" su geçirmez siyah renk', 2, 'Adet', 450, 20, 0], ['USB-C kablo 1m', 10, 'Adet', 35.5, 10, 35.5], ['Kurulum hizmeti', 1.5, 'Saat', 1200, 20, 0]]);
  assert.deepStrictEqual([r2.buyer.name, r2.buyer.tax_no, r2.buyer.district, r2.seller.name, r2.meta.scenario, r2.meta.date, r2.totals.vat], ['Ahmet Yılmaz', '12345678901', 'KEÇİÖREN', 'ABC BİLİŞİM LTD. ŞTİ.', 'EARSIVFATURA', '2026-10-05', 571.95]);
  assert.strictEqual(P.num('1.785,00 TL'), 1785); assert.strictEqual(P.num('%20,00'), 20); assert.strictEqual(P.num('1,234.50'), 1234.5);
  assert.deepStrictEqual(P.rankModels(['gemini-3.8-flash', 'gemini-3.5-pro', 'gemini-3.6-pro-preview', 'gemini-3.6-pro-preview-tts']), ['gemini-3.6-pro-preview', 'gemini-3.5-pro', 'gemini-3.8-flash']);
  const html = read('dist/index.html');
  assert.ok(html.indexOf('assets/qrcode-gen.js') < html.indexOf('assets/fatura-falcon.js') && html.includes('./assets/fatura-pdf.js'), 'karekod ve PDF okuyucu yüklenir');
  assert.ok(fs.existsSync(path.join(ROOT, 'dist/assets/pdfjs/pdf.min.mjs')) && fs.existsSync(path.join(ROOT, 'dist/assets/pdfjs/pdf.worker.min.mjs')), 'pdf.js çevrimdışı okuma için pakette');
});

test('fatura (1.60): müşteri kaydı (VKN eşleşir), ürün kaydı (stok kodu / ad), fiyat geçmişi, satır KDV, başlık bilgileri', async () => {
  const db = await openDb();
  const s = require('../electron/services').createServices(db);
  const items = [
    { name: 'WD19X-P1 19mm Anahtarlı Mandal Buton 2NO+2NC', code: 'BTN.MTL.01.000621', depot: 'K1B04', qty: 5, unit: 'Adet', price: 357, vat: 20 },
    { name: 'TL-W5F2 6-36V 5mm PNP NC Endüktif Mesafe Sensörü', code: 'SNS.CCM.01.000202', depot: 'K1B11', qty: 4, unit: 'Adet', price: 291.72, vat: 20 },
    { name: '6 Kanal Oto Bıçak Sigorta Kutusu', code: 'KOM.SGT.07.000040', depot: 'K1B14', qty: 2, unit: 'Adet', price: 262.65, vat: 20, x: { brand: 'Ack' } },
  ];
  const meta = { ettn: '67104465-1801-4E2A-92F7-5ECE6F290863', scenario: 'TEMELFATURA', inv_type: 'SATIS', customization: 'TR1.2', issue_time: '15:05:03', campaign: 'MT1211551886' };
  const r = s.call('saveInvoice', { date: '2026-11-12', customer: { name: 'İSTANİFY TEKNOLOJİ ANONİM ŞİRKETİ' }, customer_tax: '4811330402', customer_phone: '5324915586',
    customer_extra: { tax_office: 'GÜNEŞLİ VERGİ DAİRESİ', city: 'İSTANBUL' }, currency: 'TRY', items, meta });
  const inv = db.get('SELECT * FROM invoices WHERE id = ?', [r.id]);
  assert.strictEqual(inv.subtotal, 3477.18);
  assert.strictEqual(inv.tax, 357 + 233.38 + 105.06, 'satır KDV ayrı yuvarlanır');
  assert.strictEqual(inv.tax_rate, 20);
  assert.strictEqual(JSON.parse(inv.meta).ettn, meta.ettn);
  const its = JSON.parse(inv.items);
  assert.strictEqual(its[0].code, 'BTN.MTL.01.000621'); assert.strictEqual(its[0].depot, 'K1B04'); assert.strictEqual(its[2].x.brand, 'Ack');
  assert.ok(its.every((x) => x.product_id), 'kalemler ürüne bağlandı');
  const c = db.get('SELECT * FROM customers');
  assert.strictEqual(c.tax_office, 'GÜNEŞLİ VERGİ DAİRESİ'); assert.strictEqual(inv.customer_id, c.id);
  assert.strictEqual(db.get('SELECT COUNT(*) AS n FROM products').n, 3);
  const p = db.get("SELECT * FROM products WHERE code = 'SNS.CCM.01.000202'");
  assert.strictEqual(p.sale_price, 291.72); assert.strictEqual(p.cost_currency, 'TRY'); assert.strictEqual(p.vat_rate, 20); assert.strictEqual(p.depot, 'K1B11');
  // ikinci fatura: aynı VKN (adı farklı yazılmış) → aynı müşteri; aynı ürün adı (stok kodu yok) → aynı ürün, yeni fiyat
  const r2 = s.call('saveInvoice', { date: '2026-11-20', customer: { name: 'Istanify Teknoloji A.Ş.' }, customer_tax: '481 133 0402', currency: 'TRY',
    items: [{ name: 'tl-w5f2 6-36V 5mm PNP NC endüktif mesafe sensörü', qty: 1, price: 300, vat: 20 }], meta: { ettn: 'X' } });
  assert.strictEqual(db.get('SELECT COUNT(*) AS n FROM customers').n, 1, 'VKN eşleşti: çift kayıt yok');
  assert.strictEqual(db.get('SELECT tax_office FROM customers').tax_office, 'GÜNEŞLİ VERGİ DAİRESİ', 'eldeki bilgi silinmedi');
  assert.strictEqual(db.get('SELECT COUNT(*) AS n FROM products').n, 3, 'ad eşleşti: çift ürün yok');
  assert.strictEqual(db.get('SELECT sale_price FROM products WHERE id = ?', [p.id]).sale_price, 300, 'son fiyat güncel fiyat');
  assert.strictEqual(db.get('SELECT COUNT(*) AS n FROM product_prices WHERE product_id = ?', [p.id]).n, 2, 'fiyat geçmişi korunur');
  // eski tarihli faturayı düzenlemek güncel fiyatı geri götürmez
  s.call('saveInvoice', { id: r.id, date: '2026-11-12', customer: { name: 'İSTANİFY TEKNOLOJİ ANONİM ŞİRKETİ' }, customer_tax: '4811330402', currency: 'TRY', items });
  assert.strictEqual(db.get('SELECT sale_price FROM products WHERE id = ?', [p.id]).sale_price, 300);
  assert.strictEqual(JSON.parse(db.get('SELECT meta FROM invoices WHERE id = ?', [r.id]).meta).ettn, meta.ettn, 'meta gönderilmezse korunur');
  // ürün kartı: elle fiyat → geçmişe yazılır; müşteri silinir, faturası bozulmaz
  s.call('saveProductCard', { id: p.id, name: p.name, code: p.code, unit: 'Adet', sale_price: 310, currency: 'TRY', vat_rate: 20, depot: 'K1B12', extra: { marka: 'X' } });
  assert.strictEqual(db.get("SELECT COUNT(*) AS n FROM product_prices WHERE product_id = ? AND source = 'manual'", [p.id]).n, 1);
  assert.strictEqual(db.get('SELECT depot FROM products WHERE id = ?', [p.id]).depot, 'K1B12');
  assert.throws(() => s.call('saveProductCard', { name: 'Y', code: p.code }), /ERR_DUPLICATE_CODE/);
  s.call('deleteCustomer', { id: c.id });
  assert.ok(db.get('SELECT id FROM invoices WHERE id = ?', [r2.id]));
  assert.ok(db.get("SELECT COUNT(*) AS n FROM trash_items WHERE kind = 'customers'").n >= 1);
  // eski faturalardan aktarma
  db.run('UPDATE invoices SET customer_id = NULL');
  assert.strictEqual(s.call('importInvoiceCustomers', {}).added, 1);
  // satır KDV'si olmayan (eski biçim) fatura eskisi gibi hesaplanır
  const r3 = s.call('saveInvoice', { date: '2026-11-27', customer: 'Veli', currency: 'USD', items: [{ name: 'Z', qty: 1, price: 100 }], tax_rate: 10, save_products: false, save_customer: false });
  assert.strictEqual(db.get('SELECT total FROM invoices WHERE id = ?', [r3.id]).total, 110);
});


test('Kullanım Limitleri kartı tek (1.59): arayüz eşitleme kartının yanına başka öğe eklese de çoğalmaz', () => {
  const src = read('dist/assets/kullanim.js');
  assert.ok(src.includes("querySelectorAll('.kul-kart[data-kul-yer]')"), 'sayfadaki kopyalar aranır');
  assert.ok(read('dist/index.html').includes('./assets/fatura-falcon.js'), 'fatura eklentisi yüklenir');
  assert.ok(read('dist/assets/fatura-falcon.js').includes('window.FalconFatura'));
});

test('Arapça / dar ekran (1.60.1): varsayılan adlar ekranda çevrilir, tarih yereli dile bağlı, üst çubuk taşmaz, duyuru teması', () => {
  const html = read('dist/index.html');
  assert.ok(html.includes('./assets/adlar-falcon.js') && html.indexOf('adlar-falcon.js') < html.indexOf('type="module"'), 'ad çevirisi eklentisi React paketinden önce yüklenir');
  const adlar = read('dist/assets/adlar-falcon.js');
  for (const ad of ['Dolar Kasası', 'TL Kasası', 'Suriye Lirası Kasası', 'Nakit Dolar', 'Nakit TL', 'Nakit Suriye Lirası', 'Ana Depo']) assert.ok(adlar.includes(`'${ad}': { en: '`), ad);
  assert.ok(/INPUT: 1, TEXTAREA: 1/.test(adlar), 'giriş kutularındaki kayıt adına dokunulmaz');
  const main = read('electron/main.js');
  assert.match(main, /appendSwitch\('lang', LOCALE_MAP\[l\]\)/, 'Chromium yereli dil.json ile açılışta seçilir');
  assert.match(main, /if \(key === 'language'\) rememberLocale/, 'dil değişince dil.json yazılır');
  assert.ok(main.indexOf("appendSwitch('lang'") < main.indexOf('app.whenReady()'), 'yerel, uygulama hazır olmadan seçilir');
  const css = read('dist/assets/fc-falcon.css');
  assert.match(css, /@media \(max-width:1500px\)\{[^}]*top-act-label\{display:none\}/, 'dar ekranda düğme yazıları gizlenir');
  assert.match(css, /\.topbar-actions\{flex-wrap:wrap/, 'üst çubuk taşmak yerine alt satıra iner');
  const duyuru = read('dist/assets/duyuru-falcon.js');
  assert.ok(duyuru.includes('.aduy-kut{background:var(--modal-bg') && !duyuru.includes('prefers-color-scheme'), 'duyuru penceresi programın temasını izler');
  assert.ok(duyuru.includes('.aduy-zil{position:fixed;inset-inline-end:'), 'bildirim düğmesi kenar çubuğunun üstüne binmez');
});

test('Sor asistanı çevrimdışı (1.60.1): kasa bakiyesi ve azalan stok soruları tr/en/ar tanınır, dönem soruları pakete kalır', () => {
  const html = read('dist/index.html');
  assert.ok(html.indexOf('sor-yerel-falcon.js') > 0 && html.indexOf('sor-yerel-falcon.js') < html.indexOf('type="module"'));
  const bundle = fs.readdirSync(path.join(ROOT, 'dist/assets')).filter((f) => /^index-.*\.js$/.test(f)).map((f) => read('dist/assets/' + f)).join('');
  assert.ok(bundle.includes('if(window.FalconAskLocal){try{var pre=await window.FalconAskLocal(text,ctx,range);if(pre)return pre}catch(e){}}'), 'FA.local kancası (patch-ui-1601)');
  const g = { document: { documentElement: { getAttribute: () => 'tr' } } };
  g.window = g;
  new Function('window', 'document', read('dist/assets/sor-yerel-falcon.js'))(g, g.document);
  const { RX, norm } = g.FalconAskLocal._test;
  const bal = (s) => RX.balance.test(norm(s)) && !RX.period.test(norm(s));
  const low = (s) => RX.stockWord.test(norm(s)) && RX.stockLow.test(norm(s)) && !RX.period.test(norm(s));
  for (const s of ['Kasada ne kadar para var?', 'Bakiye nedir', 'How much money do we have?', 'كم المال في الصندوق؟', 'ما هو رصيد الصناديق']) assert.ok(bal(s), s);
  for (const s of ['Bu ay ne kadar harcadık?', 'Dün kasaya ne kadar giriş oldu?', 'كم صرفنا هذا الشهر؟']) assert.ok(!bal(s), s);
  for (const s of ['Stokta azalan malzemeler hangileri?', 'Which items are running low?', 'ما المواد التي نفدت من المخزون؟', 'biten ürünler']) assert.ok(low(s), s);
  for (const s of ['Stokta kaç ürün var?', 'Bu ay hangi malzemeler bitti?']) assert.ok(!low(s), s);
});
