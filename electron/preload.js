const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('falcon', {
  db: {
    all: (sql, params = []) => ipcRenderer.invoke('db:all', sql, params),
    get: (sql, params = []) => ipcRenderer.invoke('db:get', sql, params),
  },
  call: (name, payload) => ipcRenderer.invoke('api:call', name, payload),
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  rates: { fetchOnline: () => ipcRenderer.invoke('rates:fetchOnline'), fetchCrypto: () => ipcRenderer.invoke('rates:fetchCrypto') },
  wallets: { check: () => ipcRenderer.invoke('wallets:check') },
  files: {
    import: (kind, multiple = false) => ipcRenderer.invoke('files:import', kind, multiple),
    saveImage: (bytes) => ipcRenderer.invoke('files:saveImage', bytes),
    saveReceipt: (bytes, name) => ipcRenderer.invoke('files:saveReceipt', bytes, name),
    saveFile: (bytes, name) => ipcRenderer.invoke('files:saveFile', bytes, name),
    open: (rel) => ipcRenderer.invoke('files:open', rel),
    read: (rel) => ipcRenderer.invoke('files:read', rel),
    saveAs: (rel, name) => ipcRenderer.invoke('files:saveAs', rel, name),
  },
  report: {
    savePdf: (html, name, opts) => ipcRenderer.invoke('report:savePdf', html, name, opts),
    saveXlsx: (bytes, name) => ipcRenderer.invoke('report:saveXlsx', bytes, name),
    savePdfBytes: (bytes, name) => ipcRenderer.invoke('report:savePdfBytes', bytes, name),
  },
  // v1.14: barkod okuyucunun wasm dosyası (program dosyadan açıldığı için fetch yerine)
  readAsset: (url) => ipcRenderer.invoke('app:readAsset', url),
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: (name) => ipcRenderer.invoke('backup:restore', name),
    importFolder: () => ipcRenderer.invoke('backup:importFolder'),
    list: () => ipcRenderer.invoke('backup:list'),
    openBackups: () => ipcRenderer.invoke('backup:openBackups'),
    openFolder: () => ipcRenderer.invoke('backup:openFolder'),
  },
  security: {
    status: () => ipcRenderer.invoke('security:status'),
    setup: (pin) => ipcRenderer.invoke('security:setup', pin),
    unlock: (pin) => ipcRenderer.invoke('security:unlock', pin),
    recover: (code, pin) => ipcRenderer.invoke('security:recover', code, pin),
    changePin: (oldPin, pin) => ipcRenderer.invoke('security:changePin', oldPin, pin),
    newRecoveryCode: (pin) => ipcRenderer.invoke('security:newRecoveryCode', pin),
  },
  window: {
    getMode: () => ipcRenderer.invoke('window:getMode'),
    setMode: (mode) => ipcRenderer.invoke('window:setMode', mode),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
    half: () => ipcRenderer.invoke('fc:win:half'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    connect: (payload) => ipcRenderer.invoke('sync:connect', payload),
    disconnect: () => ipcRenderer.invoke('sync:disconnect'),
    now: () => ipcRenderer.invoke('sync:now'),
    onChanged: (fn) => {
      const h = () => fn();
      ipcRenderer.on('sync:changed', h);
      return () => ipcRenderer.removeListener('sync:changed', h);
    },
    onStatus: (fn) => {
      const h = (_e, st) => fn(st);
      ipcRenderer.on('sync:status', h);
      return () => ipcRenderer.removeListener('sync:status', h);
    },
  },
  // v1.58: güncellemeler ortak çekirdekle (FC.updater → GitHub Releases latest.json, yama / tam app.asar, window.fcHost.update).
  // Eski "update" köprüsü kaldırıldı; köprü (eski kabuk) durumunu arayüz buradan öğrenir.
  kurulum: { info: () => ipcRenderer.invoke('kurulum:info') },
  // v1.58: uzak cihazda silinip burada arşive alınan kayıtlar (Wi‑Fi / bulut eşitleme; hiçbir kayıt kalıcı silinmez)
  arsiv: {
    list: () => ipcRenderer.invoke('arsiv:list'),
    restore: (n) => ipcRenderer.invoke('arsiv:restore', n),
  },
  // v1.42: soru botu (Gemini isteği ana süreçten)
  ai: { request: (req) => ipcRenderer.invoke('ai:request', req) },
  // v1.65: Sham Cash dekont kutusu
  shamcash: {
    inbox: () => ipcRenderer.invoke('shamcash:inbox'),
    take: (name) => ipcRenderer.invoke('shamcash:take', name),
    peek: (name) => ipcRenderer.invoke('shamcash:peek', name),
    put: (name, bytes) => ipcRenderer.invoke('shamcash:put', name, bytes),
    done: (name) => ipcRenderer.invoke('shamcash:done', name),
    openInbox: () => ipcRenderer.invoke('shamcash:openInbox'),
  },
  sendContact: (m) => ipcRenderer.invoke('contact:send', m),
  // v1.50: Wi‑Fi (internetsiz) eşitleme
  lan: {
    lanInfo: () => ipcRenderer.invoke('lan:info'),
    lanServe: () => ipcRenderer.invoke('lan:serve'),
    lanStop: () => ipcRenderer.invoke('lan:stop'),
    lanResetKey: () => ipcRenderer.invoke('lan:reset'),
    lanIps: () => ipcRenderer.invoke('lan:ips'),
    lanHttp: (m, url, body, ms, key) => ipcRenderer.invoke('lan:http', m, url, body, ms, key),
    lanFind: (port, key, appId) => ipcRenderer.invoke('lan:find', port, key, appId),
    exportState: () => ipcRenderer.invoke('lan:export'),
    applyState: (merged, dev) => ipcRenderer.invoke('lan:apply', merged, dev),
    readFile: (rel) => ipcRenderer.invoke('lan:readFile', rel),
    writeFile: (rel, b64) => ipcRenderer.invoke('lan:writeFile', rel, b64),
    conflicts: () => ipcRenderer.invoke('lan:conflicts'),
    onDone: (fn) => {
      const h = (_e, r) => fn(r);
      ipcRenderer.on('lan:done', h);
      return () => ipcRenderer.removeListener('lan:done', h);
    },
  },
  platform: 'desktop',
  appInfo: () => ipcRenderer.invoke('app:info'),
  // v1.30: sistem bildirimi
  notify: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),
});

// v1.58: ortak çekirdek köprüsü (window.fcHost: pencere düğmeleri, güncelleme, indirme, Asistan Agent paylaşımı, ana süreç hataları)
require('../cekirdek/electron/fc-preload.js');
// v1.69: çevrimdışı yapay zekâ köprüsü (window.fcYerelZeka) — PaddleOCR PP-OCRv5 + Tesseract OCR, TranslateGemma / NLLB çeviri
require('../cekirdek/electron/yerel-zeka/fc-yerel-zeka-preload').expose(contextBridge, ipcRenderer);
