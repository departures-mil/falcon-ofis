/* Falcon Ofis — varsayılan kayıt adlarının ekranda çevirisi (v1.60.1).
   Kasalar ve "Ana Depo" ilk kurulumda Türkçe adla oluşturulur ve telefonla aynı adla eşitlenir; bu yüzden kayıt DEĞİŞTİRİLMEZ.
   Yalnızca ekrandaki yazı, program dili İngilizce ya da Arapçayken çevrilir. Kullanıcı adı değiştirdiyse kendi adı görünür.
   Giriş kutularındaki (input/textarea) değerlere dokunulmaz: düzenlerken kaydın gerçek adı görünür. */
(function () {
  'use strict';
  var NAMES = {
    'Dolar Kasası': { en: 'USD Cash Box', ar: 'صندوق الدولار' },
    'TL Kasası': { en: 'TRY Cash Box', ar: 'صندوق الليرة التركية' },
    'Suriye Lirası Kasası': { en: 'SYP Cash Box', ar: 'صندوق الليرة السورية' },
    'Nakit Dolar': { en: 'Cash USD', ar: 'نقد بالدولار' },
    'Nakit TL': { en: 'Cash TRY', ar: 'نقد بالليرة التركية' },
    'Nakit Suriye Lirası': { en: 'Cash SYP', ar: 'نقد بالليرة السورية' },
    'Türk Lirası': { en: 'Turkish Lira', ar: 'الليرة التركية' },
    'Ana Depo': { en: 'Main Warehouse', ar: 'المستودع الرئيسي' },
  };
  var REVERSE = {};
  Object.keys(NAMES).forEach(function (tr) { REVERSE[NAMES[tr].en] = tr; REVERSE[NAMES[tr].ar] = tr; });
  var SKIP = { INPUT: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1, OPTION: 0 };

  function lang() { var l = (document.documentElement.getAttribute('lang') || 'tr').slice(0, 2); return l === 'en' || l === 'ar' ? l : 'tr'; }
  function fix(node, l) {
    var p = node.parentNode;
    if (!p || SKIP[p.nodeName] || (p.isContentEditable)) return;
    var raw = node.nodeValue; if (!raw) return;
    var t = raw.trim(); if (!t || t.length > 40) return;
    var base = NAMES[t] ? t : REVERSE[t];
    if (!base) return;
    var want = l === 'tr' ? base : NAMES[base][l];
    if (want !== t) node.nodeValue = raw.replace(t, want);
  }
  function walk(root, l) {
    if (!root) return;
    if (root.nodeType === 3) { fix(root, l); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) fix(w.currentNode, l);
  }
  var pending = [], scheduled = false;
  function flush() {
    scheduled = false; var l = lang(), list = pending; pending = [];
    for (var i = 0; i < list.length; i++) walk(list[i], l);
  }
  function queue(n) { pending.push(n); if (!scheduled) { scheduled = true; (window.requestAnimationFrame || setTimeout)(flush); } }

  function start() {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') queue(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) queue(m.addedNodes[j]);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    new MutationObserver(function () { queue(document.body); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    queue(document.body);
  }
  window.FalconAdlar = { NAMES: NAMES, translate: function (t, l) { var b = NAMES[t] ? t : REVERSE[t]; return !b ? t : (l || lang()) === 'tr' ? b : NAMES[b][l || lang()]; } };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
