// Falcon Ofis — masaüstü güncellemesini GitHub'a yayınlar (depo kökünden):
//   OZEL_ANAHTAR="<Falcon Ofis Veri\yayin\anahtar\ozel-anahtar.pem yolu>" node araclar/yayinla.js "notlar"
// Sürüm package.json'dan okunur; paket guncelleme/masaustu-<sürüm>.fopk, bildirge guncelleme/masaustu.json olur.
// Telefon güncellemeleri hâlâ programın "yayin\kuyruk" klasörü üzerinden Firebase'e gider (telefon kabuğu Firebase'den okur).
// Sonra: git add -A && git commit -m "Falcon Ofis X" && git push
const fs = require('fs');
const path = require('path');
const pack = require('../electron/update-pack');

const ROOT = path.join(__dirname, '..');
const G = path.join(ROOT, 'guncelleme');
const notes = process.argv[2] || '';
const pem = fs.readFileSync(process.env.OZEL_ANAHTAR || '', 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const files = ['build', 'dist', 'electron', 'package.json'].flatMap((top) => {
  const full = path.join(ROOT, top);
  return fs.statSync(full).isDirectory()
    ? pack.listFiles(full).map((r) => ({ path: `${top}/${r}`, file: path.join(full, r) }))
    : [{ path: top, file: full }];
});
const gz = pack.createPack(version, files);
const hash = pack.sha256(gz);
const sig = pack.sign(pem, 'masaustu', version, hash);
if (!pack.verify('masaustu', version, hash, sig)) throw new Error('anahtar uyuşmuyor');
for (const f of fs.readdirSync(G)) if (f.startsWith('masaustu-') && f.endsWith('.fopk')) fs.rmSync(path.join(G, f));
const file = `masaustu-${version}.fopk`;
fs.writeFileSync(path.join(G, file), gz);
fs.writeFileSync(path.join(G, 'masaustu.json'), JSON.stringify({ version, notes, size: gz.length, sha256: hash, sig, file,
  electron: String(process.env.ELECTRON_MAJOR || '44'), publishedAt: new Date().toISOString() }, null, 1));
console.log('hazır', version, gz.length, 'bayt');
