/*
 * Falcon Ofis v1.68 — Telegram «Kayıtlı Mesajlar»dan Sham Cash dekontu → otomatik kayıt.
 * Kullanıcı Telegram'da Kayıtlı Mesajlar'a dekontu (PDF / JPEG / PNG) gönderip yanına (altyazı) ya da hemen önüne / arkasına «sisteme ekle»
 * yazınca program dekontu indirir, 1.67 okuyucusuyla okur (online → offline teyit; online uzun sürerse offline ile) ve onay beklemeden
 * Para Girişi / Çıkışı olarak kaydeder (FalconShamDekont.autoImport). Kayıt sonradan elle düzeltilebilir; şüpheli kayıtlar Ayarlar →
 * Telegram kartında «gözden geçir» olarak listelenir (kayıt düzenlenince ya da «✓ Gözden geçirdim» ile kalkar).
 * Telegram oturumu (GramJS, telegram-vendor.js) yalnız bu cihazda saklanır (localStorage), eşitlenmez.
 * Aynı tetik iki kez işlenmez: işlenen mesaj no'ları + Kayıtlı Mesajlar'daki «🦅 Falcon Ofis» yanıtı (iki cihaz da görür) + Sham Cash işlem no.
 */
(function () {
  'use strict';
  var VERSION = '1.68.0';
  // Telegram uygulama anahtarı (my.telegram.org → Falcon Ofis). localStorage.tg_api = "id:hash" ile değiştirilebilir.
  var API_ID = 0, API_HASH = '';
  var MARK = '🦅 Falcon Ofis';
  var TX = {
    tr: {
      title: 'Telegram → Sham Cash dekontu', desc: 'Telegram\'da «Kayıtlı Mesajlar»a Sham Cash dekontunu (PDF / resim) gönderip yanına «{w}» yazın: dekont okunur ve Para Girişi / Çıkışı olarak kendiliğinden kaydedilir. Kayıtları sonradan Kasa\'dan düzeltebilirsiniz.',
      connect: 'Telegram\'a bağlan', phone: 'Telefon numarası (+90…, +963…)', sendCode: 'Kod gönder', code: 'Telegram\'dan gelen kod', signIn: 'Giriş', pw: 'İki adımlı doğrulama şifresi', cancel: 'Vazgeç',
      codeSent: 'Kod Telegram uygulamanıza mesaj olarak gönderildi.', connecting: 'Bağlanıyor…', connected: 'Bağlı: {n}', logout: 'Telegram oturumunu kapat',
      on: 'Otomatik ekle (Kayıtlı Mesajlar izlenir)', trigger: 'Tetik sözcüğü', wait: 'Online okuma en çok (sn) — sonra offline ile kaydedilir', check: 'Şimdi kontrol et',
      last: 'Son kontrol: {t}', never: 'henüz kontrol edilmedi', busy: 'Kontrol ediliyor…', noKey: 'Telegram uygulama anahtarı tanımlı değil.', offline: 'İnternet yok — bağlantı gelince kontrol edilir.',
      me: 'Benim Sham Cash adım / hesabım (yön buna göre bulunur)', meAdd: 'Ekle', meEmpty: '⚠ Adınız tanımlı değil: yön dekont türünden (SEND / RECEIVE) bulunur. Adınızı ekleyin.', meDel: 'Sil',
      list: 'Telegram\'dan gelen kayıtlar', none: 'Henüz kayıt yok.', review: 'gözden geçir', reviewed: '✓ Gözden geçirdim', open: 'Dekont', okRow: '✓', recs: '{n} kayıt gözden geçirilmeli',
      in: 'Para Girişi', out: 'Para Çıkışı', dup: 'zaten kayıtlı', fail: 'eklenemedi',
      rvunread: 'dekont okunamadı', rvdiff: 'online / offline farklı', rvconflict: 'ad ile dekont türü çelişiyor', rvdir: 'yön belirsiz (Çıkış sayıldı)', rvref: 'işlem no okunamadı', rvdate: 'tarih okunamadı',
      rvcurrency: 'para birimi okunamadı', rvaccount: 'uygun kasa yok (ilk kasa seçildi)', rvlatediff: 'sonradan gelen okuma farklı', rvnotfound: 'dekont bulunamadı',
      srcboth: 'online + offline teyitli', srcai: 'online', srcoffline: 'offline', srcnone: 'okunamadı',
      rAdded: '✅ {d} eklendi · {a} {c} · {k}{r}', rReview: '\n⚠ Kontrol et: {x}', rDup: 'ℹ Bu dekont zaten kayıtlı (#{r}).', rNone: '⚠ «{w}» yazıldı ama dekont (PDF / resim) bulunamadı. Dekontu gönderip tekrar «{w}» yazın.',
      rFail: '⚠ Eklenemedi: {e}. Dekont dosyası programa kaydedildi; Kasa\'dan elle ekleyin.', eAmount: 'tutar okunamadı', eType: 'yalnız PDF / JPEG / PNG', eOther: 'hata',
      nTitle: 'Telegram dekontu eklendi', nBody: '{d} · {a} {c}', autoOn: 'Telegram bağlandı — Kayıtlı Mesajlar izleniyor.', loginErr: 'Giriş olmadı: {e}', oneDevice: 'Öneri: otomatik eklemeyi tek cihazda açın (telefon). Aynı dekont iki kez eklenmez.',
      dev_phone: 'telefon', dev_desktop: 'masaüstü', phoneBad: 'Numarayı uluslararası biçimde yazın (ör. +963…).', codeBad: 'Kod yanlış ya da süresi doldu.', pwBad: 'Şifre yanlış.', flood: 'Çok fazla deneme — biraz bekleyin.'
    },
    en: {
      title: 'Telegram → Sham Cash receipt', desc: 'Send the Sham Cash receipt (PDF / image) to «Saved Messages» in Telegram and write «{w}» with it: the receipt is read and recorded as Money In / Out automatically. You can correct records later in Cash.',
      connect: 'Connect to Telegram', phone: 'Phone number (+90…, +963…)', sendCode: 'Send code', code: 'Code from Telegram', signIn: 'Sign in', pw: 'Two-step verification password', cancel: 'Cancel',
      codeSent: 'The code was sent as a message to your Telegram app.', connecting: 'Connecting…', connected: 'Connected: {n}', logout: 'Log out of Telegram',
      on: 'Add automatically (watch Saved Messages)', trigger: 'Trigger phrase', wait: 'Max online reading (s) — then saved with the offline reading', check: 'Check now',
      last: 'Last check: {t}', never: 'not checked yet', busy: 'Checking…', noKey: 'Telegram app key is not set.', offline: 'No internet — will check when online.',
      me: 'My Sham Cash name / account (direction is found from it)', meAdd: 'Add', meEmpty: '⚠ Your name is not set: direction comes from the receipt type (SEND / RECEIVE). Add your name.', meDel: 'Remove',
      list: 'Records from Telegram', none: 'No records yet.', review: 'review', reviewed: '✓ Reviewed', open: 'Receipt', okRow: '✓', recs: '{n} records need review',
      in: 'Money In', out: 'Money Out', dup: 'already recorded', fail: 'not added',
      rvunread: 'receipt not read', rvdiff: 'online / offline differ', rvconflict: 'name and receipt type conflict', rvdir: 'direction unclear (counted as Out)', rvref: 'transaction no not read', rvdate: 'date not read',
      rvcurrency: 'currency not read', rvaccount: 'no matching cash account (first one used)', rvlatediff: 'later reading differs', rvnotfound: 'receipt not found',
      srcboth: 'online + offline verified', srcai: 'online', srcoffline: 'offline', srcnone: 'not read',
      rAdded: '✅ {d} added · {a} {c} · {k}{r}', rReview: '\n⚠ Check: {x}', rDup: 'ℹ This receipt is already recorded (#{r}).', rNone: '⚠ «{w}» was written but no receipt (PDF / image) was found. Send the receipt and write «{w}» again.',
      rFail: '⚠ Not added: {e}. The receipt file was saved in the program; add it manually in Cash.', eAmount: 'amount not read', eType: 'PDF / JPEG / PNG only', eOther: 'error',
      nTitle: 'Telegram receipt added', nBody: '{d} · {a} {c}', autoOn: 'Telegram connected — watching Saved Messages.', loginErr: 'Sign-in failed: {e}', oneDevice: 'Tip: turn automatic adding on in one device only (the phone). The same receipt is never added twice.',
      dev_phone: 'phone', dev_desktop: 'desktop', phoneBad: 'Write the number in international format (e.g. +963…).', codeBad: 'Wrong or expired code.', pwBad: 'Wrong password.', flood: 'Too many attempts — please wait.'
    },
    ar: {
      title: 'تيليغرام ← إيصال شام كاش', desc: 'أرسل إيصال شام كاش (PDF / صورة) إلى «الرسائل المحفوظة» في تيليغرام واكتب معه «{w}»: يُقرأ الإيصال ويُسجَّل تلقائياً كإدخال / إخراج نقدية. يمكنك تصحيح السجلات لاحقاً من الصندوق.',
      connect: 'الاتصال بتيليغرام', phone: 'رقم الهاتف (‎+963…)', sendCode: 'إرسال الرمز', code: 'الرمز الوارد من تيليغرام', signIn: 'تسجيل الدخول', pw: 'كلمة مرور التحقق بخطوتين', cancel: 'إلغاء',
      codeSent: 'أُرسل الرمز كرسالة إلى تطبيق تيليغرام لديك.', connecting: 'جارٍ الاتصال…', connected: 'متصل: {n}', logout: 'تسجيل الخروج من تيليغرام',
      on: 'إضافة تلقائية (مراقبة الرسائل المحفوظة)', trigger: 'عبارة التشغيل', wait: 'أقصى مدة للقراءة عبر الإنترنت (ثانية) — ثم يُحفظ بالقراءة دون اتصال', check: 'تحقّق الآن',
      last: 'آخر تحقّق: {t}', never: 'لم يُتحقَّق بعد', busy: 'جارٍ التحقّق…', noKey: 'مفتاح تطبيق تيليغرام غير معرَّف.', offline: 'لا يوجد إنترنت — سيتم التحقّق عند الاتصال.',
      me: 'اسمي / حسابي في شام كاش (يُحدَّد الاتجاه بحسبه)', meAdd: 'إضافة', meEmpty: '⚠ اسمك غير معرَّف: يُؤخذ الاتجاه من نوع الإيصال (SEND / RECEIVE). أضف اسمك.', meDel: 'حذف',
      list: 'السجلات الواردة من تيليغرام', none: 'لا توجد سجلات بعد.', review: 'للمراجعة', reviewed: '✓ تمت المراجعة', open: 'الإيصال', okRow: '✓', recs: '{n} سجلات بحاجة إلى مراجعة',
      in: 'إدخال نقدية', out: 'إخراج نقدية', dup: 'مسجَّل مسبقاً', fail: 'لم يُضَف',
      rvunread: 'تعذّرت قراءة الإيصال', rvdiff: 'اختلاف بين القراءتين', rvconflict: 'تعارض بين الاسم ونوع الإيصال', rvdir: 'الاتجاه غير واضح (اعتُبر إخراجاً)', rvref: 'تعذّرت قراءة رقم العملية', rvdate: 'تعذّرت قراءة التاريخ',
      rvcurrency: 'تعذّرت قراءة العملة', rvaccount: 'لا يوجد صندوق مناسب (اختير الأول)', rvlatediff: 'القراءة اللاحقة مختلفة', rvnotfound: 'لم يُعثر على الإيصال',
      srcboth: 'مؤكَّد عبر الإنترنت ودون اتصال', srcai: 'عبر الإنترنت', srcoffline: 'دون اتصال', srcnone: 'لم يُقرأ',
      rAdded: '✅ أُضيف {d} · {a} {c} · {k}{r}', rReview: '\n⚠ للتحقّق: {x}', rDup: 'ℹ هذا الإيصال مسجَّل مسبقاً (#{r}).', rNone: '⚠ كُتب «{w}» لكن لم يُعثر على إيصال (PDF / صورة). أرسل الإيصال واكتب «{w}» مجدداً.',
      rFail: '⚠ لم يُضَف: {e}. حُفظ ملف الإيصال في البرنامج؛ أضِفه يدوياً من الصندوق.', eAmount: 'تعذّرت قراءة المبلغ', eType: 'PDF / JPEG / PNG فقط', eOther: 'خطأ',
      nTitle: 'أُضيف إيصال من تيليغرام', nBody: '{d} · {a} {c}', autoOn: 'تم الاتصال بتيليغرام — تُراقَب الرسائل المحفوظة.', loginErr: 'تعذّر تسجيل الدخول: {e}', oneDevice: 'نصيحة: فعّل الإضافة التلقائية على جهاز واحد فقط (الهاتف). لا يُضاف الإيصال نفسه مرتين.',
      dev_phone: 'الهاتف', dev_desktop: 'الحاسوب', phoneBad: 'اكتب الرقم بالصيغة الدولية (مثل ‎+963…).', codeBad: 'الرمز خاطئ أو منتهي الصلاحية.', pwBad: 'كلمة المرور خاطئة.', flood: 'محاولات كثيرة — انتظر قليلاً.'
    }
  };
  var lang = function () { var l = String(document.documentElement.lang || 'tr').slice(0, 2); return TX[l] ? l : 'tr'; };
  var t = function (k, v) { var s = (TX[lang()] || TX.tr)[k]; if (s == null) s = TX.tr[k] != null ? TX.tr[k] : k; if (v) for (var x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
  var F = function () { return window.falcon || {}; };
  var D = function () { return window.FalconShamDekont; };
  var base = (function () { try { var s = document.currentScript && document.currentScript.src; if (s) return s.replace(/[^\/]*$/, ''); } catch (e) {} return './assets/'; })();

  // ---------- yerel durum (bu cihaz) ----------
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (e) {} return null; }
  function lsJ(k, d) { try { var v = JSON.parse(ls(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function apiKey() {
    var rx = /^(\d+):([0-9a-f]{32})$/i, m = rx.exec(String(ls('tg_api') || '')) || rx.exec(String(ls('tg_api_remote') || ''));
    return m ? { id: +m[1], hash: m[2] } : (API_ID && API_HASH ? { id: API_ID, hash: API_HASH } : null);
  }
  // Uygulama anahtarı GitHub'daki guncelleme/telegram.json'dan da gelir (yeni sürüm beklemeden); son değer saklanır
  var KEY_URL = 'https://raw.githubusercontent.com/departures-mil/falcon-ofis/main/guncelleme/telegram.json';
  var keyP = null;
  function remoteKey() {
    if (keyP) return keyP;
    keyP = fetch(KEY_URL + '?t=' + Math.floor(Date.now() / 3600000), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && /^\d+$/.test(String(j.api_id)) && /^[0-9a-f]{32}$/i.test(String(j.api_hash || ''))) { var v = j.api_id + ':' + j.api_hash; if (ls('tg_api_remote') !== v) { ls('tg_api_remote', v); emit(); } }
    }).catch(function () {}).then(function () { setTimeout(function () { keyP = null; }, 600000); });
    return keyP;
  }
  var cfg = {
    on: function () { return ls('tg_on') !== '0'; },
    trigger: function () { return String(ls('tg_trigger') || 'sisteme ekle'); },
    wait: function () { var n = Number(ls('tg_wait')); return n >= 3 && n <= 60 ? n : 15; },
    session: function () { return String(ls('tg_session') || ''); }
  };
  function doneSet() { return lsJ('tg_done', []); }
  function isDone(id) { return doneSet().indexOf(id) >= 0; }
  function markDone(ids) { var a = doneSet(); ids.forEach(function (i) { if (a.indexOf(i) < 0) a.push(i); }); if (a.length > 1500) a = a.slice(-1500); ls('tg_done', JSON.stringify(a)); }

  // Kayıt günlüğü (eşitlenen ayar: telefonda eklenen kayıtlar masaüstünde de görünür)
  function setting(k) { try { return Promise.resolve(F().settings.get(k)).then(function (v) { return v == null ? '' : String(v); }, function () { return ''; }); } catch (e) { return Promise.resolve(''); } }
  function setSetting(k, v) { try { return Promise.resolve(F().settings.set(k, v)).catch(function () {}); } catch (e) { return Promise.resolve(); } }
  function dbAll(sql, p) { try { return Promise.resolve(F().db.all(sql, p || [])).then(function (r) { return Array.isArray(r) ? r : (r && r.data) || []; }, function () { return []; }); } catch (e) { return Promise.resolve([]); } }
  var logQ = Promise.resolve();
  function getLog() { return setting('telegram_log').then(function (v) { try { var a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }); }
  function editLog(fn) {
    logQ = logQ.then(function () { return getLog().then(function (a) { a = fn(a) || a; if (a.length > 150) a = a.slice(-150); return setSetting('telegram_log', JSON.stringify(a)); }); }).catch(function () {});
    return logQ;
  }

  // ---------- Telegram istemcisi ----------
  var vendorP = null;
  function vendor() {
    if (window.FalconGram) return Promise.resolve(window.FalconGram);
    if (vendorP) return vendorP;
    vendorP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = base + 'telegram-vendor.js';
      s.onload = function () { window.FalconGram ? res(window.FalconGram) : rej(new Error('vendor')); };
      s.onerror = function () { vendorP = null; rej(new Error('vendor')); };
      document.head.appendChild(s);
    });
    return vendorP;
  }
  var client = null, clientP = null, handlerOn = false;
  function makeClient(sess) {
    var k = apiKey();
    if (!k) return Promise.reject(new Error('NO_KEY'));
    return vendor().then(function (G) {
      var c = new G.TelegramClient(new G.StringSession(sess || ''), k.id, k.hash, {
        connectionRetries: 3, useWSS: true, autoReconnect: true, deviceModel: 'Falcon Ofis', appVersion: VERSION, systemVersion: F().platform === 'android' ? 'Android' : 'Windows',
        langCode: lang() === 'ar' ? 'ar' : lang() === 'en' ? 'en' : 'tr'
      });
      try { c.setLogLevel('none'); } catch (e) {}
      return c;
    });
  }
  function getClient() {
    if (client && client.connected) return Promise.resolve(client);
    if (clientP) return clientP;
    var sess = cfg.session();
    if (!sess) return Promise.reject(new Error('NO_SESSION'));
    clientP = (client ? Promise.resolve(client) : makeClient(sess)).then(function (c) {
      client = c;
      return c.connect().then(function () { return c.checkAuthorization(); }).then(function (ok) {
        if (!ok) { ls('tg_session', null); ls('tg_user', null); client = null; throw new Error('AUTH_KEY_UNREGISTERED'); }
        listen(c);
        return c;
      });
    }).then(function (c) { clientP = null; return c; }, function (e) { clientP = null; throw e; });
    return clientP;
  }
  function listen(c) {
    if (handlerOn) return;
    try {
      var G = window.FalconGram;
      c.addEventHandler(function (ev) {
        var m = ev && ev.message; if (!m) return;
        if (m.media || trig(m.message) != null) setTimeout(scan, 2500);
      }, new G.NewMessage({ chats: ['me'] }));
      handlerOn = true;
    } catch (e) {}
  }

  // ---------- tetik ----------
  function norm(s) { return String(s || '').toLocaleLowerCase('tr').replace(/[‎‏]/g, '').replace(/[.,!?;:«»"'()\-–—_*]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  // metin tetik içeriyorsa tetikten sonraki ek metni (not) döner; içermiyorsa null
  function trig(text) {
    var w = norm(cfg.trigger()), x = norm(text);
    if (!w || !x) return null;
    var i = (' ' + x + ' ').indexOf(' ' + w + ' ');
    if (i < 0) return null;
    var raw = String(text || '').trim(), rest = x.slice(i + w.length).trim();
    if (!rest) return '';
    // ek metni olduğu gibi (büyük / küçük harf korunur) almaya çalış
    var j = raw.toLocaleLowerCase('tr').indexOf(cfg.trigger().toLocaleLowerCase('tr'));
    return j >= 0 ? raw.slice(j + cfg.trigger().length).replace(/^[\s:,.\-–—]+/, '').trim() : rest;
  }
  function fileOf(m) {
    if (!m || !m.media) return null;
    if (m.photo) return { name: 'telegram-' + m.id + '.jpg', mime: 'image/jpeg', size: 0 };
    var d = m.document; if (!d) return null;
    var mime = String(d.mimeType || ''), name = '';
    try { (d.attributes || []).forEach(function (a) { if (a.fileName) name = a.fileName; }); } catch (e) {}
    if (!name) name = 'telegram-' + m.id + (mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg');
    if (!/^(application\/pdf|image\/jpeg|image\/png)$/.test(mime) && !/\.(pdf|jpe?g|png)$/i.test(name)) return { bad: true, name: name, mime: mime };
    var size = Number(d.size && d.size.toString ? d.size.toString() : d.size) || 0;
    if (size > 20 * 1024 * 1024) return { bad: true, name: name, mime: mime };
    return { name: name, mime: mime || (/\.pdf$/i.test(name) ? 'application/pdf' : /\.png$/i.test(name) ? 'image/png' : 'image/jpeg'), size: size };
  }
  function replyTo(m) { try { return m.replyTo && (m.replyTo.replyToMsgId || m.replyTo.replyToMsgId === 0) ? m.replyTo.replyToMsgId : null; } catch (e) { return null; } }

  // Mesaj listesinden (yeniden eskiye) iş planı: [{ trig: m, note, docs: [m], wait }]
  function plan(msgs, now) {
    var asc = msgs.slice().sort(function (a, b) { return a.id - b.id; });
    var answered = {};
    asc.forEach(function (m) { if (String(m.message || '').indexOf(MARK) === 0) { var r = replyTo(m); if (r) answered[r] = 1; } });
    var jobs = [], used = {};
    var withinMin = function (a, b, min) { return Math.abs((a.date || 0) - (b.date || 0)) <= min * 60; };
    var group = function (m) { return m.groupedId ? asc.filter(function (x) { return x.groupedId && String(x.groupedId) === String(m.groupedId); }) : [m]; };
    for (var i = 0; i < asc.length; i++) {
      var m = asc[i];
      if (String(m.message || '').indexOf(MARK) === 0) continue;
      var note = trig(m.message);
      if (note == null || isDone(m.id) || answered[m.id]) continue;
      if (now - (m.date || 0) > 7 * 86400) continue; // bir haftadan eski tetikler işlenmez
      var docs = [];
      if (fileOf(m)) docs = group(m);
      else {
        // önce: tetikten hemen önceki (30 dk içinde) dekont mesajları; araya yazı / başka tetik girerse durulur
        for (var j = i - 1; j >= 0; j--) {
          var p = asc[j];
          if (!fileOf(p) || p.message && trig(p.message) != null || String(p.message || '').indexOf(MARK) === 0 || !withinMin(p, m, 30)) break;
          if (isDone(p.id) || used[p.id]) break;
          docs.unshift(p);
        }
        if (!docs.length) {
          // sonra: tetikten hemen sonra gelen dekont (5 dk içinde)
          for (var k2 = i + 1; k2 < asc.length; k2++) {
            var q = asc[k2];
            if (!fileOf(q) || q.message && trig(q.message) != null || !withinMin(q, m, 5)) break;
            if (isDone(q.id) || used[q.id]) break;
            docs.push(q);
          }
        }
      }
      docs = docs.filter(function (d, ix, arr) { return arr.indexOf(d) === ix && !isDone(d.id) && !used[d.id]; });
      docs.forEach(function (d) { used[d.id] = 1; });
      jobs.push({ trig: m, note: note, docs: docs, wait: !docs.length && now - (m.date || 0) < 120 });
    }
    return jobs;
  }

  // ---------- işleme ----------
  var busy = false, lastCheck = 0, lastErr = '', listeners = [];
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  function fmtAmt(a, c) { try { return Number(a).toLocaleString(lang() === 'ar' ? 'ar-SY' : lang() === 'en' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 2 }); } catch (e) { return String(a); } }
  function rvText(codes) { return (codes || []).map(function (c) { return t('rv' + c); }).join(', '); }
  function say(c, m, text) { return Promise.resolve(c.sendMessage('me', { message: MARK + ': ' + text, replyTo: m.id })).catch(function () {}); }
  function notify(title, body) { try { if (F().notify) F().notify(title, body); } catch (e) {} }

  function processDoc(c, job, dm) {
    var fi = fileOf(dm);
    if (!fi || fi.bad) return Promise.resolve({ fail: 'type' });
    return Promise.resolve(c.downloadMedia(dm, {})).then(function (buf) {
      var u8 = buf instanceof Uint8Array ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice() : new Uint8Array(buf || []);
      if (!u8.length) throw new Error('download');
      return D().autoImport(u8, { name: fi.name, mime: fi.mime, maxWait: cfg.wait(), description: '📨 Telegram', refHint: dm.id });
    }).then(function (r) { return r; }, function (e) { return { fail: e && e.code === 'ERR_SC_AMOUNT' ? 'amount' : 'other', err: String(e && (e.code || e.message) || e) }; });
  }
  function noteOf(job) { return job.note && job.note.trim() ? job.note.trim() : ''; }
  function afterImport(r, job, dm) {
    // kullanıcının tetiğe eklediği metin → Notum; kaydın son updated_at'i (düzenlenince «gözden geçir» kalkar)
    var nt = noteOf(job);
    var p = nt && r.id && !r.duplicate ? Promise.resolve(F().call('setShamCashNote', { id: r.id, note: nt })).catch(function () {}) : Promise.resolve();
    return p.then(function () { return r.id ? dbAll('SELECT updated_at FROM cash_transactions WHERE id = ?', [r.id]) : []; }).then(function (u) {
      var e = { m: job.trig.id, d: dm.id, at: new Date().toISOString(), tx: r.id || null, dir: r.direction || '', amt: r.amount || 0, cur: r.currency || '', ref: r.ref || '',
        src: r.source || '', rv: r.duplicate ? [] : (r.review || []), ok: !!r.duplicate || !(r.review && r.review.length), dup: !!r.duplicate, u: u[0] ? u[0].updated_at : '', acc: r.accountName || '',
        who: r.other || '', fail: r.fail || '', dev: F().platform === 'android' ? 'phone' : 'desktop' };
      return editLog(function (a) { a.push(e); return a; }).then(function () { return e; });
    });
  }
  function lateCheck(r, entry) {
    if (!r.late) return;
    r.late.then(function (x) {
      if (!x || !x.diffs || !x.diffs.length) return;
      editLog(function (a) { a.forEach(function (e) { if (e.tx === entry.tx && e.d === entry.d) { if (e.rv.indexOf('latediff') < 0) e.rv.push('latediff'); e.ok = false; } }); return a; }).then(emit);
    });
  }
  function runJob(c, job) {
    if (!job.docs.length) {
      if (job.wait) return Promise.resolve(); // dekont henüz gelmedi olabilir: sonraki kontrolde
      markDone([job.trig.id]);
      return say(c, job.trig, t('rNone', { w: cfg.trigger() })).then(function () { return editLog(function (a) { a.push({ m: job.trig.id, at: new Date().toISOString(), rv: ['notfound'], ok: false, fail: 'notfound', dev: F().platform === 'android' ? 'phone' : 'desktop' }); return a; }); });
    }
    var lines = [], seq = Promise.resolve(), added = 0;
    job.docs.forEach(function (dm) {
      seq = seq.then(function () {
        return processDoc(c, job, dm).then(function (r) {
          if (r.fail) {
            lines.push(t('rFail', { e: r.fail === 'amount' ? t('eAmount') : r.fail === 'type' ? t('eType') : t('eOther') }));
            return afterImport(r, job, dm);
          }
          if (r.duplicate) { lines.push(t('rDup', { r: r.ref || '' })); return afterImport(r, job, dm); }
          added++;
          var rv = r.review && r.review.length ? t('rReview', { x: rvText(r.review) }) : '';
          lines.push(t('rAdded', { d: t(r.direction), a: fmtAmt(r.amount), c: r.currency, k: r.accountName ? r.accountName + ' · ' : '', r: '#' + r.ref + ' (' + t('src' + r.source) + ')' + rv }));
          notify(t('nTitle'), t('nBody', { d: t(r.direction), a: fmtAmt(r.amount), c: r.currency }) + (r.other ? ' · ' + r.other : ''));
          return afterImport(r, job, dm).then(function (e) { lateCheck(r, e); });
        }).then(function () { markDone([dm.id]); });
      });
    });
    return seq.then(function () {
      markDone([job.trig.id]);
      if (added) try { var s = F().sync; if (s && s.now) s.now(); } catch (e) {}
      return say(c, job.trig, lines.join('\n'));
    });
  }
  function scan(force) {
    if (busy) return Promise.resolve();
    if (!cfg.session() || (!force && !cfg.on())) return Promise.resolve();
    if (!D() || !D().autoImport) return Promise.resolve();
    if (navigator.onLine === false) { lastErr = 'offline'; emit(); return Promise.resolve(); }
    busy = true; emit();
    return getClient().then(function (c) {
      return Promise.resolve(c.getMessages('me', { limit: 60 })).then(function (list) {
        var msgs = Array.prototype.slice.call(list || []);
        var jobs = plan(msgs, Math.floor(Date.now() / 1000)), seq = Promise.resolve();
        jobs.forEach(function (j) { seq = seq.then(function () { return runJob(c, j); }); });
        return seq;
      });
    }).then(function () { lastErr = ''; }, function (e) { lastErr = String(e && (e.errorMessage || e.message) || e); })
      .then(function () { busy = false; lastCheck = Date.now(); emit(); });
  }

  // ---------- giriş ----------
  var login = null; // { step: 'phone'|'code'|'pw'|'wait', resolve, err }
  function errText(e) {
    var m = String(e && (e.errorMessage || e.message) || e);
    if (/PHONE_NUMBER_INVALID|PHONE_NUMBER_BANNED/.test(m)) return t('phoneBad');
    if (/PHONE_CODE_INVALID|PHONE_CODE_EXPIRED|PHONE_CODE_EMPTY/.test(m)) return t('codeBad');
    if (/PASSWORD_HASH_INVALID/.test(m)) return t('pwBad');
    if (/FLOOD/.test(m)) return t('flood');
    return m;
  }
  function startLogin(phone) {
    var ask = function (step) { return new Promise(function (res) { login = { step: step, resolve: res, err: login && login.err || '' }; emit(); }); };
    login = { step: 'wait', err: '' }; emit();
    return makeClient('').then(function (c) {
      return c.start({
        phoneNumber: function () { return Promise.resolve(phone); },
        phoneCode: function () { return ask('code'); },
        password: function () { return ask('pw'); },
        onError: function (e) {
          var m = String(e && (e.errorMessage || e.message) || e);
          if (login) login.err = errText(e);
          emit();
          return /PHONE_NUMBER_INVALID|FLOOD|PHONE_NUMBER_BANNED|AUTH_RESTART/.test(m) || (login && login.cancel); // true → dur
        }
      }).then(function () {
        if (login && login.cancel) throw new Error('cancel');
        ls('tg_session', c.session.save()); ls('tg_on', '1');
        client = c; listen(c);
        return c.getMe().then(function (me) { ls('tg_user', [me.firstName, me.lastName].filter(Boolean).join(' ') + (me.username ? ' (@' + me.username + ')' : '')); });
      }).then(function () { login = null; emit(); toast(t('autoOn')); setTimeout(function () { scan(true); }, 800); },
        function (e) { var err = login && login.cancel ? '' : (login && login.err) || errText(e); try { c.disconnect(); } catch (x) {} login = err ? { step: 'phone', err: err } : null; emit(); });
    }, function (e) { login = { step: 'phone', err: e && e.message === 'NO_KEY' ? t('noKey') : errText(e) }; emit(); });
  }
  function logout() {
    var done = function () { ls('tg_session', null); ls('tg_user', null); client = null; handlerOn = false; emit(); };
    return getClient().then(function (c) { return Promise.resolve(c.invoke(new window.FalconGram.Api.auth.LogOut())).catch(function () {}).then(function () { try { c.disconnect(); } catch (e) {} }); }, function () {}).then(done, done);
  }

  // ---------- Ayarlar kartı ----------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function toast(msg) {
    var o = document.querySelector('.tgf-toast'); if (o) o.remove();
    var x = el('div', { class: 'tgf-toast', dir: document.documentElement.dir || 'ltr', text: msg }); document.body.appendChild(x);
    setTimeout(function () { x.remove(); }, 5000);
  }
  function css() {
    if (document.getElementById('tgf-css')) return;
    var s = document.createElement('style'); s.id = 'tgf-css';
    s.textContent = '.tgf-kart{padding:16px;margin-top:14px}.tgf-kart h3{margin:0 0 8px;font-size:15px;font-weight:600}.tgf-kart .tgf-d{font-size:13px;opacity:.8;line-height:1.5;margin:0 0 10px}' +
      '.tgf-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.tgf-row input[type=text],.tgf-row input[type=tel],.tgf-row input[type=password],.tgf-row input[type=number]{flex:1;min-width:140px}' +
      '.tgf-st{font-size:12.5px;opacity:.75}.tgf-err{color:#ef4444;font-size:13px}.tgf-ok{color:#22c55e}.tgf-warn{color:#f59e0b}' +
      '.tgf-list{display:grid;gap:6px;margin-top:6px}.tgf-it{border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:8px 10px;font-size:13px;display:grid;gap:4px}' +
      '.tgf-it.rv{border-color:rgba(245,158,11,.7);background:rgba(245,158,11,.06)}.tgf-it .tgf-h{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between}' +
      '.tgf-it .tgf-a{font-weight:600}.tgf-chip{display:inline-flex;gap:6px;align-items:center;border:1px solid rgba(127,127,127,.3);border-radius:999px;padding:2px 10px;font-size:12.5px;margin:2px}' +
      '.tgf-chip button{border:0;background:none;color:inherit;cursor:pointer;opacity:.7;padding:0}.tgf-badge{background:#f59e0b;color:#111;border-radius:9px;font-size:11px;padding:1px 7px;margin-inline-start:6px}' +
      '.tgf-toast{position:fixed;inset-inline-end:18px;bottom:18px;z-index:99999;background:#0f172a;color:#fff;border:1px solid #0ea5e9;border-radius:12px;padding:10px 14px;box-shadow:0 8px 30px #0006;font-size:14px;max-width:90vw}';
    document.head.appendChild(s);
  }
  var kart = null, drawQ = 0;
  function draw() {
    if (!kart) return;
    if (drawQ) return; drawQ = setTimeout(function () { drawQ = 0; render(); }, 30);
  }
  listeners.push(draw);
  function render() {
    if (!kart) return;
    var focus = document.activeElement && kart.contains(document.activeElement) ? document.activeElement.getAttribute('data-k') : null;
    if (focus && /^(ph|code|pw|trig|wait|me)$/.test(focus)) return; // yazarken yeniden çizme
    kart.setAttribute('dir', lang() === 'ar' ? 'rtl' : 'ltr');
    kart.innerHTML = '';
    kart.appendChild(el('h3', { text: '✈ ' + t('title') }, []));
    kart.appendChild(el('p', { class: 'tgf-d', text: t('desc', { w: cfg.trigger() }) }));
    var body = el('div', {});
    kart.appendChild(body);
    if (!apiKey()) { remoteKey(); body.appendChild(el('div', { class: 'tgf-err', text: t('noKey') })); return; }
    if (!cfg.session()) {
      if (!login) {
        body.appendChild(el('div', { class: 'tgf-row' }, [el('button', { type: 'button', class: 'btn primary', text: t('connect'), onclick: function () { login = { step: 'phone', err: '' }; render(); } })]));
      } else if (login.step === 'phone') {
        var ph = el('input', { type: 'tel', class: 'input', 'data-k': 'ph', dir: 'ltr', placeholder: t('phone'), value: ls('tg_phone') || '' });
        body.appendChild(el('div', { class: 'tgf-row' }, [ph, el('button', { type: 'button', class: 'btn primary', text: t('sendCode'), onclick: function () {
          var v = String(ph.value || '').replace(/[^\d+]/g, '');
          if (!/^\+\d{7,15}$/.test(v)) { login.err = t('phoneBad'); render(); return; }
          ls('tg_phone', v); startLogin(v);
        } }), el('button', { type: 'button', class: 'btn', text: t('cancel'), onclick: function () { login = null; render(); } })]));
      } else if (login.step === 'wait') {
        body.appendChild(el('div', { class: 'tgf-st', text: t('connecting') }));
      } else if (login.step === 'code' || login.step === 'pw') {
        var isPw = login.step === 'pw';
        var inp = el('input', { type: isPw ? 'password' : 'text', class: 'input', 'data-k': isPw ? 'pw' : 'code', dir: 'ltr', inputmode: isPw ? null : 'numeric', autocomplete: isPw ? 'current-password' : 'one-time-code', placeholder: isPw ? t('pw') : t('code') });
        var go = function () { var v = String(inp.value || '').trim(); if (!v) return; var r = login.resolve; login = { step: 'wait', err: '' }; render(); r(v); };
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        if (!isPw) body.appendChild(el('div', { class: 'tgf-st', text: t('codeSent') }));
        body.appendChild(el('div', { class: 'tgf-row' }, [inp, el('button', { type: 'button', class: 'btn primary', text: t('signIn'), onclick: go }),
          el('button', { type: 'button', class: 'btn', text: t('cancel'), onclick: function () { var r = login.resolve; login = { cancel: true, step: 'wait' }; r(''); setTimeout(function () { login = null; render(); }, 300); } })]));
        setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
      }
      if (login && login.err) body.appendChild(el('div', { class: 'tgf-err', text: t('loginErr', { e: login.err }) }));
      return;
    }
    // bağlı
    body.appendChild(el('div', { class: 'tgf-row' }, [el('span', { class: 'tgf-ok', text: '● ' + t('connected', { n: ls('tg_user') || '' }) })]));
    var on = el('input', { type: 'checkbox' }); on.checked = cfg.on();
    on.addEventListener('change', function () { ls('tg_on', on.checked ? '1' : '0'); if (on.checked) scan(); render(); });
    body.appendChild(el('label', { class: 'tgf-row', style: 'cursor:pointer' }, [on, el('span', { text: t('on') })]));
    var trg = el('input', { type: 'text', class: 'input', 'data-k': 'trig', dir: 'auto', value: cfg.trigger() });
    trg.addEventListener('change', function () { var v = String(trg.value || '').trim(); ls('tg_trigger', v || 'sisteme ekle'); trg.blur(); render(); });
    body.appendChild(el('div', { class: 'tgf-row' }, [el('span', { class: 'tgf-st', text: t('trigger') + ':' }), trg]));
    var wt = el('input', { type: 'number', class: 'input', 'data-k': 'wait', min: '3', max: '60', value: String(cfg.wait()), style: 'max-width:90px' });
    wt.addEventListener('change', function () { var n = Math.round(Number(wt.value)); ls('tg_wait', n >= 3 && n <= 60 ? n : 15); wt.blur(); render(); });
    body.appendChild(el('div', { class: 'tgf-row' }, [el('span', { class: 'tgf-st', text: t('wait') + ':' }), wt]));
    body.appendChild(el('div', { class: 'tgf-row' }, [
      el('button', { type: 'button', class: 'btn primary', text: busy ? t('busy') : t('check'), disabled: busy, onclick: function () { scan(true); } }),
      el('span', { class: 'tgf-st', text: lastErr === 'offline' ? t('offline') : t('last', { t: lastCheck ? new Date(lastCheck).toLocaleTimeString() : t('never') }) + (lastErr && lastErr !== 'offline' ? ' · ' + lastErr : '') })
    ]));
    body.appendChild(el('div', { class: 'tgf-st', text: t('oneDevice') }));
    // benim adlarım
    var meBox = el('div', {}); body.appendChild(meBox);
    if (D() && D().getMe) D().getMe().then(function (me) {
      meBox.appendChild(el('div', { class: 'tgf-st', style: 'margin-top:10px', text: t('me') + ':' }));
      var chips = el('div', {});
      me.names.forEach(function (n) { chips.appendChild(el('span', { class: 'tgf-chip', dir: 'auto' }, [n])); });
      me.accounts.forEach(function (a) { chips.appendChild(el('span', { class: 'tgf-chip', dir: 'ltr' }, ['****' + a])); });
      meBox.appendChild(chips);
      if (!me.names.length && !me.accounts.length) meBox.appendChild(el('div', { class: 'tgf-warn', style: 'font-size:13px', text: t('meEmpty') }));
      var mi = el('input', { type: 'text', class: 'input', 'data-k': 'me', dir: 'auto', placeholder: 'متن … / 0951' });
      meBox.appendChild(el('div', { class: 'tgf-row' }, [mi, el('button', { type: 'button', class: 'btn', text: t('meAdd'), onclick: function () {
        var v = String(mi.value || '').trim(); if (!v) return;
        var isAcc = /^\*{0,}\d{4,}$/.test(v.replace(/\s/g, ''));
        D().addMe(isAcc ? '' : v, isAcc ? v : '').then(function () { mi.blur(); render(); });
      } })]));
    });
    // kayıtlar
    var lb = el('div', {}); body.appendChild(lb);
    getLog().then(function (log) {
      var ids = log.filter(function (e) { return e.tx; }).map(function (e) { return e.tx; });
      return (ids.length ? dbAll('SELECT id, updated_at FROM cash_transactions WHERE id IN (' + ids.map(function () { return '?'; }).join(',') + ')', ids) : Promise.resolve([])).then(function (rows) {
        var up = {}; rows.forEach(function (r) { up[r.id] = r.updated_at; });
        var need = 0;
        log.forEach(function (e) { e._rv = !e.ok && !(e.tx && e.u && up[e.tx] && up[e.tx] !== e.u); if (e.tx && !(e.tx in up) && !e.dup) e._gone = 1; if (e._rv && !e._gone) need++; });
        lb.appendChild(el('div', { class: 'tgf-st', style: 'margin-top:12px' }, [t('list'), need ? el('span', { class: 'tgf-badge', text: t('recs', { n: need }) }) : null]));
        var box = el('div', { class: 'tgf-list' }); lb.appendChild(box);
        var items = log.slice(-25).reverse();
        if (!items.length) box.appendChild(el('div', { class: 'tgf-st', text: t('none') }));
        items.forEach(function (e) {
          var head = e.fail ? (e.fail === 'notfound' ? t('rvnotfound') : t('fail')) : e.dup ? t('dup') + ' #' + e.ref : t(e.dir) + ' · ' + fmtAmt(e.amt) + ' ' + (e.cur || '');
          var it = el('div', { class: 'tgf-it' + (e._rv && !e._gone ? ' rv' : '') }, [
            el('div', { class: 'tgf-h' }, [
              el('span', { class: 'tgf-a', text: head }),
              el('span', { class: 'tgf-st', text: new Date(e.at).toLocaleString() + (e.dev ? ' · ' + t('dev_' + e.dev) : '') })
            ]),
            e.who || e.ref ? el('div', { class: 'tgf-st' }, [el('span', { dir: 'auto', text: e.who || '' }), e.ref && !e.dup ? ' · #' + e.ref : '', e.acc ? ' · ' + e.acc : '', e.src ? ' · ' + t('src' + e.src) : '']) : null,
            e._rv && e.rv && e.rv.length ? el('div', { class: 'tgf-warn', text: '⚠ ' + t('review') + ': ' + rvText(e.rv) }) : null,
            el('div', { class: 'tgf-row', style: 'margin:2px 0 0' }, [
              e.tx && !e._gone && D() && D().openOriginal ? el('button', { type: 'button', class: 'btn small', text: '📎 ' + t('open'), onclick: function () { D().openOriginal(e.tx); } }) : null,
              e._rv && !e._gone ? el('button', { type: 'button', class: 'btn small', text: t('reviewed'), onclick: function () {
                editLog(function (a) { a.forEach(function (x) { if (x.at === e.at && x.d === e.d && x.m === e.m) x.ok = true; }); return a; }).then(render);
              } }) : null
            ])
          ]);
          box.appendChild(it);
        });
      });
    });
  }
  function hedef() {
    return document.querySelector('.dk-kart') || document.querySelector('.kul-kart');
  }
  function yerlestir() {
    var h = hedef();
    if (!h) { var ct = document.getElementById('fo-contact'); if (ct && ct.previousElementSibling && ct.previousElementSibling !== kart) h = ct.previousElementSibling; else if (ct && kart && ct.previousElementSibling === kart) return; }
    var kopya = document.querySelectorAll('.tgf-kart');
    for (var i = 0; i < kopya.length; i++) if (kopya[i] !== kart) kopya[i].remove();
    if (!h || !h.parentNode) { if (kart && !document.body.contains(kart)) kart = null; return; }
    if (h.nextElementSibling === kart) return;
    css();
    var yeni = !kart;
    if (!kart) { kart = el('div', { class: 'card tgf-kart' }); }
    h.parentNode.insertBefore(kart, h.nextSibling);
    if (yeni) render();
  }
  function bas() {
    yerlestir();
    var bek = 0;
    new MutationObserver(function () { if (!bek) bek = setTimeout(function () { bek = 0; yerlestir(); }, 80); }).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(function () { if (kart) render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    // kontrol: açılışta, her dakika (ekran açıkken), öne gelince, internet gelince
    remoteKey();
    setTimeout(function () { scan(); }, 7000);
    setInterval(function () { if (!document.hidden) scan(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(function () { scan(); }, 1500); });
    window.addEventListener('online', function () { setTimeout(function () { scan(); }, 2000); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bas); else bas();

  window.FalconTelegram = { version: VERSION, scan: scan, logout: logout, status: function () { return { busy: busy, lastCheck: lastCheck, lastErr: lastErr, session: !!cfg.session(), on: cfg.on(), key: !!apiKey() }; },
    _test: { plan: plan, trig: trig, norm: norm, fileOf: fileOf, setClient: function (c) { client = c; }, getLog: getLog } };
})();
