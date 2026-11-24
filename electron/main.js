// v1.19: uygulama içinden indirilmiş daha yeni bir sürüm varsa o çalışır, bu dosyanın geri kalanı atlanır (bkz. overlay.js)
if (require('./overlay').loadOverlay()) return;

const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, Notification, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { Database } = require('./db');
const { createServices } = require('./services');
const { fetchOnlineRates, fetchCryptoPrices } = require('./rates');
const { checkWallets } = require('./wallets');
const backup = require('./backup');
const { createSync } = require('./sync');
const Kullanim = require('./kullanim'); // v1.54: Firebase günlük kullanım sayacı (Ayarlar > Kullanım Limitleri)
const firebaseConfig = require('./firebase-config');
const { createSecurity } = require('./security');
const { updateRoot, compare: compareVersions } = require('./overlay');
// v1.58: ortak çekirdek (pencere düğmeleri, GitHub Releases güncellemesi: yama / tam app.asar / kurulum, ana süreç hataları)
const fcMain = require('../cekirdek/electron/fc-electron-main');
// v1.50: Wi‑Fi (internetsiz) eşitleme
const lanServer = require('./lan-server');
const { createLanStore } = require('./lan-db');
const { FILE_COLUMNS } = require('./sync');

// Taşınabilir sürüm: veriler programın yanındaki "Falcon Ofis Veri" klasöründe tutulur,
// böylece klasör USB belleğe kopyalanınca kayıtlar da birlikte taşınır. Yazılamıyorsa AppData kullanılır.
// v1.58: kurulumlu sürüm (NSIS, %LOCALAPPDATA%\Programs) verisini kurulum klasörüne YAZMAZ (kaldırma / yeni kurulum
// o klasörü siler): önce "veri-konumu.json"un gösterdiği eski veri klasörü (eski taşınabilir sürümden kuruluma geçişte
// köprü yazar), yoksa %APPDATA%\Falcon Ofis. Veri klasörü hiçbir zaman taşınmaz ya da kopyalanmaz.
const EXE_DIR = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
const NSIS_INSTALL = app.isPackaged && process.platform === 'win32' && fs.existsSync(path.join(EXE_DIR, 'Uninstall Falcon Ofis.exe'));
const defaultUserData = () => path.join(app.getPath('appData'), 'Falcon Ofis');
const pointerFile = () => path.join(defaultUserData(), 'veri-konumu.json');
const hasData = (dir) => { try { return fs.existsSync(path.join(dir, 'data', 'falcon-ofis.db')); } catch { return false; } };
if (NSIS_INSTALL) {
  try {
    const p = JSON.parse(fs.readFileSync(pointerFile(), 'utf8'));
    if (p && p.dir && hasData(p.dir)) {
      fs.accessSync(p.dir, fs.constants.W_OK);
      app.setPath('userData', p.dir);
    }
  } catch {
    // varsayılan: %APPDATA%\Falcon Ofis
  }
} else if (app.isPackaged && process.platform === 'win32') {
  const portableDir = path.join(EXE_DIR, 'Falcon Ofis Veri');
  try {
    fs.mkdirSync(portableDir, { recursive: true });
    fs.accessSync(portableDir, fs.constants.W_OK);
    app.setPath('userData', portableDir);
  } catch {
    // AppData klasöründe devam edilir
  }
}
// Kurulum programına geçmeden önce: yeni kurulum bu veri klasörünü kullansın (yalnız konum yazılır, veri yerinde kalır)
function writeDataPointer() {
  if (path.resolve(app.getPath('userData')) === path.resolve(defaultUserData())) return;
  try {
    fs.mkdirSync(defaultUserData(), { recursive: true });
    fs.writeFileSync(`${pointerFile()}.tmp`, JSON.stringify({ dir: app.getPath('userData'), from: app.getVersion(), at: new Date().toISOString() }));
    fs.renameSync(`${pointerFile()}.tmp`, pointerFile());
  } catch (err) {
    console.error('veri-konumu.json yazılamadı', err.message);
  }
}

// v1.30: Windows bildirimlerinin görünmesi için uygulama kimliği ve Başlat menüsünde bu kimliği taşıyan bir kısayol gerekir
// (taşınabilir sürümde kurulum programı olmadığından kısayol burada oluşturulur / program yeri değiştiyse güncellenir).
const APP_ID = 'com.falcon.ofis';
function setupWindowsNotifications() {
  if (process.platform !== 'win32') return;
  app.setAppUserModelId(APP_ID);
  if (!app.isPackaged) return;
  const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Falcon Ofis.lnk');
  let current = null;
  try { current = shell.readShortcutLink(lnk); } catch { /* kısayol yok */ }
  if (current && current.target === target && current.appUserModelId === APP_ID) return;
  shell.writeShortcutLink(lnk, current ? 'replace' : 'create', { target, cwd: path.dirname(target), appUserModelId: APP_ID, description: 'Falcon Ofis' });
}

let mainWindow = null;
let database = null;
let services = null;
let sync = null;
let security = null;
let lanStore = null;
// v1.45: program kapatılınca sistem tepsisinde (saatin yanında) çalışmaya devam eder; cüzdanlar arka planda izlenir
let tray = null;
let quitting = false;
const startHidden = process.argv.includes('--hidden');

const dataDir = () => path.join(app.getPath('userData'), 'data');
const filesDir = () => path.join(dataDir(), 'files');
const dbPath = () => path.join(dataDir(), 'falcon-ofis.db');
// Otomatik yedekler: veri klasöründe ve ayrıca Belgeler\Falcon Ofis Yedekler'de (program klasörü silinse bile kalır)
const backupsDir = () => path.join(dataDir(), 'yedekler');
// FALCON_TEST_DOCS_DIR yalnızca otomatik testlerde (Belgeler klasörü kirlenmesin)
const docsBackupDir = () => path.join(process.env.FALCON_TEST_DOCS_DIR || app.getPath('documents'), 'Falcon Ofis Yedekler');
const localDate = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// Uygulama içindeki dosyalar (ürün fotoğrafı, dekont) falcon://files/... adresinden gösterilir
protocol.registerSchemesAsPrivileged([{ scheme: 'falcon', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function safeFilePath(rel) {
  const full = path.resolve(filesDir(), rel);
  if (!full.startsWith(path.resolve(filesDir()) + path.sep)) throw new Error('ERR_BAD_PATH');
  return full;
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };
const FILTERS = {
  image: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
  receipt: [{ name: 'PDF / JPEG / PNG', extensions: ['pdf', 'jpg', 'jpeg', 'png'] }],
};

let sessionWindowMode = 'fullscreen';

function createWindow() {
  // kullanıcının kuralı: program HER açılışta tam ekran açılır (1.58.1). Ayarlar > Görünüm'deki "pencere" seçimi yalnız o oturum için geçerlidir.
  sessionWindowMode = 'fullscreen';
  const fullscreen = true;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    fullscreen,
    backgroundColor: '#070b14',
    autoHideMenuBar: true,
    show: false,
    title: 'Falcon Ofis',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  installCore(mainWindow);
  // v1.19: yeni sürüm sorunsuz açıldı (açılamazsa birkaç denemeden sonra eski sürüme dönülür)
  mainWindow.webContents.once('did-finish-load', () => global.__falconOverlay?.ok());
  mainWindow.webContents.on('did-finish-load', () => setTimeout(kullanimGonder, 500));
  mainWindow.webContents.on('did-finish-load', () => setTimeout(forwardPendingCrash, 3000));
  if (process.env.FALCON_SMOKE === '1') smokeTest(mainWindow); // yalnızca otomatik açılış testi (test/electron-smoke.test.js)
  mainWindow.once('ready-to-show', () => {
    if (startHidden && !global.__falconShowRequested) return; // Windows açılışında: yalnızca sistem tepsisinde
    revealWindow();
  });
  // Kapat düğmesi programı kapatmaz: pencere gizlenir, kayıt / cüzdan izleme / eşitleme sürer
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    hideToTray();
  });
  mainWindow.on('session-end', () => { quitting = true; });

  // F11 ile tam ekran aç / kapat
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ---------- v1.58: ortak çekirdek ----------
// fcMain.install: Küçült / Orta / Tam ekran / Kapat (fc:win:*), GitHub indirmesi (fc:net:download), ana süreç hataları → arayüz
// (çökme raporu), Asistan Agent paylaşımı. Falcon'un açılışı (tepside gizli başlama, Ayarlar'daki pencere kipi) kendi kodunda
// kaldığından fcMain'in "her açılışta tam ekran göster" dinleyicisi çıkarılır (varsayılan kip zaten tam ekran).
// Güncelleme takası fcMain.stage + swapAndRelaunch ile yapılır; öncesinde tam yedek alınır, kurulum kanalında veri konumu yazılır.
let fcCore = null;
function bridgeInfo() {
  const ov = global.__falconOverlay || null;
  let canSwap = false;
  if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE) {
    try {
      const asar = path.join(process.resourcesPath, 'app.asar');
      fs.accessSync(process.resourcesPath, fs.constants.W_OK);
      canSwap = fs.existsSync(asar);
    } catch {
      canSwap = false;
    }
  }
  const semver = (v) => (/^\d+\.\d+\.\d+$/.test(String(v || '')) ? String(v) : /^\d+\.\d+$/.test(String(v || '')) ? `${v}.0` : '0.0.0');
  return {
    overlay: !!ov, // eski kabuk: bu sürüm eski güncelleyicinin klasöründen (Falcon Ofis Veri/guncelleme) çalışıyor
    baseVersion: semver(ov ? ov.baseVersion : app.getVersion()),
    version: app.getVersion(),
    canSwap, // program klasörü yazılabilir: app.asar yerinde yenilenir (win-app); değilse kurulum (win-setup)
    channel: canSwap ? 'win-app' : 'win-setup',
    portableExe: !!process.env.PORTABLE_EXECUTABLE_FILE,
    nsis: NSIS_INSTALL,
    packaged: app.isPackaged,
    dataDir: app.getPath('userData'),
    noUpdate: process.env.FALCON_TEST_NO_UPDATE === '1', // yalnızca otomatik testler / ekran görüntüleri
  };
}
const codeErr = (code) => Object.assign(new Error(code), { code });
const sha256hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
function beforeUpdate(meta, setup) {
  quitting = true;
  try {
    if (database) {
      fs.mkdirSync(backupsDir(), { recursive: true });
      fs.writeFileSync(path.join(backupsDir(), `guncelleme-oncesi-v${app.getVersion()}-${stamp()}.falcon`), fullBackupBuffer());
      database.save();
    }
  } catch (err) {
    console.error('güncelleme öncesi yedek', err);
  }
  if (setup) writeDataPointer();
}
function runSetupExe(buf, meta) {
  if (process.platform !== 'win32') throw codeErr('SETUP_WINDOWS_ONLY');
  if (!meta || !meta.targetSha256 || sha256hex(buf) !== String(meta.targetSha256).toLowerCase()) throw codeErr('BAD_HASH');
  if (meta.targetSize && buf.length !== Number(meta.targetSize)) throw codeErr('BAD_SIZE');
  const name = String(meta.file || 'FalconOfis-Setup.exe').replace(/[^\w.-]/g, '_');
  const dir = path.join(app.getPath('temp'), `falcon-kurulum-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, /\.exe$/i.test(name) ? name : `${name}.exe`);
  fs.writeFileSync(exe, buf);
  if (sha256hex(fs.readFileSync(exe)) !== sha256hex(buf)) throw codeErr('STAGE_VERIFY');
  beforeUpdate(meta, true);
  require('child_process').spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  setTimeout(() => app.exit(0), 400);
  return 'restarting';
}
// 1.58.2: güvenli takas (Windows) electron/takas.js'te: gizli betik, kapanmayan programı zorla kapatma, Unicode yollar.
function swapAndRelaunchSafe(st) {
  if (process.platform !== 'win32') return fcMain.swapAndRelaunch({}, st);
  try {
    require('./takas').start({ tmp: app.getPath('temp'), pid: process.pid, target: st.target, next: st.next, exe: process.execPath,
      args: process.argv.slice(1).filter((a) => !/^--fc-/.test(a)) });
  } catch (err) {
    console.error('takas betiği başlatılamadı', err);
    return fcMain.swapAndRelaunch({}, st);
  }
  setTimeout(() => app.exit(0), 300);
}
function installCore(win) {
  const before = new Set(win.listeners('ready-to-show'));
  fcCore = fcMain.install(win, { channel: bridgeInfo().channel });
  for (const f of win.listeners('ready-to-show')) if (!before.has(f)) win.removeListener('ready-to-show', f);
  const res = (f) => async (e, ...a) => {
    if (BrowserWindow.fromWebContents(e.sender) !== win) return { ok: false, error: 'FORBIDDEN' };
    try {
      return { ok: true, data: await f(...a) };
    } catch (err) {
      return { ok: false, error: err.code || err.message || 'ERR' };
    }
  };
  const isSetup = (meta) => !!(meta && (/setup/i.test(String(meta.channel || '')) || /\.exe$/i.test(String(meta.file || ''))));
  const asarFile = () => path.join(process.resourcesPath, 'app.asar');
  ipcMain.removeHandler('fc:update:patch');
  ipcMain.handle('fc:update:patch', res((bytes, meta) => {
    const ofs = require('original-fs');
    const out = fcMain.applyFcd1(ofs.readFileSync(asarFile()), Buffer.from(bytes));
    const st = fcMain.stage({}, out, meta);
    beforeUpdate(meta, false);
    swapAndRelaunchSafe(st);
    return 'restarting';
  }));
  ipcMain.removeHandler('fc:update:full');
  ipcMain.handle('fc:update:full', res((bytes, meta) => {
    const buf = Buffer.from(bytes);
    if (isSetup(meta)) return runSetupExe(buf, meta);
    const st = fcMain.stage({}, buf, meta);
    beforeUpdate(meta, false);
    swapAndRelaunchSafe(st);
    return 'restarting';
  }));
}
// Ana süreç çökmesi: program kendini yeniden başlattığı için rapor dosyaya bırakılır, sonraki açılışta arayüze (FC.crash) iletilir
const crashFile = () => path.join(app.getPath('userData'), 'cokme-bekleyen.json');
function rememberCrash(err) {
  try {
    let list = [];
    try { list = JSON.parse(fs.readFileSync(crashFile(), 'utf8')) || []; } catch { list = []; }
    list.push({ message: String((err && err.message) || err), stack: String((err && err.stack) || '') });
    fs.writeFileSync(crashFile(), JSON.stringify(list.slice(-5)));
  } catch {
    // yazılamadı
  }
}
function forwardPendingCrash() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(crashFile(), 'utf8')) || []; } catch { return; }
  try { fs.rmSync(crashFile(), { force: true }); } catch { /* yok */ }
  for (const m of list) try { fcCore?.forward(m); } catch { /* yok */ }
}
// Eski güncelleyicinin (overlay) klasöründe bu sürümden eski / aynı program kopyaları kaldıysa temizlenir (yalnız program
// dosyaları; kayıtlar orada değildir). Bu sürüm overlay'den çalışıyorsa dokunulmaz.
function cleanupOldOverlays() {
  if (global.__falconOverlay) return;
  try {
    const root = updateRoot();
    for (const name of fs.readdirSync(root)) {
      const full = path.join(root, name);
      const m = /^(\d+(?:\.\d+)*)(\.indiriliyor)?$/.exec(name);
      if (m && compareVersions(m[1], app.getVersion()) <= 0 && fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true, force: true });
    }
    const act = JSON.parse(fs.readFileSync(path.join(root, 'aktif.json'), 'utf8'));
    if (act && compareVersions(act.version, app.getVersion()) <= 0) fs.renameSync(path.join(root, 'aktif.json'), path.join(root, `aktif-eski-${Date.now()}.json`));
  } catch {
    // klasör yok
  }
}

// Otomatik açılış testi: arayüz yüklenince durumu tek satır JSON olarak yazar ve çıkar
function smokeTest(win) {
  const errors = [];
  win.webContents.on('console-message', (e) => {
    const level = e.level !== undefined ? e.level : e.params && e.params.level;
    const msg = String(e.message || (e.params && e.params.message) || '');
    if ((level === 'error' || level === 3) && !/net::|Failed to load resource|ERR_|favicon/.test(msg)) errors.push(msg.slice(0, 300));
  });
  win.webContents.once('did-finish-load', () => setTimeout(async () => {
    let out = {};
    try {
      out = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const q = (s) => document.querySelector(s);
        const o = { fc: !!window.FC, host: window.FC && FC.host.kind, coreVersion: window.FC && FC.version, appVersion: (await window.falcon.appInfo()).version,
          info: await window.falcon.kurulum.info(), scheme: document.documentElement.dataset.scheme, lang: document.documentElement.lang,
          agentBtn: !!q('.topbar-actions .agent-btn'), updateBtn: !!q('.topbar-actions .fc-update-wrap .update-act'), oldUpdate: typeof (window.falcon.update), 
          win: [...document.querySelectorAll('.topbar-actions .win-controls button')].map((b) => b.dataset.win || 'falcon'),
          bridgeModal: [...document.querySelectorAll('.fc-layer .modal h2')].map((h) => h.textContent.trim()) };
        location.hash = '#/settings'; await wait(2500);
        o.settings = [...document.querySelectorAll('.settings-grid > *')].map((e) => e.dataset.fcCard || e.id || (e.classList.contains('look-card') ? 'look' : 'falcon'));
        o.schemes = document.querySelectorAll('.look-card .fc-scheme-row .fc-scheme').length;
        o.klasik = !!document.querySelector('.fc-scheme[data-id=klasik]');
        return o; })()`);
    } catch (err) {
      out = { error: String(err && err.message || err) };
    }
    out.errors = errors;
    out.fullscreen = win.isFullScreen();
    process.stdout.write(`FALCON_SMOKE ${JSON.stringify(out)}\n`);
    quitting = true;
    setTimeout(() => app.exit(0), 200);
  }, Number(process.env.FALCON_SMOKE_WAIT || 6000)));
}

function revealWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const fullscreen = sessionWindowMode === 'fullscreen';
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  if (fullscreen) mainWindow.setFullScreen(true);
  else mainWindow.maximize();
  mainWindow.focus();
}
function showWindow() {
  global.__falconShowRequested = true;
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  else revealWindow();
}
const TRAY_TEXT = {
  tr: { open: 'Falcon Ofis\'i aç', check: 'Cüzdanları şimdi kontrol et', autostart: 'Windows açılınca başlat', quit: 'Tamamen kapat',
    tip: 'Falcon Ofis · cüzdanlar izleniyor', bgTitle: 'Falcon Ofis arka planda çalışıyor', bgBody: 'Cüzdanlara gelen paralar kaydedilmeye devam ediyor. Açmak için saatin yanındaki Falcon simgesine tıklayın; tamamen kapatmak için sağ tıklayın.',
    quitAsk: 'Falcon Ofis tamamen kapatılsın mı?', quitDetail: 'Kapatırsanız hatırlatmalar, son uyarılar ve cüzdan kontrolü durur. Program bilgisayar yeniden açılınca kendiliğinden yine başlar.', quitYes: 'Tamamen kapat', quitNo: 'Arka planda çalışsın', walletIn: 'Cüzdana para geldi', walletOut: 'Cüzdandan para çıktı', finalTitle: 'Son uyarı', finalNotPaid: 'henüz ödenmedi' },
  en: { open: 'Open Falcon Ofis', check: 'Check wallets now', autostart: 'Start with Windows', quit: 'Quit completely',
    tip: 'Falcon Ofis · watching wallets', bgTitle: 'Falcon Ofis is running in the background', bgBody: 'Incoming wallet payments are still being recorded. Click the Falcon icon next to the clock to open it; right-click to quit completely.',
    quitAsk: 'Quit Falcon Ofis completely?', quitDetail: 'If you quit, reminders, final reminders and wallet checks stop. The program starts again automatically when the computer restarts.', quitYes: 'Quit completely', quitNo: 'Keep running in background', walletIn: 'Payment received', walletOut: 'Payment sent', finalTitle: 'Final reminder', finalNotPaid: 'not paid yet' },
  ar: { open: 'فتح Falcon Ofis', check: 'فحص المحافظ الآن', autostart: 'التشغيل مع ويندوز', quit: 'إغلاق نهائي',
    tip: 'Falcon Ofis · مراقبة المحافظ', bgTitle: 'Falcon Ofis يعمل في الخلفية', bgBody: 'يستمر تسجيل المبالغ الواردة إلى المحافظ. انقر على أيقونة Falcon بجانب الساعة لفتحه، وانقر بزر الفأرة الأيمن للإغلاق النهائي.',
    quitAsk: 'إغلاق Falcon Ofis نهائياً؟', quitDetail: 'عند الإغلاق تتوقف التذكيرات والتنبيهات الأخيرة وفحص المحافظ. يعود البرنامج للعمل تلقائياً عند إعادة تشغيل الحاسوب.', quitYes: 'إغلاق نهائي', quitNo: 'يبقى يعمل في الخلفية', walletIn: 'وصلت دفعة إلى المحفظة', walletOut: 'خرجت دفعة من المحفظة', finalTitle: 'تنبيه أخير', finalNotPaid: 'لم يُدفع بعد' },
};
function trayText() {
  let lang = 'tr';
  try { lang = database?.get("SELECT value FROM settings WHERE key = 'language'")?.value || 'tr'; } catch { /* varsayılan */ }
  return TRAY_TEXT[lang] || TRAY_TEXT.tr;
}
const bgFile = () => path.join(app.getPath('userData'), 'arka-plan.json');
function bgSettings() {
  try { return { autostart: true, hintShown: false, ...JSON.parse(fs.readFileSync(bgFile(), 'utf8')) }; } catch { return { autostart: true, hintShown: false }; }
}
function setBgSettings(patch) {
  try { fs.writeFileSync(bgFile(), JSON.stringify({ ...bgSettings(), ...patch })); } catch (err) { console.error('arka-plan.json', err.message); }
}
// Windows'a giriş yapılınca program kendiliğinden (gizli, sistem tepsisinde) açılır
function applyAutostart() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    app.setLoginItemSettings({ openAtLogin: true, path: exe, args: ['--hidden'], name: 'Falcon Ofis' });
    setBgSettings({ autostart: true });
    installWatchdog(exe);
  } catch (err) {
    console.error('otomatik başlatma', err.message);
  }
}
function buildTrayMenu() {
  if (!tray) return;
  const t = trayText();
  tray.setToolTip(t.tip);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.open, click: showWindow },
    { label: t.check, click: () => backgroundWalletCheck(true) },
    { type: 'separator' },
    { type: 'separator' },
    { label: t.quit, click: askQuit },
  ]));
}
function createTray() {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
    buildTrayMenu();
  } catch (err) {
    console.error('sistem tepsisi', err);
    tray = null;
  }
}
function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!tray) createTray();
  if (!tray) { quitCompletely(); return; } // tepsi kurulamadıysa eskisi gibi kapanır
  global.__falconShowRequested = false;
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
  mainWindow.hide();
  // Gizlenen program yeniden açılınca PIN sorulur
  if (security?.lock()) mainWindow.webContents.reload();
  buildTrayMenu();
  if (!bgSettings().hintShown && Notification.isSupported()) {
    const t = trayText();
    new Notification({ title: t.bgTitle, body: t.bgBody }).show();
    setBgSettings({ hintShown: true });
  }
}
// v1.48: Windows Görev Zamanlayıcı bekçisi — 5 dakikada bir programı gizli başlatmayı dener.
// Program zaten açıksa ikinci kopya hemen kapanır; kullanıcı "Tamamen kapat" dediyse bilgisayar yeniden açılana kadar başlatmaz.
function installWatchdog(exe) {
  try {
    const want = `3|${exe}`;
    if (bgSettings().watchdog === want) return;
    const { execFile } = require('child_process');
    execFile('schtasks', ['/Create', '/F', '/SC', 'MINUTE', '/MO', '5', '/TN', 'Falcon Ofis Bekci', '/TR', `"${exe}" --hidden --watchdog`],
      { windowsHide: true }, (err) => {
        if (err) console.error('bekçi görevi', err.message);
        else setBgSettings({ watchdog: want });
      });
  } catch (err) {
    console.error('bekçi görevi', err.message);
  }
}
async function askQuit() {
  const t = trayText();
  const { response } = await dialog.showMessageBox({
    type: 'question', title: 'Falcon Ofis', message: t.quitAsk, detail: t.quitDetail,
    buttons: [t.quitNo, t.quitYes], defaultId: 0, cancelId: 0, noLink: true,
  });
  if (response !== 1) return;
  setBgSettings({ userQuitAt: Date.now() });
  quitCompletely();
}
function quitCompletely() {
  quitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  else shutdown();
}

// v1.45: cüzdan kontrolü ana süreçte; pencere açık olsun olmasın her "wallet_check_seconds" saniyede bir yapılır
let walletCheck = null;
let lastWalletCheck = 0;
function runWalletCheck() {
  if (!walletCheck) {
    lastWalletCheck = Date.now();
    walletCheck = checkWallets((n, p) => services.call(n, p), (url, opts) => net.fetch(url, opts)).finally(() => {
      walletCheck = null;
      lastWalletCheck = Date.now();
    });
  }
  return walletCheck;
}
function walletIntervalMs() {
  let sec = 60;
  try { sec = Number(database?.get("SELECT value FROM settings WHERE key = 'wallet_check_seconds'")?.value) || 60; } catch { /* varsayılan */ }
  return Math.min(86400, Math.max(15, sec)) * 1000;
}
const fmtAmount = (n) => String(Math.round((Number(n) || 0) * 1e8) / 1e8);
async function backgroundWalletCheck(force = false) {
  if (!services || !database) return;
  try {
    if (services.call('fixKnownDuplicates', {}).fixed) sendToWindow('sync:changed');
  } catch (err) {
    console.error('çift kayıt düzeltmesi', err.message);
  }
  if (!force && (walletCheck || Date.now() - lastWalletCheck < walletIntervalMs())) return;
  try {
    const r = await runWalletCheck();
    const added = r?.added || [];
    if (!added.length && !(r?.swaps || []).length) return;
    sendToWindow('sync:changed');
    // Yeni kayıt hemen buluta gönderilir (telefonda da görünsün)
    if (sync?.status().connected) sync.syncNow().catch(() => {});
    if (!Notification.isSupported()) return;
    const t = trayText();
    for (const a of added.slice(0, 5)) {
      const who = a.wallet_label ? `${a.wallet_label} · ` : '';
      const n = new Notification({ title: a.direction === 'out' ? t.walletOut : t.walletIn, body: `${who}${a.label}: ${a.direction === 'out' ? '−' : '+'}${fmtAmount(a.amount)} ${a.coin} · ${a.date}` });
      n.on('click', showWindow);
      n.show();
    }
  } catch (err) {
    console.error('arka plan cüzdan kontrolü', err);
  }
}
// v1.47: Düzenli İnfak / Aidat "son uyarı" (gün + saat). Program tepside gizliyken de o dakikada Windows bildirimi verir.
// Aynı uyarı bir kez gösterilir (arka-plan.json → finalFired: { planId: final_at }).
function localStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function checkFinalAlerts() {
  if (!database || !Notification.isSupported()) return;
  let rows = [];
  try {
    rows = database.all('SELECT * FROM recurring_plans WHERE active = 1 AND final_at IS NOT NULL AND final_at <= ?', [localStamp()]);
  } catch {
    return; // tablo henüz yok
  }
  if (!rows.length) return;
  const fired = { ...(bgSettings().finalFired || {}) };
  const t = trayText();
  let changed = false;
  for (const r of rows) {
    if (fired[r.id] === r.final_at) continue;
    fired[r.id] = r.final_at;
    changed = true;
    const amount = r.amount != null ? ` · ${fmtAmount(r.amount)} ${r.currency_code || ''}` : '';
    const body = `${r.title}${r.recipient ? ` → ${r.recipient}` : ''}${amount} · ${t.finalNotPaid}${r.next_date ? ` (${r.next_date})` : ''}`;
    try {
      const n = new Notification({ title: `⚠ ${t.finalTitle}`, body, timeoutType: 'never', urgency: 'critical' });
      n.on('click', showWindow);
      n.show();
    } catch (err) {
      console.error('son uyarı', err.message);
    }
  }
  if (changed) setBgSettings({ finalFired: fired });
}
function startBackgroundJobs() {
  setTimeout(checkFinalAlerts, 12000);
  setInterval(checkFinalAlerts, 20000);
  setTimeout(() => backgroundWalletCheck(true), 8000);
  setInterval(() => backgroundWalletCheck(false), 10000);
  // Program günlerce açık kalabilir: her gün bir otomatik tam yedek
  let lastBackupDay = localDate();
  setInterval(() => {
    if (localDate() === lastBackupDay) return;
    lastBackupDay = localDate();
    if (database) autoBackup();
  }, 10 * 60 * 1000);
}

// İş kuralı hatalarını ekrana kod olarak taşır (ERR_INSUFFICIENT_STOCK gibi)
function wrap(fn) {
  return async (...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      const code = /^ERR_[A-Z0-9_]+$/.test(err.message) ? err.message : 'ERR_UNEXPECTED';
      if (code === 'ERR_UNEXPECTED') console.error(err);
      return { ok: false, error: code, detail: err.detail ?? (code === 'ERR_UNEXPECTED' ? err.message : null) };
    }
  };
}

function importFiles(kind, multiple) {
  const result = dialog.showOpenDialogSync(mainWindow, {
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: FILTERS[kind] ?? FILTERS.image,
  });
  if (!result) return [];
  const folder = kind === 'receipt' ? 'receipts' : 'images';
  fs.mkdirSync(path.join(filesDir(), folder), { recursive: true });
  return result.map((src) => {
    const ext = path.extname(src).toLowerCase();
    if (!MIME[ext]) throw new Error('ERR_FILE_TYPE');
    const rel = `${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.copyFileSync(src, safeFilePath(rel));
    return { relPath: rel, originalName: path.basename(src), mime: MIME[ext] };
  });
}

// PIN girilmeden kayıtlara erişilemez (dil ve menü düzeni giriş ekranı için okunabilir)
const OPEN_SETTINGS = ['language', 'nav_layout'];
function locked() {
  if (!security.isUnlocked()) throw new Error('ERR_LOCKED');
}
function handle(channel, fn) {
  ipcMain.handle(channel, (...args) => {
    locked();
    return fn(...args);
  });
}

// Döküm sayfasını gizli bir pencerede açıp PDF'e çevirir; fotoğraflar sayfanın içine gömülür
async function htmlToPdf(html) {
  const inlined = String(html).replace(/src="falcon:\/\/files\/([^"]+)"/g, (m, enc) => {
    try {
      const rel = enc.split('/').map(decodeURIComponent).join('/');
      const full = safeFilePath(rel);
      const mime = MIME[path.extname(full).toLowerCase()];
      if (!mime || !mime.startsWith('image/') || !fs.existsSync(full)) return 'src=""';
      return `src="data:${mime};base64,${fs.readFileSync(full).toString('base64')}"`;
    } catch {
      return 'src=""';
    }
  });
  const tmp = path.join(app.getPath('temp'), `falcon-dokum-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, inlined, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await win.loadFile(tmp);
    return await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, landscape: true, pageSize: 'A4' });
  } finally {
    win.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

function registerIpc() {
  ipcMain.handle('security:status', () => security.status());
  ipcMain.handle('security:setup', wrap((_e, pin) => security.setup(pin)));
  ipcMain.handle('security:unlock', wrap((_e, pin) => security.unlock(pin)));
  ipcMain.handle('security:recover', wrap((_e, code, pin) => security.recover(code, pin)));
  ipcMain.handle('security:changePin', wrap((_e, oldPin, pin) => security.changePin(oldPin, pin)));
  ipcMain.handle('security:newRecoveryCode', wrap((_e, pin) => security.newRecoveryCode(pin)));
  ipcMain.handle('window:getMode', () => sessionWindowMode);
  ipcMain.handle('window:setMode', wrap((_e, mode) => {
    locked();
    // 1.58.1: kalıcı kaydedilmez — bir sonraki açılış yine tam ekran (Orta / Küçült düğmeleri de oturumluk)
    sessionWindowMode = mode === 'window' ? 'window' : 'fullscreen';
    if (mainWindow) {
      if (mode === 'fullscreen') mainWindow.setFullScreen(true);
      else {
        mainWindow.setFullScreen(false);
        mainWindow.maximize();
      }
    }
    return mode;
  }));

  handle('db:all', (_e, sql, params) => database.all(sql, params));
  // v1.50: Wi‑Fi eşitleme
  handle('lan:info', () => lanServer.info());
  handle('lan:serve', () => lanServer.start());
  handle('lan:stop', () => lanServer.stop(true));
  handle('lan:reset', () => lanServer.resetKey());
  handle('lan:ips', () => lanServer.lanIps());
  // Yöneticiye mesaj: iki bağımsız kanal, biri kabul ederse ulaşmış sayılır.
  //  1) Yöneticinin mesaj kutusu (Firestore "mesajlar", yalnızca ekleme; okuma yok) — her ağdan, etkinleştirme gerektirmez
  //  2) E-posta kopyası (FormSubmit) — Referer'sız isteği reddeder; etkinleştirilmiş site Referer olarak gönderilir
  const __adminSend = async (m) => {
    const msg = String((m && m.message) || '').slice(0, 5000).trim();
    if (!msg) return { ok: false, error: 'empty' };
    const name = String(m.name || '').slice(0, 80).trim(), mail = String(m.email || '').slice(0, 120).trim(), ver = String(app.getVersion());
    const F = (v) => ({ stringValue: String(v || '').slice(0, 4000) });
    const fields = { tur: F('oneri'), uygulama: F('falcon-ofis'), mesaj: F(msg), konu: F('Falcon Ofis · ' + String(m.topic || 'Mesaj')), dil: F(m.lang), surum: F(ver), platform: F('Falcon Ofis · Windows'), zaman: { timestampValue: new Date().toISOString() } };
    if (name) fields.ad = F(name);
    if (mail) fields.iletisim = F(mail);
    const to = Buffer.from('', 'base64').toString().split('').reverse().join('');
    const body = { _subject: 'Falcon Ofis: yeni mesaj', _template: 'table', _captcha: 'false', Ad: name || '-', Mesaj: msg, Surum: ver, Cihaz: 'Windows', Dil: String(m.lang || '') };
    if (mail) { body.email = mail; body._replyto = mail; }
    const inbox = fetch('https://firestore.googleapis.com/v1/projects/comm-calc-103111111/databases/(default)/documents/mesajlar?key=AIzaSyB12RFS6ENPpmnnPsETfjedNH-3hmNWQvA',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }), signal: AbortSignal.timeout(20000) }).then((r) => r.ok, () => false);
    const email = fetch('https://formsubmit.co/ajax/' + to, { method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Referer: 'https://formsubmit.co/', Origin: 'https://formsubmit.co', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({}))).then((j) => String(j.success) === 'true', () => false);
    const [a, b] = await Promise.all([inbox, email]);
    return a || b ? { ok: true } : { ok: false, error: 'network' };
  };
  handle('contact:send', (_e, m) => __adminSend(m));
  handle('lan:http', (_e, method, url, body, ms, key) => lanServer.clientHttp(method, url, body, ms, key));
  handle('lan:find', (_e, port, key, appId) => lanServer.find(port, key, appId));
  handle('lan:export', async () => {
    for (let i = 0; i < 120 && sync && sync.isRunning(); i++) await new Promise((r) => setTimeout(r, 250));
    const st = lanStore.exportState();
    return { state: st, account: lanAccount(), fileColumns: FILE_COLUMNS, files: lanStore.fileRefs(st).filter((r) => syncFiles.exists(r)) };
  });
  handle('lan:apply', (_e, merged, dev) => {
    const local = lanStore.exportState();
    const pv = lanStore.preview(local, merged);
    if (pv.updated || pv.removed) lanBackup();
    const rep = lanStore.applyState(merged, { dev: dev || '' });
    sendToWindow('sync:changed');
    try {
      if (sync) sync.poke();
    } catch {
      // bulut bağlı değil
    }
    return rep;
  });
  handle('lan:readFile', (_e, rel) => (syncFiles.exists(rel) ? Buffer.from(syncFiles.read(rel)).toString('base64') : ''));
  handle('lan:writeFile', (_e, rel, b64) => {
    if (!syncFiles.exists(rel) && b64) syncFiles.write(rel, new Uint8Array(Buffer.from(String(b64), 'base64')));
    return true;
  });
  handle('lan:conflicts', () => lanStore.conflicts(200));
  handle('db:get', (_e, sql, params) => database.get(sql, params));

  ipcMain.handle('api:call', wrap((_e, name, payload) => {
    locked();
    return services.call(name, payload);
  }));

  // v1.42: soru botu. Pencere (CSP) dış adreslere bağlanamadığı için yapay zekâ isteği buradan gider; yalnızca Gemini adresi.
  handle('ai:request', async (_e, { url, body, key } = {}) => {
    if (typeof url !== 'string' || !url.startsWith('https://generativelanguage.googleapis.com/')) throw new Error('ERR_AI_URL');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(key || '') },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      return { status: res.status, data };
    } catch (err) {
      return { status: 0, data: null, error: String(err && err.message || err) };
    } finally {
      clearTimeout(timer);
    }
  });

  ipcMain.handle('settings:get', (_e, key) => {
    if (!OPEN_SETTINGS.includes(key)) locked();
    return database.get('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
  });
  handle('settings:set', (_e, key, value) =>
    database.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]),
  );

  handle('rates:fetchOnline', wrap(async () => {
    // v1.11: Suriye piyasası sayfası; tarayıcı kimliğiyle istenir. Eski lira kullanılıyorsa değerler x100 yazılır.
    const browserUa = app.userAgentFallback.replace(/\s(Electron|falcon-ofis|Falcon Ofis)\/\S+/gi, '');
    const prevSyp = database.get("SELECT rate FROM exchange_rates WHERE currency_code = 'SYP' ORDER BY id DESC LIMIT 1")?.rate;
    const { rates, source } = await fetchOnlineRates(
      (url, opts) => net.fetch(url, { ...opts, headers: { ...(opts?.headers || {}), 'User-Agent': browserUa } }),
      { prevSyp },
    );
    services.call('saveRates', { rates, source: 'online' });
    database.run("INSERT INTO settings (key, value) VALUES ('rate_last_online', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
      `${new Date().toISOString()}|${source}`,
    ]);
    return { rates, source };
  }));

  // v1.12: USDT, BTC, ETH piyasa fiyatı (dolar karşılığı toplam kasaya eklenir)
  handle('rates:fetchCrypto', wrap(async () => {
    const { prices, rates, source } = await fetchCryptoPrices((url, opts) => net.fetch(url, opts));
    services.call('saveRates', { rates, source: 'online' });
    database.run("INSERT INTO settings (key, value) VALUES ('crypto_last_online', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
      `${new Date().toISOString()}|${source}`,
    ]);
    return { prices, source };
  }));

  // v1.15: kripto cüzdan adreslerine gelen ödemeler (yalnızca okuma) kasaya eklenir
  handle('wallets:check', wrap(() => {
    return runWalletCheck();
  }));

  handle('files:import', wrap((_e, kind, multiple) => importFiles(kind, multiple)));
  handle('files:open', wrap((_e, rel) => shell.openPath(safeFilePath(rel))));
  // v1.11: kameradan (web kamerası) çekilen fotoğraf JPEG olarak kaydedilir
  handle('files:saveImage', wrap((_e, bytes) => {
    const buf = Buffer.from(bytes);
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf.length > 20 * 1024 * 1024) throw new Error('ERR_FILE_TYPE');
    fs.mkdirSync(path.join(filesDir(), 'images'), { recursive: true });
    const rel = `images/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    fs.writeFileSync(safeFilePath(rel), buf);
    return { relPath: rel, originalName: 'foto.jpg', mime: 'image/jpeg' };
  }));
  handle('files:saveAs', wrap((_e, rel, name) => {
    const target = dialog.showSaveDialogSync(mainWindow, { defaultPath: name || path.basename(rel) });
    if (target) fs.copyFileSync(safeFilePath(rel), target);
    return !!target;
  }));

  // v1.9: kategori dökümü (PDF / Excel). Kaydedilen dosya hemen açılır.
  handle('report:saveXlsx', wrap(async (_e, bytes, name) => {
    const target = dialog.showSaveDialogSync(mainWindow, {
      defaultPath: path.join(app.getPath('documents'), name || 'dokum.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (!target) return null;
    fs.writeFileSync(target, Buffer.from(bytes));
    shell.openPath(target);
    return target;
  }));
  // v1.14: QR etiketleri (PDF baytları sayfada hazırlanır)
  handle('report:savePdfBytes', wrap(async (_e, bytes, name) => {
    const buf = Buffer.from(bytes);
    if (buf.length < 8 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('ERR_FILE_TYPE');
    const target = dialog.showSaveDialogSync(mainWindow, {
      defaultPath: path.join(app.getPath('documents'), name || 'etiket.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!target) return null;
    fs.writeFileSync(target, buf);
    shell.openPath(target);
    return target;
  }));
  ipcMain.handle('app:readAsset', (_e, url) => {
    const name = path.basename(String(url || '').split(/[?#]/)[0]);
    if (!/^[\w.-]+\.wasm$/.test(name)) return null;
    const file = path.join(__dirname, '..', 'dist', 'assets', name);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  });
  handle('report:savePdf', wrap(async (_e, html, name) => {
    const target = dialog.showSaveDialogSync(mainWindow, {
      defaultPath: path.join(app.getPath('documents'), name || 'dokum.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!target) return null;
    fs.writeFileSync(target, await htmlToPdf(html));
    shell.openPath(target);
    return target;
  }));

  handle('backup:create', wrap(() => {
    const target = dialog.showSaveDialogSync(mainWindow, {
      defaultPath: path.join(app.getPath('documents'), `falcon-ofis-yedek-${localDate()}.falcon`),
      filters: [{ name: 'Falcon Ofis Yedek', extensions: ['falcon'] }],
    });
    if (!target) return null;
    fs.writeFileSync(target, fullBackupBuffer());
    return target;
  }));
  // Yedek dosyasından (.falcon veya eski .db) geri yükleme
  handle('backup:restore', wrap(async (_e, name) => {
    let file = name ? path.join(backupsDir(), path.basename(name)) : null;
    if (!file) {
      const r = dialog.showOpenDialogSync(mainWindow, { properties: ['openFile'], filters: [{ name: 'Falcon Ofis Yedek', extensions: ['falcon', 'db'] }] });
      if (!r) return null;
      [file] = r;
    }
    const buf = fs.readFileSync(file);
    const data = backup.isSqlite(buf) ? { dbBuffer: buf, files: null } : backup.readBackupBuffer(buf);
    await replaceData(data);
    return file;
  }));
  // Eski sürümün klasöründen aktarma ("Falcon Ofis", "Falcon Ofis Veri" veya "data" klasörü seçilebilir)
  handle('backup:importFolder', wrap(async () => {
    const r = dialog.showOpenDialogSync(mainWindow, { properties: ['openDirectory'] });
    if (!r) return null;
    const found = backup.resolveDataFolder(r[0]);
    if (!found) throw new Error('ERR_BACKUP_NO_DATA');
    if (path.resolve(found.dataDir) === path.resolve(dataDir())) throw new Error('ERR_BACKUP_SAME_FOLDER');
    await replaceData(backup.readDataFolder(found));
    return found.dataDir;
  }));
  handle('backup:list', wrap(() => {
    fs.mkdirSync(backupsDir(), { recursive: true });
    return fs.readdirSync(backupsDir())
      .filter((n) => n.endsWith('.falcon') || n.endsWith('.db'))
      .map((n) => {
        const st = fs.statSync(path.join(backupsDir(), n));
        return { name: n, size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  }));
  handle('backup:openBackups', wrap(() => {
    fs.mkdirSync(backupsDir(), { recursive: true });
    return shell.openPath(backupsDir());
  }));
  handle('backup:openFolder', wrap(() => shell.openPath(dataDir())));

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggleFullscreen', () => {
    if (!mainWindow) return false;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  });
  ipcMain.handle('window:close', () => mainWindow?.close()); // v1.45: sistem tepsisine gizler
  ipcMain.handle('sync:status', () => sync?.status() ?? null);
  handle('sync:connect', wrap((_e, payload) => sync.connect(payload)));
  handle('sync:disconnect', wrap(() => sync.disconnect()));
  handle('sync:now', wrap(() => sync.syncNow({ manual: true })));
  // v1.58: güncelleme ortak çekirdekte (fc:update:*, installCore). Arayüz eski kabuk / kurulum durumunu buradan öğrenir.
  ipcMain.handle('kurulum:info', () => bridgeInfo());
  // v1.58: uzak cihazda silinip burada arşive alınan kayıtlar (geri yüklenebilir; arşiv hiç silinmez)
  handle('arsiv:list', wrap(() => lanStore.archiveList(300)));
  handle('arsiv:restore', wrap((_e, n) => {
    const r = lanStore.archiveRestore(n);
    sendToWindow('sync:changed');
    try { if (sync) sync.poke(); } catch { /* bulut bağlı değil */ }
    return r;
  }));
  // v1.30: Windows bildirimi (yeni sürüm vb.). Bildirime tıklanınca pencere öne gelir; pencere arkadaysa görev çubuğunda yanıp söner.
  ipcMain.handle('app:notify', (_e, { title, body } = {}) => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) mainWindow.flashFrame(true);
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title: String(title || 'Falcon Ofis'), body: String(body || '') });
    n.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
    n.show();
    return true;
  });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), baseVersion: global.__falconOverlay?.baseVersion || app.getVersion(), dataDir: dataDir(), backupsDir: backupsDir(), docsBackupDir: docsBackupDir() }));
}


// ---------- Veri güvenliği ----------

function fullBackupBuffer() {
  database.save();
  return backup.createBackupBuffer({ dbBuffer: fs.readFileSync(dbPath()), filesDir: filesDir(), appVersion: app.getVersion() });
}

// Günde bir otomatik tam yedek (açılışta ve kapanışta güncellenir); son 10 gün saklanır
function autoBackup() {
  try {
    const buf = fullBackupBuffer();
    const name = `otomatik-${localDate()}.falcon`;
    for (const dir of [backupsDir(), docsBackupDir()]) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${name}.tmp`), buf);
        fs.renameSync(path.join(dir, `${name}.tmp`), path.join(dir, name));
        backup.prune(dir, 'otomatik-', 10);
      } catch (err) {
        console.error('otomatik yedek yazılamadı', dir, err.message);
      }
    }
    backup.prune(backupsDir(), 'geri-yukleme-oncesi-', 10);
    backup.prune(backupsDir(), 'guncelleme-oncesi-', 10);
  } catch (err) {
    console.error('otomatik yedek alınamadı', err);
  }
}

async function openDatabase() {
  Kullanim.depo(path.join(app.getPath('userData'), 'kullanim-limit.json'));
  database = await new Database(dbPath(), { backupDir: backupsDir() }).open();
  services = createServices(database, { removeFile: (rel) => fs.rmSync(safeFilePath(rel), { force: true }) });
  sync?.dispose();
  sync = createSync({
    db: database,
    fetch: Kullanim.fetchSar((url, opts) => net.fetch(url, opts), () => kullanimGonder()),
    files: syncFiles,
    defaults: firebaseConfig,
    endpoints: syncEndpoints(),
    deviceName: 'Bilgisayar',
    // Buluttaki kayıtlar bu bilgisayarın kayıtlarının yerine geçmeden önce tam yedek alınır
    beforeReplace: () => {
      fs.mkdirSync(backupsDir(), { recursive: true });
      fs.writeFileSync(path.join(backupsDir(), `geri-yukleme-oncesi-${stamp()}.falcon`), fullBackupBuffer());
    },
    onChange: () => sendToWindow('sync:changed'),
    onStatus: (st) => sendToWindow('sync:status', st),
  });
  sync.start();
  lanStore = createLanStore(database, { fileColumns: FILE_COLUMNS });
  try {
    lanStore.prepare();
  } catch (err) {
    console.error('wi-fi eşitleme hazırlanamadı', err);
  }
}

// v1.50: Wi‑Fi eşitleme yardımcıları (sunucu arka plan sürecinde çalışır, pencere kapalıyken de)
function lanAccount() {
  if (!database) return '';
  const uid = database.get("SELECT value FROM sync_meta WHERE key = 'uid'");
  const v = database.get('SELECT MAX(version) AS v FROM schema_migrations');
  return `${(uid && uid.value) || ''}|s${v ? v.v : 0}`;
}
function lanBackup() {
  try {
    fs.mkdirSync(backupsDir(), { recursive: true });
    fs.writeFileSync(path.join(backupsDir(), `wifi-esitleme-oncesi-${stamp()}.falcon`), fullBackupBuffer());
    backup.prune(backupsDir(), 'wifi-esitleme-oncesi-', 10);
  } catch (err) {
    console.error('wi-fi eşitleme öncesi yedek alınamadı', err);
  }
}
function lanChanged(rep, dev) {
  sendToWindow('sync:changed');
  sendToWindow('lan:done', { rep, dev });
  try {
    if (sync) sync.poke();
  } catch {
    // bulut bağlı değil
  }
}
function lanHooks() {
  if (!database || !lanStore) return null;
  return {
    store: lanStore,
    files: syncFiles,
    busy: () => !!(sync && sync.isRunning()),
    account: lanAccount,
    backup: lanBackup,
    changed: lanChanged,
  };
}

// v1.54: kullanım sayacı ana süreçte dosyada tutulur, pencereye aktarılır (pencere kapalıyken de sayar)
function kullanimGonder() {
  try {
    const w = mainWindow;
    if (!w || w.isDestroyed()) return;
    w.webContents.executeJavaScript(`window.Kullanim && Kullanim.ice(${JSON.stringify(Kullanim.ozet())})`).catch(() => {});
  } catch {
    // pencere yok
  }
}

function sendToWindow(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
}

// Bulut eşitlemesinin dosya erişimi (ürün fotoğrafları, dekontlar)
const syncFiles = {
  exists: (rel) => fs.existsSync(safeFilePath(rel)),
  read: (rel) => new Uint8Array(fs.readFileSync(safeFilePath(rel))),
  write: (rel, bytes) => {
    const full = safeFilePath(rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(`${full}.tmp`, bytes);
    fs.renameSync(`${full}.tmp`, full);
  },
  remove: (rel) => fs.rmSync(safeFilePath(rel), { force: true }),
};

// Yalnızca otomatik testlerde: Firebase emülatörü
function syncEndpoints() {
  const host = process.env.FALCON_SYNC_EMULATOR;
  if (!host) return {};
  return {
    auth: `http://${host}:9099/identitytoolkit.googleapis.com/v1`,
    token: `http://${host}:9099/securetoken.googleapis.com/v1`,
    firestore: `http://${host}:8080/v1`,
  };
}

// Geri yükleme / aktarma: önce mevcut veri yedeklenir, sonra yeni veri yerine geçer ve ekran yenilenir
async function replaceDataAsync(data) {
  fs.mkdirSync(backupsDir(), { recursive: true });
  fs.writeFileSync(path.join(backupsDir(), `geri-yukleme-oncesi-${stamp()}.falcon`), fullBackupBuffer());
  if (sync) {
    sync.dispose();
    await sync.wait().catch(() => {});
    sync = null;
  }
  database.close();
  database = null;
  try {
    backup.writeData(dataDir(), data);
  } finally {
    await openDatabase();
  }
}
let restoreChain = Promise.resolve();
function replaceData(data) {
  const run = restoreChain.then(() => replaceDataAsync(data));
  restoreChain = run.catch(() => {});
  return run;
}

// İlk açılışta (veri klasörü boşsa) eski sürümün kayıtlarını arar ve aktarmayı önerir
function offerOldData() {
  if (fs.existsSync(dbPath())) return;
  const exeDir = app.isPackaged ? path.dirname(process.execPath) : process.env.FALCON_TEST_EXE_DIR;
  const appDataDir = path.join(app.getPath('appData'), 'Falcon Ofis');
  const found = backup.findOldData({
    exeDir: exeDir || dataDir(),
    currentDataDir: dataDir(),
    extraDirs: [appDataDir, path.join(appDataDir, 'Falcon Ofis Veri')],
    backupDirs: [docsBackupDir()],
  });
  if (!found.length) return;
  const best = found[0];
  const where = best.kind === 'folder' ? best.dataDir : best.backupPath;
  const when = new Date(best.mtime).toLocaleString('tr-TR');
  // FALCON_TEST_OLD_DATA_CHOICE yalnızca otomatik testlerde soruyu cevaplamak için kullanılır
  const testChoice = process.env.FALCON_TEST_OLD_DATA_CHOICE;
  const choice = testChoice !== undefined ? Number(testChoice) : dialog.showMessageBoxSync({
    type: 'question',
    title: 'Falcon Ofis',
    message: 'Önceki sürümün kayıtları bulundu',
    detail: `${where}\nSon değişiklik: ${when}\n\nBu kayıtlar yeni sürüme aktarılsın mı? Eski klasöre dokunulmaz.`,
    buttons: ['Kayıtları aktar', 'Boş başla'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (choice !== 0) return;
  const data = best.kind === 'folder' ? backup.readDataFolder(best) : backup.readBackupBuffer(fs.readFileSync(best.backupPath));
  fs.mkdirSync(dataDir(), { recursive: true });
  backup.writeData(dataDir(), data);
}

// v1.48: bekçi (Görev Zamanlayıcı) başlattıysa ve kullanıcı bu oturumda "Tamamen kapat" dediyse açılmaz
const launchedByWatchdog = process.argv.includes('--watchdog');
let skipLaunch = false;
try {
  const bootAt = Date.now() - require('os').uptime() * 1000;
  const quitAt = Number(bgSettings().userQuitAt) || 0;
  if (launchedByWatchdog && quitAt > bootAt) skipLaunch = true;
  else if (!launchedByWatchdog && quitAt) setBgSettings({ userQuitAt: 0 });
} catch { /* ayar okunamadı */ }
// Beklenmedik hata: program kendini gizli olarak yeniden başlatır (art arda çökmede bekçiye bırakır)
process.on('uncaughtException', (err) => {
  console.error('beklenmedik hata', err);
  rememberCrash(err); // v1.58: sonraki açılışta çökme raporu olarak gönderilir (FC.crash, günde en çok 5, kişisel veri maskelenir)
  try {
    const last = Number(bgSettings().crashAt) || 0;
    setBgSettings({ crashAt: Date.now() });
    if (Date.now() - last > 120000 && !quitting) {
      const args = process.argv.slice(1).filter((a) => a !== '--hidden' && a !== '--watchdog').concat(['--hidden']);
      app.relaunch(process.env.PORTABLE_EXECUTABLE_FILE ? { execPath: process.env.PORTABLE_EXECUTABLE_FILE, args } : { args });
      app.exit(1);
    }
  } catch { /* yok */ }
});
app.on('render-process-gone', (_e, wc) => {
  setTimeout(() => { try { if (!wc.isDestroyed()) wc.reload(); } catch { /* yok */ } }, 1500);
});

const gotLock = skipLaunch ? false : app.requestSingleInstanceLock();
if (!gotLock) {
  // v1.49: bekçinin (5 dakikada bir) açtığı ikinci kopya hemen kapanır; bu sayılmamalı. Yoksa overlay her denemede
  // aktif.json'daki tries'ı artırıyordu ve 15 dakikada "3 kez açılamadı" sanıp güncellemeyi devreden çıkarıyordu.
  try { global.__falconOverlay?.ok(); } catch { /* yok */ }
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!(argv || []).includes('--hidden')) showWindow();
  });
  app.on('before-quit', () => { quitting = true; });

  app.whenReady().then(async () => {
    try {
      setupWindowsNotifications();
    } catch (err) {
      console.error('bildirim kısayolu', err);
    }
    try {
      offerOldData();
    } catch (err) {
      console.error('eski veri aktarılamadı', err);
      dialog.showErrorBox('Falcon Ofis', `Eski kayıtlar aktarılamadı: ${err.message}\nAyarlar > Yedekleme bölümünden tekrar deneyebilirsiniz.`);
    }
    // FALCON_TEST_NO_PIN yalnızca otomatik testlerde PIN ekranını atlamak için kullanılır
    security = createSecurity({ file: path.join(app.getPath('userData'), 'cihaz-ayarlari.json'), disabled: process.env.FALCON_TEST_NO_PIN === '1' });
    fs.mkdirSync(filesDir(), { recursive: true });
    await openDatabase();
    autoBackup();

    protocol.handle('falcon', (req) => {
      const url = new URL(req.url);
      try {
        const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        return net.fetch(pathToFileURL(safeFilePath(rel)).toString());
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });

    // v1.58: güncellemeler yalnız GitHub Releases'ten (ortak çekirdek). Firebase yalnız canlı kayıtlar içindir:
    // eski "yayın kutusu" (paketleri Firebase'e yükleyen) ve eski güncelleyici kaldırıldı.
    cleanupOldOverlays();
    registerIpc();
    lanServer.setup({ prefsFile: path.join(app.getPath('userData'), 'wifi-esitleme.json'), hooks: lanHooks });
    createWindow();
    createTray();
    applyAutostart();
    startBackgroundJobs();
  });

  app.on('window-all-closed', () => {
    if (!quitting && tray) return; // sistem tepsisinde çalışmaya devam
    shutdown();
  });
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  quitting = true;
  {
    // Kapanmadan önce bekleyen değişiklikler buluta gönderilmeye çalışılır (en çok birkaç saniye)
    if (sync && sync.status().connected && sync.status().pending > 0) {
      await Promise.race([sync.syncNow().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    }
    sync?.dispose();
    if (database) autoBackup();
    database?.close();
    try { tray?.destroy(); } catch { /* yok */ }
    app.quit();
  }
}
