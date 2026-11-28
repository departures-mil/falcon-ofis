/* Falcon Ofis 1.70 — telefonda «Çevrimdışı yapay zekâ» kartı (masaüstünde fc-falcon.js yerelZekaCard gösterir).
   Telefon çalışma zamanı assets/yz/fc-yerel-zeka-web.js (PP-OCRv5 + Tesseract OCR, NLLB-200 çeviri; paketler GitHub'dan bir kez iner).
   Kart Ayarlar'da Telegram kartından (yoksa Bildirimler / Kullanım kartından) sonra durur. */
(function () {
  'use strict';
  var kart = null;
  function hedef() { return document.querySelector('.tgf-kart') || document.querySelector('.dk-kart') || document.querySelector('.kul-kart'); }
  function yerlestir() {
    var Y = window.FCYZ, B = window.fcYerelZeka;
    if (!Y || !B || !B.telefon) return; // masaüstü: fc-falcon.js
    var h = hedef();
    if (!h || !h.parentNode) { if (kart && !document.body.contains(kart)) kart = null; return; }
    if (h.nextElementSibling === kart) return;
    if (!kart) {
      var lg = document.documentElement.lang || 'tr';
      kart = document.createElement('div'); kart.className = 'card yzf-kart'; kart.style.cssText = 'padding:16px;margin-top:14px';
      var t = document.createElement('h3'); t.style.cssText = 'margin:0 0 8px;font-size:15px;font-weight:600'; t.textContent = Y.title({ lang: lg });
      kart.appendChild(t); kart.appendChild(Y.card({ lang: lg, packs: ['ocr', 'mt'] }));
    }
    h.parentNode.insertBefore(kart, h.nextSibling);
  }
  function bas() {
    yerlestir();
    var bek = 0;
    new MutationObserver(function () { if (!bek) bek = setTimeout(function () { bek = 0; yerlestir(); }, 120); }).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(function () { if (kart) { kart.remove(); kart = null; yerlestir(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bas); else bas();
})();
