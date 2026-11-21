/*
 * v1.52: Ayarlar sayfasının sonuna "Admin ile iletişime geç" bölümü ekler (arayüz paketinden bağımsız küçük eklenti).
 * Mesaj ana süreçte (falcon.sendContact) FormSubmit ile yöneticiye gönderilir.
 */
(function () {
  'use strict';
  var T = {
    tr: { title: 'Admin ile iletişime geç', desc: 'Programı geliştirmemiz için öneri, istek ve hata bildirimlerinizi yazın; mesajınız doğrudan yöneticiye ulaşır.', name: 'Adınız (isteğe bağlı)', mail: 'E-posta (yanıt için, isteğe bağlı)', msg: 'Mesajınız', send: 'Gönder', empty: 'Lütfen mesajınızı yazın.', bad: 'E-posta adresi geçerli değil.', sending: 'Gönderiliyor…', ok: 'Mesajınız yöneticiye iletildi. Teşekkürler!', fail: 'Mesaj gönderilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.' },
    en: { title: 'Contact the admin', desc: 'Send suggestions, requests and bug reports to help us improve the program; your message goes straight to the administrator.', name: 'Your name (optional)', mail: 'Email (for a reply, optional)', msg: 'Your message', send: 'Send', empty: 'Please write your message.', bad: 'The email address is not valid.', sending: 'Sending…', ok: 'Your message has been delivered to the administrator. Thank you!', fail: 'The message could not be sent. Check your internet connection and try again.' },
    ar: { title: 'التواصل مع المسؤول', desc: 'أرسل اقتراحاتك وطلباتك وبلاغات الأخطاء لمساعدتنا على تطوير البرنامج؛ تصل رسالتك مباشرة إلى المسؤول.', name: 'اسمك (اختياري)', mail: 'البريد الإلكتروني (للرد، اختياري)', msg: 'رسالتك', send: 'إرسال', empty: 'يرجى كتابة رسالتك.', bad: 'عنوان البريد الإلكتروني غير صالح.', sending: 'جارٍ الإرسال…', ok: 'تم إيصال رسالتك إلى المسؤول. شكرًا لك!', fail: 'تعذّر إرسال الرسالة. تحقّق من اتصالك بالإنترنت وحاول مجددًا.' }
  };
  function L() { var l = (document.documentElement.lang || 'tr').slice(0, 2); return T[l] || T.tr; }
  function api() { return window.falcon && window.falcon.sendContact; }
  function mk(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }
  function build() {
    var t = L();
    var sec = mk('section', { class: 'card', id: 'fo-contact', 'data-lang': document.documentElement.lang || 'tr' });
    sec.appendChild(mk('h3', { class: 'section-title' }, '✉ ' + t.title));
    sec.appendChild(mk('p', { class: 'muted' }, t.desc));
    var box = mk('div', { style: 'display:grid;gap:8px;margin-top:8px' });
    var name = mk('input', { class: 'input', dir: 'auto', maxlength: '80', placeholder: t.name });
    var mail = mk('input', { class: 'input', dir: 'ltr', maxlength: '120', type: 'email', placeholder: t.mail });
    var msg = mk('textarea', { class: 'input', dir: 'auto', maxlength: '5000', rows: '5', placeholder: t.msg, style: 'resize:vertical;width:100%;box-sizing:border-box' });
    var st = mk('div', { class: 'muted', role: 'status' });
    var btn = mk('button', { class: 'btn primary', type: 'button' }, '✉ ' + t.send);
    btn.addEventListener('click', function () {
      var m = msg.value.trim(), e = mail.value.trim();
      if (!m) { st.textContent = t.empty; return; }
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { st.textContent = t.bad; return; }
      btn.disabled = true; st.textContent = t.sending;
      Promise.resolve(api()({ name: name.value.trim(), email: e, message: m, lang: document.documentElement.lang || 'tr' }))
        .then(function (r) { if (r && r.ok) { msg.value = ''; st.textContent = t.ok; } else st.textContent = t.fail; })
        .catch(function () { st.textContent = t.fail; })
        .then(function () { btn.disabled = false; });
    });
    [name, mail, msg, btn, st].forEach(function (x) { box.appendChild(x); });
    sec.appendChild(box);
    return sec;
  }
  function ensure() {
    if (!api()) return;
    var grid = document.querySelector('.settings-grid');
    if (!grid) return;
    var cur = document.getElementById('fo-contact');
    if (cur && (cur.parentNode !== grid || grid.lastElementChild !== cur || cur.getAttribute('data-lang') !== (document.documentElement.lang || 'tr'))) {
      if (cur.getAttribute('data-lang') !== (document.documentElement.lang || 'tr')) { cur.remove(); cur = null; } else { grid.appendChild(cur); return; }
    }
    if (!cur) grid.appendChild(build());
  }
  var pending = false;
  new MutationObserver(function () { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; try { ensure(); } catch (e) {} }); })
    .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['lang'] });
})();
