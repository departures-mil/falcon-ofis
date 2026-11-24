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
    open: (rel) => ipcRenderer.invoke('files:open', rel),
    saveAs: (rel, name) => ipcRenderer.invoke('files:saveAs', rel, name),
  },
  report: {
    savePdf: (html, name) => ipcRenderer.invoke('report:savePdf', html, name),
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
  // v1.19: uygulama içinden güncelleme
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    restart: () => ipcRenderer.invoke('update:restart'),
    onProgress: (fn) => {
      const h = (_e, p) => fn(p);
      ipcRenderer.on('update:progress', h);
      return () => ipcRenderer.removeListener('update:progress', h);
    },
  },
  // v1.42: soru botu (Gemini isteği ana süreçten)
  ai: { request: (req) => ipcRenderer.invoke('ai:request', req) },
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

// Asistan Agent: aynı bilgisayardaki programlarla sayaç paylaşımı (fc-agent-main.js)
;(function () {
  const e = require('electron'), un = (p) => p.then((r) => { if (r && r.ok) return r.data; throw new Error((r && r.error) || 'ERR'); });
  const api = { read: () => un(e.ipcRenderer.invoke('fc:agent:read')), write: (k, j) => un(e.ipcRenderer.invoke('fc:agent:write', k, j)), remove: (k) => un(e.ipcRenderer.invoke('fc:agent:remove', k)) };
  try { e.contextBridge.exposeInMainWorld('fcAgentHost', api); } catch (x) { try { window.fcAgentHost = api; } catch (y) {} }
})();
