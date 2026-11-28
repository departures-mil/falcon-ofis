/* Falcon Ofis v1.63 — ortak çıktı akışı: 1) dil seçimi  2) önizle ve düzelt  3) PDF.
 * Faturalar kendi önizlemesini kullanır (fatura-falcon.js openPreview). Bu dosya diğer PDF dökümleri içindir
 * (ürün / malzeme dökümü: index-*.js Vd → patch-ui-163.py):
 *   window.FalconCikti.open({ html, name, lang, regen: function (lg) { return Promise<html> } }) → Promise<kaydedilen yol | null>
 * Düzeltmeler önizlemedeki belgeye (iframe, designMode) yapılır ve PDF'e aynen girer; dil değişince belge yeniden üretilir. */
(function () {
  'use strict';
  if (window.FalconCikti) return;
  var TX = {
    tr: { title: 'Çıktı', lang: 'Çıktı dili', edit: 'Önizle ve düzelt', names: 'Ürün adları', nKeep: 'Olduğu gibi bırak', nTr: 'Seçilen dile çevir', nBusy: '⏳ Ürün adları çevriliyor…', nAi: '✓ Yapay zekâ ile çevrildi', nOff: '⚠ İnternet / yapay zekâ yok: çevrimdışı teknik sözlükle çevrildi, gerekirse düzeltin', nSame: 'Ürün adları zaten Türkçe', nLeft: 'sözlükte olmayan', editOn: '✎ Düzelt', editOff: '✓ Düzeltmeyi bitir', pdf: '⬇ PDF olarak kaydet', close: 'Kapat',
      hint: 'Önizlemedeki herhangi bir yazıya tıklayıp düzeltebilirsiniz; düzeltmeler PDF\'e aynen girer. Dil değişirse düzeltmeler sıfırlanır.', busy: 'Hazırlanıyor…', lost: 'Dil değişti, düzeltmeler sıfırlandı' },
    en: { title: 'Output', lang: 'Output language', edit: 'Preview and correct', names: 'Product names', nKeep: 'Keep as they are', nTr: 'Translate to the selected language', nBusy: '⏳ Translating product names…', nAi: '✓ Translated with AI', nOff: '⚠ No internet / AI: translated with the offline technical glossary, correct if needed', nSame: 'Product names are already in Turkish', nLeft: 'not in the glossary', editOn: '✎ Correct', editOff: '✓ Finish correcting', pdf: '⬇ Save as PDF', close: 'Close',
      hint: 'Click any text in the preview to correct it; corrections go into the PDF exactly as shown. Changing the language resets them.', busy: 'Preparing…', lost: 'Language changed, corrections were reset' },
    ar: { title: 'المستند', lang: 'لغة المستند', edit: 'المعاينة والتصحيح', names: 'أسماء المنتجات', nKeep: 'إبقاؤها كما هي', nTr: 'ترجمتها إلى اللغة المختارة', nBusy: '⏳ جارٍ ترجمة أسماء المنتجات…', nAi: '✓ تُرجمت بالذكاء الاصطناعي', nOff: '⚠ لا يوجد إنترنت / ذكاء اصطناعي: تُرجمت بالمعجم التقني دون اتصال، صحّحها عند الحاجة', nSame: 'أسماء المنتجات باللغة التركية أصلاً', nLeft: 'غير موجودة في المعجم', editOn: '✎ تصحيح', editOff: '✓ إنهاء التصحيح', pdf: '⬇ حفظ بصيغة PDF', close: 'إغلاق',
      hint: 'انقر على أي نص في المعاينة لتصحيحه؛ تدخل التصحيحات إلى ملف PDF كما هي. تغيير اللغة يلغي التصحيحات.', busy: 'جارٍ التحضير…', lost: 'تغيّرت اللغة فأُلغيت التصحيحات' }
  };
  var ui = function () { var l = document.documentElement.lang; return TX[l] ? l : 'tr'; };
  var t = function (k) { return (TX[ui()] || TX.tr)[k] || TX.tr[k] || k; };
  function el(tag, a, kids) {
    var e = document.createElement(tag);
    for (var k in (a || {})) { var v = a[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function css() {
    if (document.getElementById('cikti-falcon-css')) return;
    var s = document.createElement('style'); s.id = 'cikti-falcon-css';
    s.textContent = '.ck-steps{display:flex;flex-direction:column;gap:8px;margin-bottom:10px;padding:10px 12px;border:1px solid var(--border,#ffffff1f);border-radius:12px}' +
      '.ck-st{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ck-st .n{width:22px;height:22px;border-radius:50%;background:#0ea5e9;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px}' +
      '.ck-st>b{min-width:120px}.ck-seg{display:flex;gap:4px;padding:4px;border:1px solid var(--border,#3a4458);border-radius:10px}.ck-seg button{border:0;background:none;color:inherit;padding:6px 14px;border-radius:7px;cursor:pointer;font-weight:600}' +
      '.ck-seg button{white-space:nowrap}.ck-seg button.on{background:#0ea5e933;color:#38bdf8}.ck-st .hint{flex:1;min-width:220px;font-size:12.5px;opacity:.75}' +
      '.ck-pv{background:#7d8595;border-radius:10px;padding:14px;overflow:auto;max-height:68vh;display:flex;justify-content:center}' +
      '.ck-pv iframe{width:1123px;max-width:none;height:794px;border:0;background:#fff;box-shadow:0 6px 30px rgba(0,0,0,.35);transform-origin:top center}' +
      '.ck-busy{padding:6px 2px;color:#38bdf8;font-weight:600}';
    document.head.appendChild(s);
  }
  function open(o) {
    css();
    var F = window.falcon || {};
    return new Promise(function (resolve) {
      var lg = TX[o.lang] ? o.lang : ui(), html = o.html, editing = false, edited = false, done = false;
      var frame = el('iframe', { sandbox: 'allow-same-origin', title: 'pdf' });
      var pv = el('div', { class: 'ck-pv' }, [frame]);
      var busy = el('div', { class: 'ck-busy', hidden: true, text: '⏳ ' + t('busy') });
      var doc = function () { try { return frame.contentDocument; } catch (e) { return null; } };
      var fit = function () {
        var d = doc(), b = d && d.documentElement; if (!b) return;
        var w = Math.max(794, b.scrollWidth), h = Math.max(600, b.scrollHeight);
        frame.style.width = w + 'px'; frame.style.height = h + 'px';
        var k = Math.min(1, (pv.clientWidth - 28) / w); frame.style.transform = 'scale(' + k + ')'; frame.style.marginBottom = (h * k - h) + 'px';
      };
      var load = function () {
        frame.onload = function () { var d = doc(); if (d) { applyNames(d); d.designMode = editing ? 'on' : 'off'; d.addEventListener('input', function () { edited = true; }); } setTimeout(fit, 30); };
        frame.srcdoc = html;
      };
      var lgBox = el('div', { class: 'ck-seg' });
      var drawLg = function () {
        lgBox.innerHTML = '';
        [['tr', 'Türkçe'], ['en', 'English'], ['ar', 'العربية']].forEach(function (x) {
          lgBox.appendChild(el('button', { type: 'button', class: lg === x[0] ? 'on' : '', dir: x[0] === 'ar' ? 'rtl' : 'ltr', text: x[1], onclick: function () {
            if (lg === x[0] || !o.regen) return;
            lg = x[0]; drawLg(); busy.hidden = false;
            Promise.all([o.regen(lg), ensureNames()]).then(function (r) { return r[0]; }).then(function (h) { busy.hidden = true; if (edited) toast(t('lost')); edited = false; html = h; load(); }, function (e) { busy.hidden = true; toast(String(e && e.message || e)); });
          } }));
        });
      };
      // ürün adları: olduğu gibi / seçilen dile çevir (fatura ile aynı çeviri ve önbellek)
      var FF = window.FalconFatura || {}, canNames = !!(o.names && o.names.length && FF.translateNames);
      var names = canNames && FF.namesPref ? FF.namesPref() : 'keep', nm = { lg: '', map: null, src: '', busy: false };
      var nmBox = el('div', { class: 'ck-seg' }), nmInfo = el('span', { class: 'hint' });
      var applyNames = function (d) {
        if (names !== 'tr' || !nm.map || nm.lg !== lg || !d || !d.body) return;
        var w = d.createTreeWalker(d.body, 4), n, list = [];
        while ((n = w.nextNode())) list.push(n);
        list.forEach(function (x) { var k = x.nodeValue.trim(); if (k && nm.map[k] != null && nm.map[k] !== k) x.nodeValue = x.nodeValue.replace(k, nm.map[k]); });
      };
      var drawNm = function () {
        nmBox.innerHTML = '';
        [['keep', t('nKeep')], ['tr', t('nTr')]].forEach(function (x) {
          nmBox.appendChild(el('button', { type: 'button', class: names === x[0] ? 'on' : '', text: x[1], onclick: function () {
            if (names === x[0]) return; names = x[0]; if (FF.namesPref) FF.namesPref(names); drawNm();
            if (edited) toast(t('lost')); edited = false;
            ensureNames().then(function () { load(); });
          } }));
        });
        nmInfo.textContent = names !== 'tr' ? '' : nm.busy ? t('nBusy') : nm.lg === lg && nm.src ? (nm.src === 'ai' ? t('nAi') : nm.src === 'same' ? t('nSame') : t('nOff') + (nm.left && nm.left.length ? ' — ' + t('nLeft') + ': ' + nm.left.slice(0, 12).join(', ') : '')) : '';
      };
      var ensureNames = function () {
        if (!canNames || names !== 'tr' || (nm.lg === lg && nm.map)) { drawNm(); return Promise.resolve(); }
        var l0 = lg; nm.busy = true; drawNm();
        return FF.translateNames(o.names.map(String), l0).then(function (r) { if (lg === l0) nm = { lg: l0, map: r.map, src: r.src, left: r.left || [], busy: false }; drawNm(); }, function () { nm.busy = false; drawNm(); });
      };
      var edBtn = el('button', { type: 'button', class: 'btn small' });
      var setEdit = function (on) { editing = on; var d = doc(); if (d) d.designMode = on ? 'on' : 'off'; edBtn.className = 'btn small' + (on ? ' primary' : ''); edBtn.textContent = on ? t('editOff') : t('editOn'); };
      edBtn.onclick = function () { setEdit(!editing); };
      var steps = el('div', { class: 'ck-steps' }, [
        o.regen ? el('div', { class: 'ck-st' }, [el('span', { class: 'n', text: '1' }), el('b', { text: t('lang') }), lgBox]) : null,
        canNames ? el('div', { class: 'ck-st' }, [el('span', { class: 'n', text: o.regen ? '2' : '1' }), el('b', { text: t('names') }), nmBox, nmInfo]) : null,
        el('div', { class: 'ck-st' }, [el('span', { class: 'n', text: String((o.regen ? 2 : 1) + (canNames ? 1 : 0)) }), el('b', { text: t('edit') }), edBtn, el('span', { class: 'hint', text: t('hint') })]),
        busy
      ]);
      var bd = el('div', { class: 'modal-backdrop fat-modal ck-modal' });
      var finish = function (v) { if (done) return; done = true; if (bd.parentNode) bd.parentNode.removeChild(bd); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', fit); resolve(v); };
      var onKey = function (e) { if (e.key === 'Escape') { var all = document.querySelectorAll('.modal-backdrop'); if (all[all.length - 1] === bd) { e.stopPropagation(); finish(null); } } };
      var pdfBtn = el('button', { type: 'button', class: 'btn primary', text: t('pdf'), onclick: function () {
        var d = doc(), out = html;
        if (d && (edited || (names === 'tr' && nm.map))) { d.designMode = 'off'; out = '<!doctype html>' + d.documentElement.outerHTML; }
        pdfBtn.disabled = true;
        Promise.resolve(F.report.savePdf(out, o.name)).then(function (p) { pdfBtn.disabled = false; if (p) finish(p); }, function (e) { pdfBtn.disabled = false; toast(String(e && e.message || e)); });
      } });
      var box = el('div', { class: 'modal xwide', dir: document.documentElement.dir || 'ltr' }, [
        el('div', { class: 'modal-header' }, [el('h2', { text: t('title') + (o.name ? ' · ' + String(o.name).replace(/\.pdf$/i, '') : '') }), el('button', { type: 'button', class: 'icon-btn', text: '✕', onclick: function () { finish(null); } })]),
        el('div', { class: 'modal-body' }, [steps, pv]),
        el('div', { class: 'modal-footer' }, [el('button', { type: 'button', class: 'btn', text: t('close'), onclick: function () { finish(null); } }), pdfBtn])
      ]);
      box.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      bd.appendChild(box); document.body.appendChild(bd);
      document.addEventListener('keydown', onKey); window.addEventListener('resize', fit);
      drawLg(); drawNm(); setEdit(false); load(); ensureNames().then(function () { if (names === 'tr') load(); });
    });
  }
  function toast(m) { try { var x = el('div', { class: 'toast error', text: m, style: 'position:fixed;bottom:20px;inset-inline-end:20px;z-index:100001;padding:10px 14px;border-radius:10px;background:#1f2937;color:#fff' }); document.body.appendChild(x); setTimeout(function () { x.remove(); }, 3500); } catch (e) {} }
  window.FalconCikti = { open: open, version: '1.63.0' };
})();
