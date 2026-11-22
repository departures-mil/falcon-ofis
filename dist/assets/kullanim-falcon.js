/* v1.54: Ayarlar'da "Kullanım Limitleri" kartı (eşitleme kartının hemen altında). Sayım ana süreçte yapılır,
 * buraya window.Kullanim.ice(...) ile aktarılır; telefonda fetch doğrudan izlenir. */
(function () {
  'use strict';
  if (!window.Kullanim) return;
  var proje = '';
  function oku() {
    try { var s = window.falcon && window.falcon.sync; if (s && s.status) s.status().then(function (st) { proje = (st && st.connected && st.projectId) || ''; }).catch(function () {}); } catch (e) {}
  }
  Kullanim.baslat({ uygulama: 'falcon-ofis', dil: function () { return document.documentElement.lang; }, bulut: true, ai: false,
    proje: function () { return proje; }, sinif: 'card' });
  oku(); setInterval(oku, 20000);
  try { if (window.falcon && window.falcon.sync && window.falcon.sync.onStatus) window.falcon.sync.onStatus(function (st) { proje = (st && st.connected && st.projectId) || ''; }); } catch (e) {}
  Kullanim.yerlestir(function () {
    return Kullanim.metindenBul(['Telefon ve Bilgisayar Eşitleme', 'Phone and Computer Sync', 'Phone & computer sync'], '.card, section');
  });
})();
