#!/usr/bin/env node
// Ekran görüntüleri (gerçek Electron, Playwright _electron, Linux'ta xvfb-run ile):
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//   xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/ekran.js <çıktı-klasörü>
// Her görüntü boş bir veri klasörüyle açılır (PIN yok, ilk açılış rehberi kapalı). Ağ isteği yapılmaz (güncelleme denetimi kapalı).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  { name: 'tr-falcon-dark', lang: 'tr', theme: 'dark', scheme: 'falcon' },
  { name: 'ar-falcon-light', lang: 'ar', theme: 'light', scheme: 'falcon' },
  { name: 'tr-zumrut-dark', lang: 'tr', theme: 'dark', scheme: 'zumrut' },
  { name: 'tr-falcon-dark-ayarlar', lang: 'tr', theme: 'dark', scheme: 'falcon', page: 'settings', scroll: '.look-card' },
  { name: 'tr-falcon-dark-ayarlar-son', lang: 'tr', theme: 'dark', scheme: 'falcon', page: 'settings', scroll: '[data-fc-card=about]' },
  { name: 'ar-falcon-light-ayarlar', lang: 'ar', theme: 'light', scheme: 'falcon', page: 'settings', scroll: '[data-fc-card=agent]' },
  { name: 'tr-guncelle', lang: 'tr', theme: 'dark', scheme: 'falcon', update: true },
  { name: 'tr-eski-kabuk-kopru', lang: 'tr', theme: 'dark', scheme: 'falcon', bridge: true },
  { name: 'tr-ilk-acilis', lang: 'tr', theme: 'dark', scheme: 'falcon', onboarding: true },
];

(async () => {
  const errors = [];
  for (const s of shots) {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-ekran-'));
    const app = await pw._electron.launch({
      executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
      env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
    });
    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(s.name + ': ' + e.message));
    await page.waitForSelector('.topbar-actions', { timeout: 30000 });
    await page.evaluate(async (s) => {
      const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
      set('scheme', s.scheme); set('onboarding.done', !s.onboarding); set('whatsnew.seen', s.ver || '9.9.9');
      localStorage.setItem('falcon-theme', s.theme);
      await window.falcon.settings.set('language', s.lang);
    }, Object.assign({ ver: require('../package.json').version }, s));
    await page.reload();
    await page.waitForSelector('.topbar-actions .fc-update-wrap', { timeout: 30000 });
    await page.waitForTimeout(1500);
    if (s.page) { await page.evaluate((p) => { location.hash = '#/' + p; }, s.page); await page.waitForTimeout(1500); }
    if (s.scroll) { await page.evaluate((q) => { const c = document.querySelector(q); if (c) c.scrollIntoView({ block: 'start' }); }, s.scroll); await page.waitForTimeout(500); }
    if (s.update) {
      await page.evaluate(() => {
        FC.updater._config({ repo: 'falcon-ofis', app: 'falcon-ofis', version: '1.58.0', channel: 'win-app' });
        const p = { version: '1.59.0', notes: {}, channel: 'win-app', mode: 'patch', size: 2.4e6, full: { size: 9.1e6 } };
        // ilerleme görünümü: yama kipinde %42
        FC.updater.subscribe(() => {});
        const st = FC.updater.state(); Object.assign(st, {});
        window.__fcDemo = p;
      });
      await page.evaluate(() => {
        const ub = document.querySelector('.fc-update-wrap .update-act'); const fl = document.querySelector('.fc-update-wrap .update-float');
        fl.hidden = false;
        const box = fl.querySelector('.update-box') || fl.firstElementChild;
        const pb = FC.progress.box(); fl.replaceChild(pb.el, box);
        pb.title(FC.t('fc.update.downloading') + ' v1.59.0');
        pb.set({ done: 1.01e6, total: 2.4e6, pct: 42, remaining: 1.39e6, speed: 0.8e6 }, { patch: true });
        ub.classList.add('busy');
      });
      await page.waitForTimeout(300);
    }
    if (s.bridge) { await page.evaluate(() => window.FalconCore.bridge()); await page.waitForTimeout(500); }
    if (s.onboarding) { await page.evaluate(() => FC.onboarding.open({ store: false })); await page.waitForTimeout(500); }
    await page.screenshot({ path: path.join(OUT, s.name + '.png') });
    await app.close();
    fs.rmSync(ud, { recursive: true, force: true });
    console.log('✓', s.name);
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
