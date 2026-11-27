/*!
 * Admin Duyuruları istemcisi v1.0.0 — bütün programlar için ortak.
 * Kullanım:  <script src="duyuru.js"></script>
 *            Duyuru.baslat({ uygulama: 'kitaplik', surum: '2.5.0', dil: () => 'tr' });
 * Kaynak: https://raw.githubusercontent.com/departures-mil/duyurular/main/duyurular.json
 * Görülen duyurular localStorage'da tutulur; bir duyuru bir kez açılır, sonra 🔔 listesinden okunur.
 */
(function (g) {
  'use strict';
  var KAYNAK = 'https://raw.githubusercontent.com/departures-mil/duyurular/main/duyurular.json';
  var ANAHTAR = 'admin_duyuru_gorulen';
  var YAZI = {
    tr: { baslik: 'Duyurular', tamam: 'Tamam', kapat: 'Kapat', yok: 'Henüz duyuru yok.', ac: 'Bağlantıyı aç', guncelle: 'Şimdi güncelle', onemli: 'Önemli' },
    en: { baslik: 'Announcements', tamam: 'OK', kapat: 'Close', yok: 'No announcements yet.', ac: 'Open link', guncelle: 'Update now', onemli: 'Important' },
    ar: { baslik: 'الإعلانات', tamam: 'حسناً', kapat: 'إغلاق', yok: 'لا توجد إعلانات بعد.', ac: 'فتح الرابط', guncelle: 'حدّث الآن', onemli: 'مهم' }
  };
  var A = { uygulama: '', surum: '0', dil: null, guncelle: null, aralikDk: 30, dugme: true };
  var liste = [], kuyruk = [], acik = false;

  function dil() {
    var d = '';
    try { d = typeof A.dil === 'function' ? A.dil() : A.dil; } catch (e) {}
    d = String(d || document.documentElement.lang || 'tr').slice(0, 2).toLowerCase();
    return YAZI[d] ? d : 'tr';
  }
  function T(k) { return YAZI[dil()][k]; }
  function sec(o) { if (!o) return ''; if (typeof o === 'string') return o; return o[dil()] || o.tr || o.en || o.ar || ''; }
  function kac(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function karsilastir(a, b) {
    var x = String(a).replace(/^v\.?/i, '').split('.'), y = String(b).replace(/^v\.?/i, '').split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var p = +x[i] || 0, q = +y[i] || 0; if (p !== q) return p < q ? -1 : 1; }
    return 0;
  }
  function gorulen() { try { return JSON.parse(localStorage.getItem(ANAHTAR) || '[]'); } catch (e) { return []; } }
  function gorulduYap(id) { var g2 = gorulen(); if (g2.indexOf(id) < 0) { g2.push(id); try { localStorage.setItem(ANAHTAR, JSON.stringify(g2.slice(-300))); } catch (e) {} } }

  function uygun(d) {
    if (!d || !d.id || d.aktif === false) return false;
    var h = d.hedef || ['*'];
    if (h.indexOf('*') < 0 && h.indexOf(A.uygulama) < 0) return false;
    var simdi = Date.now();
    if (d.baslangic && Date.parse(d.baslangic) > simdi) return false;
    if (d.bitis && Date.parse(d.bitis) < simdi) return false;
    if (d.altSurum && karsilastir(A.surum, d.altSurum) < 0) return false;   // bu sürümden eski programlara gösterme
    if (d.ustSurum && karsilastir(A.surum, d.ustSurum) > 0) return false;   // bu sürümden yeni programlara gösterme
    return true;
  }

  function stil() {
    if (document.getElementById('aduy-stil')) return;
    var s = document.createElement('style'); s.id = 'aduy-stil';
    s.textContent =
      '.aduy-ort{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,"Segoe UI",Tahoma,sans-serif}' +
      '.aduy-kut{background:var(--modal-bg,#fff);color:var(--text,#1d2433);border:1px solid var(--modal-border,transparent);max-width:520px;width:100%;max-height:85vh;overflow:auto;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:20px 22px}' +
      '.aduy-kut h3{margin:0 0 4px;font-size:18px}.aduy-tarih{font-size:12px;color:var(--muted,#6b7280);margin-bottom:10px}' +
      '.aduy-metin{white-space:pre-wrap;line-height:1.55;font-size:14.5px}' +
      '.aduy-et{display:inline-block;background:#dc2626;color:#fff;font-size:11px;border-radius:6px;padding:1px 7px;margin-inline-end:6px;vertical-align:middle}' +
      '.aduy-alt{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}' +
      '.aduy-alt button{border:0;border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer;background:var(--panel-hover,#e5e7eb);color:var(--text,#111)}' +
      '.aduy-alt button.ana{background:var(--grad-primary,#2563eb);color:var(--on-accent,#fff)}' +
      '.aduy-oge{border-bottom:1px solid var(--border,#e5e7eb);padding:10px 0}.aduy-oge:last-child{border:0}' +
      '.aduy-zil{position:fixed;inset-inline-end:22px;bottom:96px;z-index:2147483500;width:42px;height:42px;border-radius:50%;border:0;background:#2563eb;color:#fff;font-size:19px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);display:none}' +
      '.aduy-zil b{position:absolute;top:-3px;inset-inline-end:-3px;background:#dc2626;color:#fff;border-radius:9px;font-size:11px;min-width:18px;height:18px;line-height:18px;padding:0 4px}' +
      '';
    document.head.appendChild(s);
  }

  function pencere(ic, dugmeler) {
    stil();
    var o = document.createElement('div'); o.className = 'aduy-ort';
    o.setAttribute('dir', dil() === 'ar' ? 'rtl' : 'ltr');
    var k = document.createElement('div'); k.className = 'aduy-kut'; k.innerHTML = ic;
    var alt = document.createElement('div'); alt.className = 'aduy-alt';
    dugmeler.forEach(function (b) {
      var e = document.createElement('button'); e.textContent = b.yazi; if (b.ana) e.className = 'ana';
      e.onclick = function () { document.body.removeChild(o); b.is && b.is(); }; alt.appendChild(e);
    });
    k.appendChild(alt); o.appendChild(k); document.body.appendChild(o);
  }
  function tarih(d) { try { return new Date(d.tarih).toLocaleDateString(dil() === 'ar' ? 'ar' : dil()); } catch (e) { return ''; } }
  function govde(d) {
    return '<h3>' + (d.onem === 'onemli' ? '<span class="aduy-et">' + T('onemli') + '</span>' : '') + kac(sec(d.baslik)) + '</h3>' +
      '<div class="aduy-tarih">' + kac(tarih(d)) + '</div><div class="aduy-metin">' + kac(sec(d.metin)) + '</div>';
  }
  function linkAc(u) { try { if (g.duyuruLinkAc) return g.duyuruLinkAc(u); } catch (e) {} g.open(u, '_blank'); }

  function siradaki() {
    if (acik || !kuyruk.length || !document.body) return;
    var d = kuyruk.shift(); acik = true;
    var b = [{ yazi: T('tamam'), ana: true, is: function () { gorulduYap(d.id); acik = false; zil(); setTimeout(siradaki, 300); } }];
    if (d.link) b.unshift({ yazi: T('ac'), is: function () { gorulduYap(d.id); acik = false; linkAc(d.link); zil(); siradaki(); } });
    if (d.guncellemeDugmesi && typeof A.guncelle === 'function') b.unshift({ yazi: T('guncelle'), is: function () { gorulduYap(d.id); acik = false; zil(); try { A.guncelle(); } catch (e) {} } });
    pencere(govde(d), b);
  }

  function listeyiGoster() {
    var ic = '<h3>🔔 ' + kac(T('baslik')) + '</h3>';
    ic += liste.length ? liste.map(function (d) { return '<div class="aduy-oge">' + govde(d) + (d.link ? '<div><a href="#" data-l="' + kac(d.link) + '">' + kac(T('ac')) + '</a></div>' : '') + '</div>'; }).join('')
      : '<p>' + kac(T('yok')) + '</p>';
    pencere(ic, [{ yazi: T('kapat'), ana: true }]);
    liste.forEach(function (d) { gorulduYap(d.id); });
    Array.prototype.forEach.call(document.querySelectorAll('.aduy-kut a[data-l]'), function (a) { a.onclick = function (e) { e.preventDefault(); linkAc(a.getAttribute('data-l')); }; });
    zil();
  }

  var zilEl = null, dinleyenler = [];
  function durum() { var g2 = gorulen(); return { toplam: liste.length, yeni: liste.filter(function (d) { return g2.indexOf(d.id) < 0; }).length }; }
  function zil() {
    var dz = durum();
    dinleyenler.forEach(function (f) { try { f(dz); } catch (e) {} });
    if (!A.dugme) { if (zilEl && zilEl.parentNode) zilEl.parentNode.removeChild(zilEl); zilEl = null; return; }
    if (!document.body) return;
    stil();
    if (!zilEl) { zilEl = document.createElement('button'); zilEl.className = 'aduy-zil'; zilEl.title = T('baslik'); zilEl.onclick = listeyiGoster; document.body.appendChild(zilEl); }
    var g2 = gorulen(), yeni = liste.filter(function (d) { return g2.indexOf(d.id) < 0; }).length;
    zilEl.style.display = liste.length ? 'block' : 'none';
    zilEl.innerHTML = '🔔' + (yeni ? '<b>' + yeni + '</b>' : '');
  }

  function cek() {
    var u = (A.kaynak || KAYNAK) + '?t=' + Math.floor(Date.now() / 60000);
    return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      var t = (j && j.duyurular) || [];
      try { localStorage.setItem(ANAHTAR + '_onbellek', JSON.stringify(t)); } catch (e) {}
      isle(t);
    }).catch(function () {
      try { isle(JSON.parse(localStorage.getItem(ANAHTAR + '_onbellek') || '[]')); } catch (e) {}
    });
  }
  function isle(t) {
    liste = t.filter(uygun).sort(function (a, b) { return String(b.tarih).localeCompare(String(a.tarih)); });
    var g2 = gorulen();
    liste.slice().reverse().forEach(function (d) { if (g2.indexOf(d.id) < 0 && !kuyruk.some(function (k) { return k.id === d.id; })) kuyruk.push(d); });
    zil(); siradaki();
  }

  g.Duyuru = {
    baslat: function (ayar) {
      for (var k in ayar) A[k] = ayar[k];
      var go = function () { setTimeout(cek, 4000); setInterval(cek, Math.max(5, A.aralikDk) * 60000); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
    },
    goster: function () { listeyiGoster(); },
    yenile: cek,
    // v1.59.1: Ayarlar kartı için — sayı, değişiklik bildirimi, yüzen zili aç/kapa
    durum: durum,
    dinle: function (f) { dinleyenler.push(f); try { f(durum()); } catch (e) {} },
    dugme: function (acik) { A.dugme = !!acik; zil(); }
  };
})(typeof window !== 'undefined' ? window : this);
// v1.59.1: Telefonda sol alttaki yüzen 🔔 düğmesi içeriği kapatıyordu → varsayılan olarak gizli; duyurular Ayarlar'daki
// "Bildirimler ve Duyurular" kartından açılır. Kart masaüstünde de vardır; masaüstünde yüzen düğme varsayılan olarak açık kalır.
(function () {
  'use strict';
  var TEL = /Android|iPhone|iPad/i.test(navigator.userAgent || '');
  var ANA = 'duyuru_zil_goster';
  function zilAcik() { var v = null; try { v = localStorage.getItem(ANA); } catch (e) {} return v == null ? !TEL : v === '1'; }
  Duyuru.baslat({ uygulama: 'falcon-ofis', surum: '1.59.1', dugme: zilAcik(), dil: function () { return document.documentElement.lang; } });

  var Y = {
    tr: { baslik: 'Bildirimler ve Duyurular', sayi: 'Admin duyuruları', yeni: 'yeni', goster: 'Duyuruları göster', yenile: 'Yenile',
      zil: 'Ekranda yüzen bildirim düğmesini göster (sağ alt)', not: 'Yeni bir duyuru geldiğinde bir kez ekranda açılır; sonra buradan okunur. Yüzen düğme kapalıyken ekranın hiçbir yerini kapatmaz.' },
    en: { baslik: 'Notifications & Announcements', sayi: 'Admin announcements', yeni: 'new', goster: 'Show announcements', yenile: 'Refresh',
      zil: 'Show the floating notification button (bottom corner)', not: 'A new announcement opens once on screen; after that it can be read here. With the floating button off, nothing covers the screen.' },
    ar: { baslik: 'الإشعارات والإعلانات', sayi: 'إعلانات المسؤول', yeni: 'جديد', goster: 'عرض الإعلانات', yenile: 'تحديث',
      zil: 'إظهار زر الإشعارات العائم (الزاوية السفلية)', not: 'يُعرض الإعلان الجديد مرة واحدة على الشاشة، ثم يمكن قراءته من هنا. عند إيقاف الزر العائم لا يغطي أي جزء من الشاشة.' }
  };
  function d() { var l = String(document.documentElement.lang || 'tr').slice(0, 2).toLowerCase(); return Y[l] ? l : 'tr'; }
  function T(k) { return Y[d()][k]; }
  function kac(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function stil() {
    if (document.getElementById('dk-stil')) return;
    var s = document.createElement('style'); s.id = 'dk-stil';
    s.textContent = '.dk-kart{padding:16px;margin-top:14px}.dk-kart h3{margin:0 0 10px;font-size:15px;font-weight:600}' +
      '.dk-satir{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font-size:14px}' +
      '.dk-rozet{background:#dc2626;color:#fff;border-radius:9px;font-size:11px;min-width:18px;height:18px;line-height:18px;padding:0 6px;text-align:center}' +
      '.dk-dug{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.dk-dug button{border:1px solid rgba(127,127,127,.35);border-radius:10px;padding:8px 14px;' +
      'font-size:14px;cursor:pointer;background:rgba(127,127,127,.12);color:inherit}.dk-dug button.ana{background:#2563eb;border-color:#2563eb;color:#fff}' +
      '.dk-sec{display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;margin-bottom:8px}.dk-sec input{width:18px;height:18px}' +
      '.dk-not{font-size:12.5px;opacity:.75;line-height:1.5}';
    document.head.appendChild(s);
  }
  var son = { toplam: 0, yeni: 0 };
  function ciz(el) {
    el.setAttribute('dir', d() === 'ar' ? 'rtl' : 'ltr');
    el.innerHTML = '<h3>🔔 ' + kac(T('baslik')) + '</h3>' +
      '<div class="dk-satir">' + kac(T('sayi')) + ': <b>' + son.toplam + '</b>' + (son.yeni ? ' <span class="dk-rozet">' + son.yeni + ' ' + kac(T('yeni')) + '</span>' : '') + '</div>' +
      '<div class="dk-dug"><button type="button" class="ana" data-k="g">' + kac(T('goster')) + '</button><button type="button" data-k="y">' + kac(T('yenile')) + '</button></div>' +
      '<label class="dk-sec"><input type="checkbox" data-k="z"' + (zilAcik() ? ' checked' : '') + '> ' + kac(T('zil')) + '</label>' +
      '<div class="dk-not">' + kac(T('not')) + '</div>';
    el.querySelector('[data-k="g"]').onclick = function () { Duyuru.goster(); };
    el.querySelector('[data-k="y"]').onclick = function () { Duyuru.yenile(); };
    el.querySelector('[data-k="z"]').onchange = function (e) {
      try { localStorage.setItem(ANA, e.target.checked ? '1' : '0'); } catch (x) {}
      Duyuru.dugme(e.target.checked);
    };
  }
  var kart = null;
  function hedefBul() {
    var k = document.querySelector('.kul-kart');
    if (k) return k;
    try { if (window.Kullanim && Kullanim.metindenBul) return Kullanim.metindenBul(['Telefon ve Bilgisayar Eşitleme', 'Phone and Computer Sync', 'Phone & computer sync'], '.card, section'); } catch (e) {}
    return null;
  }
  function yerlestir() {
    var h = hedefBul();
    var kopya = document.querySelectorAll('.dk-kart');
    for (var i = 0; i < kopya.length; i++) if (kopya[i] !== kart) kopya[i].remove();
    if (!h || !h.parentNode) return;
    if (h.nextElementSibling === kart) return;
    if (!kart) { stil(); kart = document.createElement('div'); kart.className = 'card dk-kart'; ciz(kart); }
    h.parentNode.insertBefore(kart, h.nextSibling);
  }
  Duyuru.dinle(function (dz) { son = dz; if (kart) ciz(kart); });
  function bas() {
    yerlestir();
    var bek = 0;
    new MutationObserver(function () { if (!bek) bek = setTimeout(function () { bek = 0; yerlestir(); }, 60); }).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(function () { if (kart) ciz(kart); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bas); else bas();
})();
