// Electron açılış testleri (gerçek ana süreç + preload + arayüz; Linux'ta xvfb-run ile, FALCON_SMOKE=1):
//  1) Normal açılış: ortak çekirdek yüklü, üst çubuk (✦, Güncelle, Küçült · Orta · Tam ekran · Kapat), Ayarlar sırası (iletişim EN SONDA).
//  2) ESKİ KABUK KÖPRÜSÜ: eski sürüm (1.57.0) kendi güncelleyicisinin klasörüne açtığı bu sürümü çalıştırır (electron/overlay.js);
//     yeni arayüz açılır ve "Yeni kurulum gerekli" penceresini gösterir.
// Electron ikilisi yoksa (npm ci yapılmadıysa) ya da xvfb-run yoksa atlanır.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');

let electron = null;
try { electron = require('electron'); } catch (e) { /* yok */ }
const needX = process.platform === 'linux' && !process.env.DISPLAY;
const hasXvfb = !needX || spawnSync('sh', ['-c', 'command -v xvfb-run'], { encoding: 'utf8' }).status === 0;
const skip = !electron || typeof electron !== 'string' ? 'electron yok' : !hasXvfb ? 'xvfb-run yok' : false;

function run(appDir, extraEnv) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-smoke-'));
  const args = [appDir, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + path.join(tmp, 'ud')];
  const cmd = needX ? 'xvfb-run' : electron;
  const full = needX ? ['-a', '-s', '-screen 0 1600x1000x24', electron].concat(args) : args;
  const r = spawnSync(cmd, full, { encoding: 'utf8', timeout: 150000, env: Object.assign({}, process.env, {
    FALCON_SMOKE: '1', FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1',
    FALCON_TEST_DOCS_DIR: path.join(tmp, 'belgeler'), ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }, extraEnv || {}) });
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('FALCON_SMOKE '));
  assert.ok(line, 'çıktı yok: ' + String(r.stdout || '').slice(-1500) + String(r.stderr || '').slice(-2500));
  const o = JSON.parse(line.slice('FALCON_SMOKE '.length));
  console.log(JSON.stringify(o));
  return o;
}

test('Electron: açılış, ortak çekirdek, üst çubuk, Ayarlar sırası', { skip, timeout: 170000 }, () => {
  const o = run(ROOT);
  assert.strictEqual(o.error, undefined, o.error);
  assert.deepStrictEqual(o.errors, []);
  assert.strictEqual(o.fc, true, 'FC çekirdeği');
  assert.strictEqual(o.host, 'electron', 'fcHost');
  assert.strictEqual(o.appVersion, pkg.version);
  assert.strictEqual(o.info.overlay, false);
  assert.strictEqual(o.oldUpdate, 'undefined', 'eski güncelleyici köprüsü yok');
  assert.strictEqual(o.agentBtn, true, '✦ Asistan Agent');
  assert.strictEqual(o.updateBtn, true, 'çekirdeğin Güncelle düğmesi');
  assert.deepStrictEqual(o.win, ['falcon', 'half', 'falcon', 'falcon'], 'Küçült · Orta · Tam ekran · Kapat');
  assert.strictEqual(o.scheme, 'falcon');
  assert.ok(o.schemes >= 7, 'şema seçici');
  assert.strictEqual(o.klasik, false);
  const s = o.settings;
  assert.strictEqual(s[s.length - 1], 'fo-contact', 'Admin ile iletişim EN SONDA');
  assert.deepStrictEqual(s.slice(-5, -1), ['agent', 'crash', 'arsiv', 'about']);
  assert.ok(s.includes('look'));
  assert.ok(!o.bridgeModal.some((t) => /Yeni kurulum/.test(t)), 'kurulu sürümde köprü penceresi yok');
  assert.ok(o.bridgeModal.includes('Hoş geldiniz'), 'yeni kullanıcıda ilk açılış rehberi (PIN açıldıktan sonra)');
});

test('Electron: eski kabuk köprüsü (1.57.0 güncelleyicisinin açtığı paket) → "Yeni kurulum gerekli"', { skip, timeout: 170000 }, () => {
  const pack = require('../electron/update-pack');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-kopru-'));
  // eski kurulum: kendi electron/ klasörü (overlay yükleyicisi) + package.json 1.57.0
  const base = path.join(tmp, 'eski');
  fs.mkdirSync(base);
  fs.cpSync(path.join(ROOT, 'electron'), path.join(base, 'electron'), { recursive: true });
  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify(Object.assign({}, pkg, { version: '1.57.0' })));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(base, 'node_modules'), 'dir');
  // eski güncelleyicinin yaptığı: paketi "guncelleme/<sürüm>" klasörüne aç, aktif.json yaz
  const files = ['build', 'dist', 'electron', 'cekirdek', 'package.json'].flatMap((top) => {
    const full = path.join(ROOT, top);
    return fs.statSync(full).isDirectory() ? pack.listFiles(full).map((r) => ({ path: `${top}/${r}`, file: path.join(full, r) })) : [{ path: top, file: full }];
  });
  const upd = path.join(tmp, 'guncelleme');
  pack.extractPack(pack.createPack(pkg.version, files), path.join(upd, pkg.version));
  fs.writeFileSync(path.join(upd, 'aktif.json'), JSON.stringify({ version: pkg.version, tries: 0 }));
  const o = run(base, { FALCON_TEST_UPDATE_DIR: upd, FALCON_SMOKE_WAIT: '7000' });
  assert.strictEqual(o.error, undefined, o.error);
  assert.deepStrictEqual(o.errors, []);
  assert.strictEqual(o.appVersion, pkg.version, 'yeni sürüm eski kabukta çalışıyor');
  assert.strictEqual(o.info.overlay, true);
  assert.strictEqual(o.info.baseVersion, '1.57.0');
  assert.strictEqual(o.info.channel, 'win-setup', 'paketlenmemiş test kabuğu: kurulum kanalı');
  assert.ok(o.bridgeModal.some((t) => /Yeni kurulum gerekli|New installer required|يلزم مثبّت جديد/.test(t)), JSON.stringify(o.bridgeModal));
  assert.strictEqual(o.fc, true);
  assert.strictEqual(o.updateBtn, true);
});
