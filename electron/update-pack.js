// v1.19: uygulama içi güncelleme paketi (masaüstü güncelleyicisi ve yayınlama betiği birlikte kullanır).
// Paket = gzip( "FOPK1\n" + 4 bayt başlık uzunluğu + JSON başlık {version, files:[[yol, boyut], ...]} + dosyalar art arda ).
// Telefon tarafı aynı biçimi Java ile açar (MainActivity.unpackUpdate).
// Her paket imzalıdır: imza "platform\nsürüm\nsha256" metni üzerinde, ECDSA P-256 / SHA-256.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const MAGIC = Buffer.from('FOPK1\n', 'latin1');
// Yayınlama anahtarının açık yarısı (gizli yarısı "Falcon Ofis Veri/yayin/anahtar" klasöründe durur; v1.37'de yenilendi)
const PUBLIC_KEY_B64 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEbrTSFXxCh3+tEsrvxW5N7z2DVUxv7s0ZsdUfeDpeDL/yTJxtvy1Lo+KmsiPpMXuB6hsMQDiMuIERM2so2DKmw==';

function listFiles(root, rel = '') {
  const out = [];
  for (const ent of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...listFiles(root, r));
    else if (ent.isFile()) out.push(r);
  }
  return out.sort();
}

// entries: [{ path: 'dist/index.html', file: '/tam/yol' }]
function createPack(version, entries) {
  const bufs = entries.map((e) => fs.readFileSync(e.file));
  const header = Buffer.from(JSON.stringify({ version, files: entries.map((e, i) => [e.path, bufs[i].length]) }), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  return zlib.gzipSync(Buffer.concat([MAGIC, len, header, ...bufs]), { level: 9 });
}

function safeRel(p) {
  const s = String(p);
  if (!s || s.startsWith('/') || s.includes('\\') || s.split('/').some((x) => x === '..' || x === '' || x === '.')) throw new Error('ERR_UPDATE_BAD_PACK');
  return s;
}

function readPack(gz) {
  const raw = zlib.gunzipSync(gz);
  if (!raw.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('ERR_UPDATE_BAD_PACK');
  const hlen = raw.readUInt32BE(MAGIC.length);
  const start = MAGIC.length + 4;
  const header = JSON.parse(raw.subarray(start, start + hlen).toString('utf8'));
  let off = start + hlen;
  const files = header.files.map(([p, size]) => {
    const data = raw.subarray(off, off + size);
    if (data.length !== size) throw new Error('ERR_UPDATE_BAD_PACK');
    off += size;
    return { path: safeRel(p), data };
  });
  return { version: header.version, files };
}

function extractPack(gz, dir) {
  const pack = readPack(gz);
  for (const f of pack.files) {
    const full = path.join(dir, ...f.path.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.data);
  }
  return pack;
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const signedText = (platform, version, hash) => Buffer.from(`${platform}\n${version}\n${hash}`, 'utf8');

function sign(privateKeyPem, platform, version, hash) {
  return crypto.sign('sha256', signedText(platform, version, hash), privateKeyPem).toString('base64');
}

function verify(platform, version, hash, sigB64, publicKeyB64 = PUBLIC_KEY_B64) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify('sha256', signedText(platform, version, hash), key, Buffer.from(String(sigB64 || ''), 'base64'));
  } catch {
    return false;
  }
}

// "1.19.0" > "1.18.2" gibi karşılaştırma
function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

module.exports = { listFiles, createPack, readPack, extractPack, sha256, sign, verify, compareVersions, PUBLIC_KEY_B64 };
