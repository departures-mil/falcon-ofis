// v1.80.0: telefon güncellemesi — "yalnızca değişen kısımlar" (yama) için yayın tarafı.
// telefon-yayinla.js kullanır; test/app.test.js aynı denetimi CI'da yapar.
//
// Telefon (dist/assets/hizli-guncelleme.js):
//   yama = yalnız değişen / yeni dosyaların FOPK paketi (gzip -9), değişmeyenler telefondaki kurulu www'den alınır;
//   paket telefonda "saklı" (sıkıştırmasız) gzip olarak yeniden kurulur → `raw.sha256` + `raw.sig` ile doğrulanır.
// Manifest alanları: files [[yol, boyut, sha256]] (paket sırası), raw {size, sha256, sig}, patches {<eski sürüm>: {file, size, sha256}}.
// Kural: yama tam dosyanın %70'inden büyükse yayınlanmaz; son 5 sürüm için üretilir.
const zlib = require('zlib');
const crypto = require('crypto');
const pack = require('../electron/update-pack');

const MAX_RATIO = 0.7;
const KEEP = 5;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** FOPK1 ham paketi (createPack'in sıkıştırılmamış hâli). */
function buildRaw(version, files) {
  const header = Buffer.from(JSON.stringify({ version, files: files.map((f) => [f.path, f.data.length]) }), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  return Buffer.concat([Buffer.from('FOPK1\n', 'latin1'), len, header, ...files.map((f) => f.data)]);
}

/** Saklı gzip (65535 baytlık sıkıştırmasız deflate blokları) — hizli-guncelleme.js storedGzip ile bayt bayt aynı. */
function storedGzip(raw) {
  const B = 65535;
  const nb = Math.max(1, Math.ceil(raw.length / B));
  const out = Buffer.alloc(10 + raw.length + nb * 5 + 8);
  Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 255]).copy(out, 0);
  let p = 10;
  for (let i = 0; i < nb; i++) {
    const a = i * B;
    const n = Math.min(B, raw.length - a);
    out[p] = i === nb - 1 ? 1 : 0;
    out.writeUInt16LE(n, p + 1);
    out.writeUInt16LE(~n & 0xffff, p + 3);
    p += 5;
    raw.copy(out, p, a, a + n);
    p += n;
  }
  out.writeUInt32LE(zlib.crc32 ? zlib.crc32(raw) >>> 0 : crc32(raw), p);
  out.writeUInt32LE(raw.length >>> 0, p + 4);
  return out;
}

let T = null;
function crc32(b) {
  if (!T) { T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * fullGz: yeni tam paket; olds: [{version, gz}] (eskiden yeniye ya da karışık; son KEEP tanesi kullanılır).
 * Dönüş: { files, raw: {size, sha256, sig?}, patches: {ver: {file, size, sha256}}, patchFiles: {ad: Buffer}, skipped: [...] }
 */
function build(version, fullGz, olds, pem) {
  const cur = pack.readPack(fullGz);
  if (cur.version !== version) throw new Error('paket sürümü uyuşmuyor');
  const files = cur.files.map((f) => [f.path, f.data.length, sha(f.data)]);
  const rawGz = storedGzip(buildRaw(version, cur.files));
  const raw = { size: rawGz.length, sha256: sha(rawGz) };
  if (pem) {
    raw.sig = pack.sign(pem, 'telefon', version, raw.sha256);
    if (!pack.verify('telefon', version, raw.sha256, raw.sig)) throw new Error('ham paket imzası doğrulanmadı');
  }
  // kendi doğrulaması: ham paket gzip olarak açılınca tam paketle aynı dosyalar
  const back = pack.readPack(rawGz);
  if (back.files.length !== cur.files.length || back.files.some((f, i) => f.path !== cur.files[i].path || !f.data.equals(cur.files[i].data))) throw new Error('ham paket tam paketle aynı değil');

  const patches = {};
  const patchFiles = {};
  const skipped = [];
  const sorted = olds.filter((o) => pack.compareVersions(o.version, version) < 0).sort((a, b) => pack.compareVersions(b.version, a.version)).slice(0, KEEP);
  for (const o of sorted) {
    const old = pack.readPack(o.gz);
    const oldMap = new Map(old.files.map((f) => [f.path, sha(f.data)]));
    const changed = cur.files.filter((f) => oldMap.get(f.path) !== sha(f.data));
    const header = Buffer.from(JSON.stringify({ version: `${o.version}>${version}`, files: changed.map((f) => [f.path, f.data.length]) }), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(header.length);
    const pgz = zlib.gzipSync(Buffer.concat([Buffer.from('FOPK1\n', 'latin1'), len, header, ...changed.map((f) => f.data)]), { level: 9 });
    if (pgz.length > fullGz.length * MAX_RATIO) { skipped.push({ from: o.version, size: pgz.length, why: '%70 üstü' }); continue; }
    // CI'daki gibi: yamayı uygula (eski dosyalar + yama) → ham paket aynı mı
    const pk = pack.readPack(pgz);
    const pm = new Map(pk.files.map((f) => [f.path, f.data]));
    const om = new Map(old.files.map((f) => [f.path, f.data]));
    const rebuilt = cur.files.map((f) => ({ path: f.path, data: pm.get(f.path) || om.get(f.path) }));
    if (rebuilt.some((f) => !f.data)) throw new Error(`yama ${o.version}: eksik dosya`);
    const rg = storedGzip(buildRaw(version, rebuilt));
    if (sha(rg) !== raw.sha256) throw new Error(`yama ${o.version}: yeniden kurulan paket tutmadı`);
    const file = `telefon-yama-${o.version}-${version}.fopk`;
    patches[o.version] = { file, size: pgz.length, sha256: sha(pgz), changed: changed.length };
    patchFiles[file] = pgz;
  }
  return { files, raw, patches, patchFiles, skipped };
}

module.exports = { build, buildRaw, storedGzip, crc32, MAX_RATIO, KEEP };
