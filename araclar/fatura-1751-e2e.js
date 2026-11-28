#!/usr/bin/env node
// v1.75.1 uçtan uca: fatura önizlemesinde tablo hiçbir zaman sayfadan taşmaz (her dil × her şablon, uzun kod/ad, büyük tutarlar,
// satır KDV sütunları, düzeltme sonrası), koda yapışık ürün adı ayrılır, boş depo sütunu gizlenir, PDF gövdesi aynı ölçüyle çıkar.
//   PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core xvfb-run -a -s "-screen 0 1600x1000x24" node araclar/fatura-1751-e2e.js <çıktı>
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'ekran-1751');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-1751-'));
  const app = await pw._electron.launch({
    executablePath: electron, args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + ud],
    env: { ...process.env, FALCON_TEST_NO_PIN: '1', FALCON_TEST_OLD_DATA_CHOICE: '1', FALCON_TEST_NO_UPDATE: '1', FALCON_TEST_DOCS_DIR: path.join(ud, 'belgeler') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  await page.waitForSelector('.topbar-actions', { timeout: 30000 });
  await page.evaluate(async (ver) => {
    const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
    set('scheme', 'falcon'); set('onboarding.done', true); set('whatsnew.seen', ver);
    localStorage.setItem('falcon-theme', 'dark'); localStorage.setItem('fat.pvNames', 'keep');
    await window.falcon.settings.set('language', 'tr');
    await window.falcon.settings.set('invoice_company', JSON.stringify({ name: 'Falcon System', phone: '+90 212 000 00 00' }));
    await window.falcon.call('saveRates', { rates: { TRY: 51.24, SYP: 154.75 }, source: 'manual' });
    // ekran görüntüsündeki fatura: kodun arkasına ürün adı yapışmış, depo boş
    const N = ['LIVE CENTER MT5-05 WITH INTERCHANGEABLE TIPS – SET: BODY + 4 TIPS + WRENCH', 'HYUNDAI SE2600M BMT55\nOD TURNING TOOL HOLDER 25 mm, SHORT',
      'HWACHEON CUTEX-160A-B/MC_BMT55 BORING BAR HOLDER + U-DRILL HOLDER Ø40 H60', 'BORING BAR SLEEVE D40 d12', 'BORING BAR SLEEVE D40 d20', 'BORING BAR SLEEVE D40 d25'];
    const C = ['PMKS05.5T', 'TTHY.0025.10.01', 'TT.HW.DU40.06.01', 'OKT4012A', 'DKT4020A', 'DKT4025A'];
    const items = N.map((n, i) => ({ name: n, code: C[i] + n.replace(/\n/g, ' '), qty: i < 3 ? 2 : 1, unit: 'Adet', price: [512.4, 205.3, 318.9, 61.2, 64.8, 66.1][i], depot: '' }));
    let x = await window.falcon.call('saveInvoice', { number: 'FAL-2026-0008', date: '2026-11-28', customer: { name: 'Nuh', email: 'nuh@example.com' }, currency: 'USD', items,
      discount: 0, tax_rate: 0, template: 'falcon', lang: 'en', meta: {} });
    if (!x.ok) throw new Error('fatura: ' + x.error);
    // en kötü durum: satır KDV'si farklı (KDV sütunları açılır), uzun depo + kod, çok büyük SYP tutarları
    const big = [1, 2, 3, 4, 5].map((i) => ({ name: 'Endüstriyel Sunucu Kabini 42U Kilitli Cam Kapaklı Fanlı Model ' + i, code: 'SRV-KBN-42U-CAM-' + i + '00000-XL-TR', depot: 'MERKEZ-DEPO-RAF-' + i,
      qty: 12345, unit: 'Adet', price: 987654321.55, vat: i % 2 ? 20 : 10 }));
    x = await window.falcon.call('saveInvoice', { number: 'FAL-2026-0009', date: '2026-11-28', customer: { name: 'Test Ltd' }, currency: 'SYP', items: big,
      discount: 0, tax_rate: 0, template: 'falcon', lang: 'tr', meta: {} });
    if (!x.ok) throw new Error('fatura 2: ' + x.error);
    // eski sürümün bozduğu düzeltme kayıtları (FAL-2026-0004 ekran görüntüsü): ad «#» hücresine yapışmış, ad hücresi boş; kod hücresine yapışmış ad
    x = await window.falcon.call('saveInvoice', { number: 'FAL-2026-0010', date: '2026-11-28', customer: { name: 'Nuh' }, currency: 'USD',
      items: [{ name: 'Fiber Optic Patch Panel', qty: 4, unit: 'pcs', price: 9 }, { name: '25G SFP28 Module', qty: 10, unit: 'pcs', price: 95 }], discount: 0, tax_rate: 0, template: 'falcon', lang: 'en', meta: {} });
    if (!x.ok) throw new Error('fatura 3: ' + x.error);
    await window.falcon.settings.set('invoice_pv_FAL-2026-0010', JSON.stringify({ lang: 'en', ed: { en: [{ o: '1', i: 1, n: '1Fiber Optic Patch Panel, Rack-Mount' }, { o: 'Fiber Optic Patch Panel', i: 1, n: '' }] } }));
    await window.falcon.settings.set('invoice_pv_FAL-2026-0008', JSON.stringify({ lang: 'en', ed: { en: [{ o: 'PMKS05.5T', i: 1, n: 'PMKS05.5TLIVE CENTER MT5-05 WITH INTERCHANGEABLE TIPS – SET: BODY + 4 TIPS + WRENCH' }] } }));
  }, require('../package.json').version);
  await page.reload();
  await page.waitForSelector('.topbar-actions .fc-update-wrap', { timeout: 30000 });
  const open = async (no) => {
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { location.hash = '#/invoices'; });
    await page.waitForSelector('.fatura-page .fat-acts', { timeout: 15000 });
    await page.addStyleTag({ content: '.aduy-ort,.aduy-zil{display:none!important}' });
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll('.fatura-page tr, .fatura-page .fat-row, .fatura-page [class*=row]')].find((r) => r.textContent.includes(n) && r.querySelector('.fat-acts'));
      [...row.querySelectorAll('.fat-acts button')].find((b) => /PDF/.test(b.textContent)).click();
    }, no);
    await page.waitForSelector('.fat-pv-steps', { timeout: 10000 });
    await page.waitForFunction(() => { const h = document.querySelector('.fat-pv-host'); return h && h.shadowRoot.querySelector('.inv table.it'); }, null, { timeout: 10000 });
    await page.waitForTimeout(400);
  };
  const close = () => page.click('.fat-modal .modal-footer button:has-text("Kapat")');
  const shot = async (n) => { await page.evaluate(() => { const t = document.querySelector('.fat-pv-host').shadowRoot.querySelector('table.it'); t.scrollIntoView({ block: 'center' }); }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, n + '.png') }); };
  // ölçüm: tablo .body içerik kutusunda mı, taşan hücre var mı
  const measure = () => page.evaluate(() => {
    const r = document.querySelector('.fat-pv-host').shadowRoot;
    const inv = r.querySelector('.inv'), body = r.querySelector('.body') || inv, tb = r.querySelector('table.it');
    const k = inv.getBoundingClientRect().width / inv.offsetWidth;
    const bs = getComputedStyle(body), br = body.getBoundingClientRect(), trc = tb.getBoundingClientRect();
    const left = br.left + parseFloat(bs.paddingLeft) * k, right = br.right - parseFloat(bs.paddingRight) * k;
    const bad = [...tb.querySelectorAll('td,th')].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent.slice(0, 40));
    return { out: Math.round(Math.max(trc.right - right, left - trc.left) / k), bad, heads: [...tb.querySelectorAll('th')].map((x) => x.textContent),
      codes: [...tb.querySelectorAll('td.cd')].map((x) => x.textContent), fs: tb.style.fontSize, wrap: tb.classList.contains('wrapall') };
  });
  const ok = (m, tag) => { assert.ok(m.out <= 1 && !m.bad.length, tag + ': tablo taşıyor ' + JSON.stringify(m)); };
  const LG = [['English', 'en'], ['Türkçe', 'tr'], ['العربية', 'ar']], TPL = ['falcon', 'classic', 'minimal', 'efatura'];

  // 1) FAL-2026-0008: kod temiz, depo sütunu yok, her dil × şablon sığar
  await open('FAL-2026-0008');
  for (const [lb, lg] of LG) {
    await page.click('.fat-pv-lg button:has-text("' + lb + '")'); await page.waitForTimeout(250);
    for (const tp of TPL) {
      await page.selectOption('.fat-pv-bar select', tp); await page.waitForTimeout(250);
      const m = await measure(); ok(m, '0008 ' + lg + '/' + tp);
      assert.ok(!m.heads.some((h) => /Warehouse|Depo|المستودع/.test(h)), 'boş depo sütunu gizli: ' + m.heads.join('|'));
      if (m.codes.length) assert.deepStrictEqual(m.codes.slice(0, 6), ['PMKS05.5T', 'TTHY.0025.10.01', 'TT.HW.DU40.06.01', 'OKT4012A', 'DKT4020A', 'DKT4025A'], 'kod ayrıldı ' + lg + '/' + tp);
    }
    await page.selectOption('.fat-pv-bar select', 'falcon'); await page.waitForTimeout(200);
    await shot('1-0008-' + lg);
  }
  // 2) düzeltme: koda ve tutara çok uzun metin yazılır → yine taşmaz, PDF gövdesi aynı stil
  await page.click('.fat-pv-lg button:has-text("English")'); await page.waitForTimeout(250);
  await page.click('.fat-pv-steps button:has-text("Düzelt")');
  await page.evaluate(() => {
    const r = document.querySelector('.fat-pv-host').shadowRoot;
    r.querySelector('td.cd').firstChild.nodeValue = 'PMKS05.5TLIVE CENTER MT5-05 WITH INTERCHANGEABLE TIPS – SET: BODY + 4 TIPS + WRENCH EXTRA LONG CODE';
    const n = r.querySelectorAll('td.n .m')[1]; n.firstChild.nodeValue = '1,234,567,890,123.45 $';
    r.querySelector('td.nm').lastChild.nodeValue = 'HYUNDAI_SE2600M_BMT55_OD_TURNING_TOOL_HOLDER_25mm_SHORT_WITHOUT_ANY_SPACES_AT_ALL_IN_THIS_NAME';
    r.querySelector('.inv').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  let m = await measure(); ok(m, 'düzeltme sonrası');
  await shot('2-duzeltme');
  // yeniden açınca (kayıtlı düzeltmeler uygulanınca) da sığar
  await close(); await page.waitForTimeout(300);
  await open('FAL-2026-0008');
  m = await measure(); ok(m, 'yeniden açılış (düzeltmeler uygulandı)');
  assert.ok(/EXTRA LONG CODE/.test(m.codes.join(' ')), 'düzeltme korunuyor');
  await shot('3-yeniden');
  await close(); await page.waitForTimeout(300);
  // 3) FAL-2026-0009: büyük tutarlar, KDV sütunları, uzun depo/kod — her dil × şablon
  await open('FAL-2026-0009');
  for (const [lb, lg] of LG) {
    await page.click('.fat-pv-lg button:has-text("' + lb + '")'); await page.waitForTimeout(250);
    for (const tp of TPL) {
      await page.selectOption('.fat-pv-bar select', tp); await page.waitForTimeout(250);
      ok(await measure(), '0009 ' + lg + '/' + tp);
    }
    await page.selectOption('.fat-pv-bar select', 'efatura'); await page.waitForTimeout(200);
    await shot('4-0009-' + lg);
  }
  await close();
  // 4) bozuk düzeltme kaydı onarılır; düzenleyicinin yarattığı yeni düğüm kendi hücresinde kalır
  await open('FAL-2026-0010');
  let cells = await page.evaluate(() => [...document.querySelector('.fat-pv-host').shadowRoot.querySelectorAll('table.it tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim())));
  assert.strictEqual(cells[0][0], '1', '# hücresi temiz: ' + JSON.stringify(cells[0]));
  assert.ok(cells[0].includes('Fiber Optic Patch Panel, Rack-Mount'), 'ad kendi hücresinde: ' + JSON.stringify(cells[0]));
  await page.waitForTimeout(400);
  let pv = JSON.parse(await page.evaluate(() => window.falcon.settings.get('invoice_pv_FAL-2026-0010')));
  assert.deepStrictEqual(pv.ed.en, [{ o: 'Fiber Optic Patch Panel', i: 1, n: 'Fiber Optic Patch Panel, Rack-Mount' }], 'onarılmış kayıt: ' + JSON.stringify(pv.ed));
  ok(await measure(), '0010');
  // düzenleyici benzetimi: ad düğümü silinip yerine yeni düğüm yazılır (tümünü seç + yaz) — «#»a yapışmamalı
  await page.click('.fat-pv-steps button:has-text("Düzelt")');
  await page.evaluate(() => {
    const r = document.querySelector('.fat-pv-host').shadowRoot;
    const td = [...r.querySelectorAll('table.it tbody tr')[1].children].find((c) => /SFP28/.test(c.textContent));
    td.textContent = ''; td.appendChild(document.createTextNode('25G SFP28 Transceiver Module'));
    const qty = r.querySelectorAll('table.it tbody tr')[1].querySelector('td.n');
    r.querySelector('.inv').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  pv = JSON.parse(await page.evaluate(() => window.falcon.settings.get('invoice_pv_FAL-2026-0010')));
  assert.ok(pv.ed.en.some((e) => e.o === '25G SFP28 Module' && e.n === '25G SFP28 Transceiver Module'), 'yeni düğüm kendi kaydına: ' + JSON.stringify(pv.ed.en));
  assert.ok(!pv.ed.en.some((e) => e.o === '2'), '«#» bozulmadı');
  await close(); await page.waitForTimeout(300);
  await open('FAL-2026-0010');
  cells = await page.evaluate(() => [...document.querySelector('.fat-pv-host').shadowRoot.querySelectorAll('table.it tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim())));
  assert.strictEqual(cells[1][0], '2'); assert.ok(cells[1].includes('25G SFP28 Transceiver Module'), JSON.stringify(cells[1]));
  await shot('5-onarim');
  await close(); await page.waitForTimeout(300);
  // 4) okuyucu: normalize kodu ayırır
  const nc = await page.evaluate(() => window.FalconFaturaPdf.normalize({ items: [{ name: 'BORING BAR SLEEVE D40 d12', code: 'OKT4012ABORING BAR SLEEVE D40 d12', qty: 1, price: 5 }] }).items[0].code);
  assert.strictEqual(nc, 'OKT4012A', 'normalize kod');
  const real = errors.filter((e) => !/net::|Failed to load resource|favicon/.test(e));
  assert.deepStrictEqual(real, [], 'hata yok');
  console.log('fatura-1751-e2e: TAMAM');
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
