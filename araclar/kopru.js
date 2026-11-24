#!/usr/bin/env node
// ESKİ KANAL KÖPRÜSÜ (v1.58.0'dan beri güncellemeler GitHub Releases + latest.json ile gelir; bkz. CLAUDE.md).
// Kurulu eski sürümler iki eski kanaldan birini okur:
//   1.51–1.57 : raw.githubusercontent.com/departures-mil/falcon-ofis/main/guncelleme/masaustu.json  (+ .fopk)
//   1.19–1.50 : Firebase guncellemeler/masaustu  (falcon-ofis-bulut deposunun yayin.yml iş akışı yükler)
// İkisi de ECDSA imzalı .fopk paketini "Falcon Ofis Veri/guncelleme/<sürüm>" klasörüne açıp bir sonraki açılışta
// oradan çalıştırır (electron/overlay.js). Bu betik yeni sürümü o biçimde paketler: yeni sürüm eski kabukta açılınca
// "Yeni kurulum gerekli" penceresi çıkar ve program dosyalarını GitHub sürümünden yeniler (app.asar takası; olmazsa kurulum).
// Release'ten SONRA çalıştırılır. Gizli anahtar depoya girmez:
//   OZEL_ANAHTAR=<ozel-anahtar.pem> node araclar/kopru.js [--bulut <falcon-ofis-bulut klasörü>] [--notlar "…"]
// Çıktı: guncelleme/masaustu-<sürüm>.fopk + guncelleme/masaustu.json (bu depo) ve istenirse
//        <bulut>/yayin/kuyruk/masaustu-<sürüm>.fopk + .json (Firebase'e son bir kez; sonra bulut deposunda yayın kapatılır).
'use strict';
const fs = require('fs');
const path = require('path');
const pack = require('../electron/update-pack');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const pemFile = process.env.OZEL_ANAHTAR;
if (!pemFile) { console.error('OZEL_ANAHTAR (ECDSA gizli anahtar dosyası) gerekli'); process.exit(2); }
const pem = fs.readFileSync(pemFile, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const notes = opt('--notlar') || 'Yeni: güncellemeler artık GitHub sürümlerinden, yalnızca değişen kısımlar indirilerek gelir. Bu güncellemeden sonra program dosyaları bir kez yenilenir ("Yeni kurulum gerekli" penceresi). Kayıtlar, belgeler, PIN ve eşitleme bağlantısı korunur.';

function build(outDir) {
  const files = ['build', 'dist', 'electron', 'cekirdek', 'package.json'].flatMap((top) => {
    const full = path.join(ROOT, top);
    return fs.statSync(full).isDirectory()
      ? pack.listFiles(full).map((r) => ({ path: `${top}/${r}`, file: path.join(full, r) }))
      : [{ path: top, file: full }];
  });
  const gz = pack.createPack(version, files);
  const hash = pack.sha256(gz);
  const sig = pack.sign(pem, 'masaustu', version, hash);
  if (!pack.verify('masaustu', version, hash, sig)) throw new Error('anahtar programdaki açık anahtarla uyuşmuyor');
  return { gz, hash, sig, files: files.length };
}

const p = build();
const file = `masaustu-${version}.fopk`;
const G = path.join(ROOT, 'guncelleme');
for (const f of fs.readdirSync(G)) if (f.startsWith('masaustu-') && f.endsWith('.fopk')) fs.rmSync(path.join(G, f));
fs.writeFileSync(path.join(G, file), p.gz);
fs.writeFileSync(path.join(G, 'masaustu.json'), JSON.stringify({ version, notes, size: p.gz.length, sha256: p.hash, sig: p.sig, file,
  electron: String(pkg.falconElectron || '44'), publishedAt: new Date().toISOString() }, null, 1));
console.log('GitHub (eski kanal):', file, p.gz.length, 'bayt,', p.files, 'dosya');

const bulut = opt('--bulut');
if (bulut) {
  const Q = path.join(path.resolve(bulut), 'yayin', 'kuyruk');
  fs.mkdirSync(Q, { recursive: true });
  fs.writeFileSync(path.join(Q, file), p.gz);
  fs.writeFileSync(path.join(Q, `masaustu-${version}.json`), JSON.stringify({ platform: 'masaustu', version, notes, file, sha256: p.hash, sig: p.sig,
    electron: String(pkg.falconElectron || '44') }, null, 2));
  console.log('Firebase kuyruğu:', path.join(Q, file));
}
