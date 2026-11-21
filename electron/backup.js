// Veri güvenliği: tam yedek (.falcon = veritabanı + dekont/fotoğraf dosyaları), geri yükleme,
// otomatik günlük yedek ve eski sürüm verisini bulup aktarma.
// .falcon dosyası gzip'li bir tar arşividir; WinRAR / 7-Zip ile de açılabilir.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DB_NAME = 'falcon-ofis.db';
const META_NAME = 'falcon-yedek.json';
const FORMAT = 'falcon-ofis-backup';

// ---------- tar (ustar) ----------

function tarHeader(name, size, mtime, type = '0') {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100, 8, 'ascii');
  h.write('0000000\0', 108, 8, 'ascii');
  h.write('0000000\0', 116, 8, 'ascii');
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  h.write(`${Math.floor(mtime / 1000).toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii');
  h.write(type, 156, 1, 'ascii');
  h.write('ustar  \0', 257, 8, 'ascii');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

function tarPack(entries) {
  const parts = [];
  const push = (header, data) => {
    parts.push(header, data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  };
  for (const { name, data, mtime = Date.now() } of entries) {
    // 100 bayttan uzun adlar için GNU uzun ad kaydı (WinRAR / 7-Zip destekler)
    if (Buffer.byteLength(name) > 99) {
      const long = Buffer.from(`${name}\0`, 'utf8');
      push(tarHeader('././@LongLink', long.length, mtime, 'L'), long);
    }
    push(tarHeader(name, data.length, mtime), data);
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

const cstr = (buf) => {
  const i = buf.indexOf(0);
  return buf.subarray(0, i === -1 ? buf.length : i).toString('utf8');
};

function tarUnpack(buf) {
  const entries = [];
  let off = 0;
  let longName = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const magic = h.subarray(257, 263).toString('latin1');
    const prefix = magic === 'ustar\0' ? cstr(h.subarray(345, 500)) : '';
    const name = [prefix, cstr(h.subarray(0, 100))].filter(Boolean).join('/');
    const size = parseInt(cstr(h.subarray(124, 136)).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    off += 512;
    const data = buf.subarray(off, off + size);
    if (type === 'L') longName = cstr(data);
    else {
      if (type === '0') entries.push({ name: longName ?? name, data: Buffer.from(data) });
      longName = null;
    }
    off += Math.ceil(size / 512) * 512;
  }
  return entries;
}

// ---------- tam yedek ----------

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, base));
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// dbBuffer: kayıtlı veritabanı; filesDir: data/files (fotoğraf, dekont)
function createBackupBuffer({ dbBuffer, filesDir, appVersion }) {
  const files = listFiles(filesDir);
  const entries = [
    { name: META_NAME, data: Buffer.from(JSON.stringify({ format: FORMAT, appVersion, created: new Date().toISOString(), fileCount: files.length }, null, 2)) },
    { name: DB_NAME, data: dbBuffer },
    ...files.map((rel) => ({ name: `files/${rel}`, data: fs.readFileSync(path.join(filesDir, rel)), mtime: fs.statSync(path.join(filesDir, rel)).mtimeMs })),
  ];
  return zlib.gzipSync(tarPack(entries), { level: 6 });
}

const isSqlite = (buf) => buf.length >= 16 && buf.subarray(0, 15).toString('latin1') === 'SQLite format 3';

// .falcon dosyasını çözer ve doğrular: { dbBuffer, files: [{ rel, data }], meta }
function readBackupBuffer(buf) {
  let tar;
  try {
    tar = zlib.gunzipSync(buf);
  } catch {
    throw new Error('ERR_BACKUP_INVALID');
  }
  const entries = tarUnpack(tar);
  const db = entries.find((e) => e.name === DB_NAME);
  if (!db || !isSqlite(db.data)) throw new Error('ERR_BACKUP_INVALID');
  let meta = null;
  try {
    meta = JSON.parse(entries.find((e) => e.name === META_NAME)?.data.toString('utf8') || 'null');
  } catch {
    meta = null;
  }
  const files = entries
    .filter((e) => e.name.startsWith('files/'))
    .map((e) => ({ rel: e.name.slice(6), data: e.data }))
    .filter((f) => f.rel && !f.rel.split('/').some((p) => p === '..' || p === '') && !path.isAbsolute(f.rel));
  return { dbBuffer: db.data, files, meta };
}

// ---------- eski veri klasörü ----------

// Kullanıcının seçtiği klasörden veritabanını bulur: program klasörü, "Falcon Ofis Veri", "data" veya yedek klasörü olabilir.
function resolveDataFolder(folder) {
  const candidates = [
    folder,
    path.join(folder, 'data'),
    path.join(folder, 'Falcon Ofis Veri', 'data'),
    path.join(folder, 'Falcon Ofis', 'Falcon Ofis Veri', 'data'),
  ];
  for (const dir of candidates) {
    const db = path.join(dir, DB_NAME);
    if (fs.existsSync(db) && isSqlite(fs.readFileSync(db).subarray(0, 16))) return { dataDir: dir, dbPath: db, filesDir: path.join(dir, 'files') };
  }
  return null;
}

// Yeni sürüm boş açıldığında eski kayıtları arar: programın bulunduğu klasörün yanındaki diğer
// Falcon Ofis klasörleri, AppData ve Belgeler'deki otomatik yedekler. En yeni olan önerilir.
function findOldData({ exeDir, currentDataDir, extraDirs = [], backupDirs = [] }) {
  const found = [];
  const add = (r) => {
    if (!r || path.resolve(r.dataDir) === path.resolve(currentDataDir)) return;
    if (found.some((f) => path.resolve(f.dbPath) === path.resolve(r.dbPath))) return;
    const st = fs.statSync(r.dbPath);
    if (st.size < 1024) return;
    found.push({ ...r, kind: 'folder', mtime: st.mtimeMs });
  };
  const scanRoots = [path.dirname(exeDir), path.dirname(path.dirname(exeDir))];
  for (const root of scanRoots) {
    let list = [];
    try {
      list = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      continue;
    }
    for (const e of list.slice(0, 200)) {
      try {
        add(resolveDataFolder(path.join(root, e.name)));
      } catch {
        // okunamayan klasör atlanır
      }
    }
  }
  for (const d of extraDirs) {
    try {
      add(resolveDataFolder(d));
    } catch {
      // yok
    }
  }
  for (const dir of backupDirs) {
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.falcon')) continue;
        const full = path.join(dir, name);
        found.push({ kind: 'backup', backupPath: full, mtime: fs.statSync(full).mtimeMs });
      }
    } catch {
      // yok
    }
  }
  // Önce klasörler (dosyalarıyla birlikte, en güncel kayıt), sonra yedekler; her grupta en yeni önce
  found.sort((a, b) => (a.kind === b.kind ? b.mtime - a.mtime : a.kind === 'folder' ? -1 : 1));
  return found;
}

// Eski bir klasörün verisini { dbBuffer, files } biçiminde okur
function readDataFolder(resolved) {
  return {
    dbBuffer: fs.readFileSync(resolved.dbPath),
    files: listFiles(resolved.filesDir).map((rel) => ({ rel, data: fs.readFileSync(path.join(resolved.filesDir, rel)) })),
  };
}

// Veriyi hedef klasöre yazar: önce geçici klasöre, sonra eskisinin yerine geçirir.
function writeData(dataDir, { dbBuffer, files }) {
  if (!isSqlite(dbBuffer)) throw new Error('ERR_BACKUP_INVALID');
  const tmp = path.join(dataDir, `.restore-${Date.now()}`);
  fs.mkdirSync(path.join(tmp, 'files'), { recursive: true });
  fs.writeFileSync(path.join(tmp, DB_NAME), dbBuffer);
  for (const f of files || []) {
    const target = path.resolve(tmp, 'files', f.rel);
    if (!target.startsWith(path.resolve(tmp, 'files') + path.sep)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.data);
  }
  const dbPath = path.join(dataDir, DB_NAME);
  const filesDir = path.join(dataDir, 'files');
  // files = null: yalnızca veritabanı (eski .db yedeği); mevcut fotoğraf / dekontlar korunur
  if (files) {
    fs.rmSync(filesDir, { recursive: true, force: true });
    fs.renameSync(path.join(tmp, 'files'), filesDir);
  }
  fs.renameSync(path.join(tmp, DB_NAME), dbPath);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Klasörde en fazla `keep` adet `prefix` ile başlayan yedek bırakır
function prune(dir, prefix, keep) {
  try {
    const list = fs.readdirSync(dir).filter((n) => n.startsWith(prefix)).sort();
    for (const n of list.slice(0, Math.max(0, list.length - keep))) fs.rmSync(path.join(dir, n), { force: true });
  } catch {
    // klasör yoksa sorun değil
  }
}

module.exports = {
  DB_NAME, tarPack, tarUnpack, createBackupBuffer, readBackupBuffer, resolveDataFolder, findOldData, readDataFolder, writeData, prune, isSqlite, listFiles,
};
