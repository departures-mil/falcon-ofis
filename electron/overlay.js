// v1.19: uygulama içinden indirilen güncellemeyi açılışta devreye alır.
// Güncelleme "Falcon Ofis Veri/guncelleme/<sürüm>/" klasörüne açılır ve aktif.json ile seçilir; program
// dosyalarının üzerine yazılmaz. Bu dosya programın kendi paketinde durur ve her açılışta ilk çalışan koddur,
// bu yüzden sade tutulmalıdır. Yeni sürüm üst üste 3 kez açılamazsa kendi sürümüyle açılır.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { app } = require('electron');

const MAX_TRIES = 3;

function compare(a, b) {
  const pa = String(a || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// main.js'deki veri klasörü seçiminin aynısı (taşınabilir sürümde programın yanındaki "Falcon Ofis Veri")
function updateRoot() {
  if (process.env.FALCON_TEST_UPDATE_DIR) return process.env.FALCON_TEST_UPDATE_DIR;
  if (app.isPackaged && process.platform === 'win32') {
    const portableDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath), 'Falcon Ofis Veri');
    try {
      fs.accessSync(portableDir, fs.constants.W_OK);
      return path.join(portableDir, 'guncelleme');
    } catch {
      // AppData
    }
  }
  return path.join(app.getPath('userData'), 'guncelleme');
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

function writeJson(file, data) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
  fs.renameSync(`${file}.tmp`, file);
}

// Güncelleme kullanılacaksa onu çalıştırır ve true döner; yoksa false (programın kendi sürümü açılır)
function loadOverlay() {
  if (global.__falconOverlay !== undefined) return false;
  global.__falconOverlay = null;
  if (!app.isPackaged && !process.env.FALCON_TEST_UPDATE_DIR) return false;
  try {
    const root = updateRoot();
    const activeFile = path.join(root, 'aktif.json');
    const active = readJson(activeFile);
    if (!active?.version) return false;
    const baseDir = path.join(__dirname, '..');
    const baseVersion = readJson(path.join(baseDir, 'package.json'))?.version || app.getVersion();
    const dir = path.join(root, String(active.version).replace(/[^\d.]/g, ''));
    const pkg = readJson(path.join(dir, 'package.json'));
    // Sonradan tam paket (daha yeni) kurulduysa veya güncelleme farklı Electron sürümü istiyorsa kullanılmaz
    if (!pkg || pkg.version !== active.version || compare(pkg.version, baseVersion) <= 0) return false;
    if (pkg.falconElectron && String(pkg.falconElectron) !== String(process.versions.electron).split('.')[0]) return false;
    if (!fs.existsSync(path.join(dir, 'electron', 'main.js'))) return false;
    const tries = Number(active.tries) || 0;
    if (tries >= MAX_TRIES) {
      fs.renameSync(activeFile, path.join(root, `aktif-acilamadi-${active.version}.json`));
      return false;
    }
    writeJson(activeFile, { ...active, tries: tries + 1 });

    global.__falconOverlay = {
      version: pkg.version,
      dir,
      baseDir,
      baseVersion,
      // Pencere sorunsuz açılınca çağrılır
      ok: () => {
        const cur = readJson(activeFile);
        if (cur && cur.version === active.version && cur.tries) writeJson(activeFile, { ...cur, tries: 0 });
      },
    };
    // Programın kendi paketindeki kütüphaneler (sql.js gibi) güncellemeden de bulunur
    const baseModules = path.join(baseDir, 'node_modules');
    process.env.NODE_PATH = [baseModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
    Module._initPaths();
    app.getVersion = () => pkg.version;
    require(path.join(dir, 'electron', 'main.js'));
    return true;
  } catch (err) {
    console.error('güncelleme açılamadı, programın kendi sürümü kullanılıyor', err);
    try {
      fs.writeFileSync(path.join(updateRoot(), 'son-hata.txt'), `${new Date().toISOString()}\n${err?.stack || err}`);
    } catch {
      // yazılamadı
    }
    global.__falconOverlay = null;
    delete app.getVersion;
    return false;
  }
}

module.exports = { loadOverlay, updateRoot, compare };
