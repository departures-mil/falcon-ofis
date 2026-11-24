// v1.50: Wi‑Fi (yerel ağ) eşitlemesi — veritabanı tarafı. İnternet gerekmez.
// Masaüstü ve telefon aynı kodu kullanır (services.js gibi). Bulut eşitlemesine dokunmaz:
//  - Her kaydın son değişme zamanı ve silinmeler local_lan_log'da tutulur (tetikleyicilerle; buluta gitmez).
//  - exportState(): bütün eşitlenen kayıtlar {docs: {"tablo~anahtar": {t,k,d}}, dels: {"tablo~anahtar": zaman}}.
//  - applyState(birleşik): yalnızca farklı olan kayıtlar yazılır. Yazma sırasında bulut tetikleyicileri açık kalır,
//    yani Wi‑Fi'den gelen her değişiklik internet gelince buluta da gönderilir.
//  - İki cihazda farklı değişmiş kayıtta yeni olan kalır, eskisi local_lan_conflicts'e (çakışma yedeği) yazılır.
//  - Dosyalara (fotoğraf, dekont, QR) dokunulmaz; eksik olan taraf karşıdan alır, var olanın üstüne yazılmaz.
//  - v1.58 (ortak çekirdek kuralı): hiçbir kayıt kalıcı silinmez. Öbür cihazda silinen kayıt burada önce local_arsiv'e
//    (tam satır, geri yüklenebilir, hiç silinmez) yazılır, sonra etkin tablodan kalkar. Bulut eşitlemesi de aynı arşivi kullanır.
// Not: telefon paketine gömüldüğü için ?. ve ?? kullanılmaz.

const LOCAL_TABLE_RE = /^(sqlite_|sync_|local_|schema_migrations$)/;
const LOCAL_SETTINGS = ['language'];
const NOW_MS = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
const TRIGGER_VERSION = 1;

const qi = (s) => `"${String(s).replace(/"/g, '""')}"`;
const qs = (s) => `'${String(s).replace(/'/g, "''")}'`;

function createLanStore(db, { fileColumns = {}, localSettings = LOCAL_SETTINGS } = {}) {
  const one = (sql, params) => { const r = db.all(sql, params || []); return r.length ? r[0] : null; };

  function ensureTables() {
    db.db.exec(`
      CREATE TABLE IF NOT EXISTS local_lan_log (tbl TEXT NOT NULL, pk TEXT NOT NULL, at INTEGER NOT NULL, del INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tbl, pk));
      CREATE TABLE IF NOT EXISTS local_lan_flag (on_ INTEGER NOT NULL);
      INSERT INTO local_lan_flag (on_) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM local_lan_flag);
      CREATE TABLE IF NOT EXISTS local_lan_meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS local_lan_conflicts (n INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, pk TEXT NOT NULL, data TEXT, at INTEGER, saved_at INTEGER NOT NULL, dev TEXT);
    `);
    ensureArchive(db);
  }

  function tables() {
    const map = new Map();
    for (const { name } of db.all("SELECT name FROM sqlite_master WHERE type = 'table'")) {
      if (LOCAL_TABLE_RE.test(name)) continue;
      const cols = db.all(`PRAGMA table_info(${qi(name)})`);
      const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
      if (!pk.length) continue;
      const uniques = [];
      for (const idx of db.all(`PRAGMA index_list(${qi(name)})`)) {
        if (!idx.unique || idx.origin === 'pk') continue;
        const ic = db.all(`PRAGMA index_info(${qi(idx.name)})`).map((x) => x.name);
        if (ic.length === 1) uniques.push(ic[0]);
      }
      map.set(name, {
        name,
        cols: cols.map((c) => c.name),
        pk: pk.map((c) => ({ name: c.name, int: /INT/i.test(c.type) })),
        uniques,
        upd: cols.some((c) => c.name === 'updated_at') ? 'updated_at' : null,
      });
    }
    return map;
  }

  const pkExpr = (t, a) => t.pk.map((c) => `CAST(${a}.${qi(c.name)} AS TEXT)`).join(" || '|' || ");
  const pkOf = (t, row) => t.pk.map((c) => String(row[c.name])).join('|');
  function pkWhere(t, pk) {
    const parts = t.pk.length === 1 ? [pk] : String(pk).split('|');
    return { sql: t.pk.map((c) => `${qi(c.name)} = ?`).join(' AND '), params: t.pk.map((c, i) => (c.int ? Number(parts[i]) : parts[i])) };
  }
  const isLocal = (tbl, pk) => tbl === 'settings' && localSettings.includes(pk);

  // Eksik tetikleyiciler kurulur (yeni sürümle gelen tablolar dahil). Tetikleyiciler Wi‑Fi yazması sırasında susar.
  function installTriggers(tmap) {
    const existing = new Set(db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'").map((r) => r.name));
    const sql = [];
    for (const t of tmap.values()) {
      const skip = (a) => (t.name === 'settings' ? ` AND ${a}.key NOT IN (${localSettings.map(qs).join(',')})` : '');
      for (const [s, when, a, del] of [['i', 'AFTER INSERT', 'NEW', 0], ['u', 'AFTER UPDATE', 'NEW', 0], ['d', 'AFTER DELETE', 'OLD', 1]]) {
        const name = `lan${TRIGGER_VERSION}_${t.name}_${s}`;
        if (existing.has(name)) continue;
        sql.push(`CREATE TRIGGER ${qi(name)} ${when} ON ${qi(t.name)} WHEN (SELECT on_ FROM local_lan_flag) = 0${skip(a)} BEGIN `
          + `INSERT INTO local_lan_log (tbl, pk, at, del) VALUES (${qs(t.name)}, ${pkExpr(t, a)}, ${NOW_MS}, ${del}) `
          + `ON CONFLICT(tbl, pk) DO UPDATE SET at = MAX(excluded.at, local_lan_log.at + 1), del = excluded.del; END;`);
      }
    }
    if (sql.length) db.db.exec(sql.join('\n'));
  }

  function prepare() {
    ensureTables();
    const tmap = tables();
    installTriggers(tmap);
    return tmap;
  }

  // Değişme zamanı: kayıt defteri (tetikleyici) ya da tablodaki updated_at — hangisi yeniyse
  function rowStamp(t, row, logAt) {
    let s = Number(logAt) || 0;
    if (t.upd && row[t.upd]) {
      const v = String(row[t.upd]);
      const ms = /^\d+$/.test(v) ? Number(v) : Date.parse(v.replace(' ', 'T'));
      if (ms > s && ms < Date.now() + 86400000) s = ms;
    }
    return s;
  }

  function exportState() {
    const tmap = prepare();
    const log = new Map();
    for (const r of db.all('SELECT tbl, pk, at, del FROM local_lan_log')) log.set(`${r.tbl}~${r.pk}`, r);
    const docs = {};
    const dels = {};
    for (const t of tmap.values()) {
      for (const row of db.all(`SELECT * FROM ${qi(t.name)}`)) {
        const pk = pkOf(t, row);
        if (isLocal(t.name, pk)) continue;
        const id = `${t.name}~${pk}`;
        const l = log.get(id);
        docs[id] = { t: t.name, k: pk, d: row, at: rowStamp(t, row, l ? l.at : 0) };
      }
    }
    for (const [id, l] of log) if (l.del && !docs[id] && tmap.has(l.tbl)) dels[id] = l.at;
    const ver = one('SELECT MAX(version) AS v FROM schema_migrations');
    return { docs, dels, ver: ver ? ver.v : 0 };
  }

  function writeRow(t, pk, row, depth) {
    const cols = t.cols.filter((c) => Object.prototype.hasOwnProperty.call(row, c));
    const pkNames = t.pk.map((c) => c.name);
    const setCols = cols.filter((c) => !pkNames.includes(c));
    const sql = `INSERT INTO ${qi(t.name)} (${cols.map(qi).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      + ` ON CONFLICT(${pkNames.map(qi).join(', ')}) DO ${setCols.length ? `UPDATE SET ${setCols.map((c) => `${qi(c)} = excluded.${qi(c)}`).join(', ')}` : 'NOTHING'}`;
    try {
      db.db.run(sql, cols.map((c) => (row[c] === undefined ? null : row[c])));
    } catch (err) {
      // Aynı ad / kod iki cihazda farklı kayıtlara verilmişse yereldeki öbür kayda " (2)" eklenir (bulut eşitlemesiyle aynı)
      const m = /UNIQUE constraint failed: \w+\.(\w+)/.exec(err.message);
      if (!m || depth > 3 || !t.uniques.includes(m[1])) throw err;
      const col = m[1];
      const other = one(`SELECT * FROM ${qi(t.name)} WHERE ${qi(col)} = ?`, [row[col]]);
      if (!other) throw err;
      let n = 2;
      let value;
      do { value = `${row[col]} (${n++})`; } while (one(`SELECT 1 AS x FROM ${qi(t.name)} WHERE ${qi(col)} = ?`, [value]));
      const ow = pkWhere(t, pkOf(t, other));
      db.db.run(`UPDATE ${qi(t.name)} SET ${qi(col)} = ? WHERE ${ow.sql}`, [value].concat(ow.params));
      writeRow(t, pk, row, depth + 1);
    }
  }

  const canonRow = (x) => {
    if (x === null || typeof x !== 'object') return JSON.stringify(x);
    return '{' + Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonRow(x[k])).join(',') + '}';
  };

  // merged: LanCore.merge sonucu {docs, dels, conflicts}. Döner: {written, deleted, conflicts}
  function applyState(merged, { dev = '' } = {}) {
    const tmap = prepare();
    const docs = merged.docs || {};
    const dels = merged.dels || {};
    let written = 0;
    let deleted = 0;
    let kept = [];
    db.db.run('PRAGMA foreign_keys = OFF');
    try {
      db.tx(() => {
        db.db.run('UPDATE local_lan_flag SET on_ = 1');
        try {
          const setLog = (tbl, pk, at, del) => db.db.run(
            'INSERT INTO local_lan_log (tbl, pk, at, del) VALUES (?,?,?,?) ON CONFLICT(tbl, pk) DO UPDATE SET at = MAX(excluded.at, local_lan_log.at), del = excluded.del',
            [tbl, pk, Math.round(Number(at) || 0), del]);
          // 1) gelen / değişen kayıtlar
          for (const doc of Object.values(docs)) {
            const t = tmap.get(doc.t);
            if (!t || isLocal(doc.t, doc.k) || !doc.d) continue;
            const w = pkWhere(t, doc.k);
            const cur = one(`SELECT * FROM ${qi(t.name)} WHERE ${w.sql}`, w.params);
            const want = {};
            t.cols.forEach((c) => { if (Object.prototype.hasOwnProperty.call(doc.d, c)) want[c] = doc.d[c]; });
            if (cur) {
              const same = t.cols.every((c) => !Object.prototype.hasOwnProperty.call(want, c) || canonRow(cur[c]) === canonRow(want[c]));
              if (same) continue;
            }
            writeRow(t, doc.k, want, 0);
            setLog(t.name, doc.k, doc.at, 0);
            written++;
          }
          // 2) karşıda silinmiş (ve silmeden sonra burada değişmemiş) kayıtlar
          for (const t of tmap.values()) {
            for (const row of db.all(`SELECT * FROM ${qi(t.name)}`)) {
              const pk = pkOf(t, row);
              const id = `${t.name}~${pk}`;
              if (docs[id] || isLocal(t.name, pk) || !dels[id]) continue;
              const w = pkWhere(t, pk);
              archiveRow(db, t.name, pk, row, 'wifi', dev, dels[id]);
              db.db.run(`DELETE FROM ${qi(t.name)} WHERE ${w.sql}`, w.params);
              deleted++;
            }
          }
          // 3) silme kayıtları iki tarafta aynı olsun (yoksa öbür cihaz silineni geri getirir)
          for (const [id, at] of Object.entries(dels)) {
            if (docs[id]) continue;
            const i = id.indexOf('~');
            if (i < 1) continue;
            setLog(id.slice(0, i), id.slice(i + 1), at, 1);
          }
          // 4) çakışma yedekleri (kaybeden sürüm saklanır, hiçbir bilgi kaybolmaz). Son Wi‑Fi eşitlemesinden beri
          //    değişmemiş sürüm çakışma sayılmaz (öbür cihaz onun üstüne düzenlemiş demektir).
          const lastRow = one("SELECT value FROM local_lan_meta WHERE key = 'last_sync'");
          const last = lastRow ? Number(lastRow.value) || 0 : 0;
          kept = (merged.conflicts || []).filter((c) => c && c.t && (Number(c.at) || 0) > last);
          const savedAt = Date.now();
          for (const c of kept) {
            db.db.run('INSERT INTO local_lan_conflicts (tbl, pk, data, at, saved_at, dev) VALUES (?,?,?,?,?,?)',
              [c.t, String(c.k), JSON.stringify(c.d), Math.round(Number(c.at) || 0), savedAt, dev]);
          }
          db.db.run("INSERT INTO local_lan_meta (key, value) VALUES ('last_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(savedAt)]);
        } finally {
          db.db.run('UPDATE local_lan_flag SET on_ = 0');
        }
      });
    } finally {
      db.db.run('PRAGMA foreign_keys = ON');
    }
    return { written, deleted: 0, archived: deleted, conflicts: kept.length };
  }

  // Kayıtların kullandığı dosyalar (göreli yol)
  function fileRefs(state) {
    const set = new Set();
    for (const doc of Object.values((state && state.docs) || {})) {
      const col = fileColumns[doc.t];
      if (col && doc.d && doc.d[col]) set.add(String(doc.d[col]));
    }
    return [...set];
  }

  function conflicts(limit) {
    prepare();
    return db.all('SELECT n, tbl, pk, data, at, saved_at, dev FROM local_lan_conflicts ORDER BY n DESC LIMIT ?', [limit || 200]);
  }

  // Birleştirme bu cihazda ne değiştirecek (yazmadan önce yedek almak için)
  function preview(local, merged) {
    const r = { added: 0, updated: 0, removed: 0 };
    const ld = (local && local.docs) || {};
    const md = (merged && merged.docs) || {};
    Object.keys(md).forEach((id) => { if (!ld[id]) r.added++; else if (canon(ld[id].d) !== canon(md[id].d)) r.updated++; });
    Object.keys(ld).forEach((id) => { if (!md[id]) r.removed++; });
    return r;
  }

  // v1.58: arşiv (uzak silinenler). Geri yükleme kaydı aynı numarasıyla geri yazar; tetikleyiciler açık olduğundan
  // öbür cihazlara da (Wi‑Fi / bulut) yeniden gider. Numara bu arada başka bir kayda verildiyse ERR_ARCHIVE_TAKEN.
  function archiveList(limit) {
    prepare();
    return db.all('SELECT n, tbl, pk, data, kaynak, dev, deleted_at, archived_at, restored_at FROM local_arsiv ORDER BY n DESC LIMIT ?', [limit || 300]);
  }
  function archiveRestore(n) {
    const tmap = prepare();
    const a = one('SELECT * FROM local_arsiv WHERE n = ?', [Number(n)]);
    if (!a) throw new Error('ERR_NOT_FOUND');
    const t = tmap.get(a.tbl);
    if (!t) throw new Error('ERR_NOT_FOUND');
    const row = JSON.parse(a.data);
    const w = pkWhere(t, a.pk);
    if (one(`SELECT 1 AS x FROM ${qi(t.name)} WHERE ${w.sql}`, w.params)) throw new Error('ERR_ARCHIVE_TAKEN');
    db.tx(() => {
      const cols = t.cols.filter((c) => Object.prototype.hasOwnProperty.call(row, c));
      db.db.run(`INSERT INTO ${qi(t.name)} (${cols.map(qi).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => (row[c] === undefined ? null : row[c])));
      db.db.run('UPDATE local_arsiv SET restored_at = ? WHERE n = ?', [Date.now(), a.n]);
    });
    return { tbl: a.tbl, pk: a.pk };
  }

  return { exportState, applyState, fileRefs, conflicts, prepare, preview, archiveList, archiveRestore, merge: (a, b) => merge(a, b) };
}

// v1.58: uzak silme → arşiv (hiç silinmez). Wi‑Fi ve bulut eşitlemesi ortak kullanır.
function ensureArchive(db) {
  db.db.exec('CREATE TABLE IF NOT EXISTS local_arsiv (n INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, pk TEXT NOT NULL, data TEXT NOT NULL, kaynak TEXT, dev TEXT, deleted_at INTEGER, archived_at INTEGER NOT NULL, restored_at INTEGER)');
}
function archiveRow(db, tbl, pk, row, kaynak, dev, deletedAt) {
  if (!row) return;
  ensureArchive(db);
  db.db.run('INSERT INTO local_arsiv (tbl, pk, data, kaynak, dev, deleted_at, archived_at) VALUES (?,?,?,?,?,?,?)',
    [tbl, String(pk), JSON.stringify(row), kaynak || '', dev || '', Math.round(Number(deletedAt) || 0) || null, Date.now()]);
}

// Birleştirme (iki cihazda aynı sonucu verir). Kayıt: {t, k, d (satır), at (değişme zamanı)}
function canon(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  return '{' + Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
}
function merge(a, b) {
  const da = (a && a.docs) || {};
  const dbb = (b && b.docs) || {};
  const dels = Object.assign({}, (a && a.dels) || {});
  Object.keys((b && b.dels) || {}).forEach((id) => { const ts = b.dels[id]; if (!(dels[id] >= ts)) dels[id] = ts; });
  const docs = {};
  const conflicts = [];
  const ids = new Set(Object.keys(da).concat(Object.keys(dbb)));
  ids.forEach((id) => {
    const x = da[id];
    const y = dbb[id];
    if (x && y) {
      const cx = canon(x.d);
      const cy = canon(y.d);
      if (cx === cy) { docs[id] = (Number(x.at) || 0) >= (Number(y.at) || 0) ? x : y; return; }
      const sx = Number(x.at) || 0;
      const sy = Number(y.at) || 0;
      const xWins = sx > sy || (sx === sy && cx > cy);
      docs[id] = xWins ? x : y;
      conflicts.push(xWins ? y : x);
      return;
    }
    const d = x || y;
    if (dels[id] && dels[id] >= (Number(d.at) || 0)) return; // silindikten sonra değişmemiş: silinir
    docs[id] = d;
  });
  const old = Date.now() - 400 * 86400000;
  Object.keys(dels).forEach((id) => { if (dels[id] < old || docs[id]) delete dels[id]; });
  return { docs, dels, conflicts };
}

const FalconLanDb = { createLanStore, merge, canon, archiveRow, ensureArchive };
if (typeof module !== 'undefined' && module.exports) module.exports = FalconLanDb;
else if (typeof window !== 'undefined') window.FalconLanDb = FalconLanDb;
