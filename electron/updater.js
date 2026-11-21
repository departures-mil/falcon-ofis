// v1.19: uygulama içinden tek tıkla güncelleme (masaüstü). v1.51: güncellemeler GitHub'dan gelir
// (departures-mil/falcon-ofis → guncelleme/masaustu.json + .fopk paketi; Firebase yalnızca canlı veri içindir). İndirilen paketin imzası doğrulanır, "Falcon Ofis Veri/guncelleme/<sürüm>"
// klasörüne açılır ve program yeniden başlayınca overlay.js onu çalıştırır. Kayıtlara ve ayarlara dokunulmaz.
const fs = require('fs');
const path = require('path');
const pack = require('./update-pack');

const PLATFORM = 'masaustu';
const GITHUB_RAW = 'https://raw.githubusercontent.com/departures-mil/falcon-ofis/main/guncelleme/';

// GitHub'dan dosya indirir (404 → null); onBytes(indirilen, toplam) ilerleme için.
function ghGet(url, onBytes) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000, headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'FalconOfis' } }, (res) => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('ERR_UPDATE_DOWNLOAD')); }
      const total = Number(res.headers['content-length'] || 0);
      const bufs = [];
      let got = 0;
      res.on('data', (c) => { bufs.push(c); got += c.length; if (onBytes) onBytes(got, total); });
      res.on('end', () => resolve(Buffer.concat(bufs)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('ERR_UPDATE_DOWNLOAD')));
    req.on('error', (e) => reject(Object.assign(new Error('ERR_UPDATE_DOWNLOAD'), { cause: e })));
  });
}

function createUpdater({ getClient, currentVersion, root, onProgress = () => {}, beforeInstall = () => {} }) {
  let latest = null;
  let installing = null;
  let installed = null;

  async function check() {
    const b = await ghGet(`${GITHUB_RAW}${PLATFORM}.json?t=${Date.now()}`);
    const current = currentVersion();
    const m = b ? JSON.parse(b.toString('utf8')) : null;
    if (!m || !m.version) {
      latest = null;
      return { current, available: false, installed };
    }
    latest = {
      version: m.version,
      notes: m.notes || '',
      size: Number(m.size) || 0,
      sha256: m.sha256,
      sig: m.sig,
      file: m.file,
      electron: m.electron || null,
      publishedAt: m.publishedAt,
    };
    const newer = pack.compareVersions(latest.version, current) > 0;
    // Electron'un kendisi değiştiyse küçük güncelleme yetmez, tam paket gerekir
    const needsFull = newer && !!latest.electron && String(latest.electron) !== String(process.versions.electron).split('.')[0];
    return {
      current,
      available: newer && !needsFull && installed !== latest.version,
      needsFull,
      version: latest.version,
      notes: latest.notes,
      size: latest.size,
      publishedAt: latest.publishedAt,
      installed,
    };
  }

  async function download(info) {
    const t0 = Date.now();
    let last = 0;
    const buf = await ghGet(GITHUB_RAW + info.file, (got, total) => {
      const now = Date.now();
      if (now - last < 200 && got < total) return;
      last = now;
      const sec = Math.max((now - t0) / 1000, 0.05);
      onProgress({ phase: 'download', done: got, total: total || info.size || got, speed: got / sec });
    });
    if (!buf) throw new Error('ERR_UPDATE_DOWNLOAD');
    onProgress({ phase: 'download', done: buf.length, total: buf.length });
    return buf;
  }

  async function installAsync() {
    const info = latest && pack.compareVersions(latest.version, currentVersion()) > 0 ? latest : null;
    if (!info) throw new Error('ERR_UPDATE_NONE');
    const gz = await download(info);
    onProgress({ phase: 'verify' });
    const hash = pack.sha256(gz);
    if (hash !== info.sha256 || !pack.verify(PLATFORM, info.version, hash, info.sig)) throw new Error('ERR_UPDATE_SIGNATURE');
    beforeInstall(info.version);
    const version = String(info.version).replace(/[^\d.]/g, '');
    const dir = path.join(root(), version);
    const tmp = `${dir}.indiriliyor`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const unpacked = pack.extractPack(gz, tmp);
    const pkgFile = path.join(tmp, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    if (unpacked.version !== info.version || pkg.version !== info.version || !fs.existsSync(path.join(tmp, 'electron', 'main.js'))) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error('ERR_UPDATE_BAD_PACK');
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
    const activeFile = path.join(root(), 'aktif.json');
    fs.writeFileSync(`${activeFile}.tmp`, JSON.stringify({ version: info.version, tries: 0, installedAt: new Date().toISOString() }));
    fs.renameSync(`${activeFile}.tmp`, activeFile);
    cleanup(info.version);
    installed = info.version;
    onProgress({ phase: 'done', version: info.version });
    return { installed: info.version };
  }

  // Şu an çalışan ve yeni kurulan sürüm dışındaki eski güncelleme klasörleri silinir
  function cleanup(keepVersion) {
    const keep = new Set([keepVersion, currentVersion()]);
    try {
      for (const name of fs.readdirSync(root())) {
        const full = path.join(root(), name);
        if (/^\d+(\.\d+)*(\.indiriliyor)?$/.test(name) && !keep.has(name) && fs.statSync(full).isDirectory()) {
          fs.rmSync(full, { recursive: true, force: true });
        }
      }
    } catch {
      // önemli değil
    }
  }

  function install() {
    if (!installing) installing = installAsync().finally(() => { installing = null; });
    return installing;
  }

  return { check, install, isInstalling: () => !!installing, installedVersion: () => installed };
}

module.exports = { createUpdater, PLATFORM };
