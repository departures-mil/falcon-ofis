/* v1.65: Ödeme dekontu okuma (Sham Cash ve diğer havale / ödeme dekontları; masaüstü + telefon aynı dosya).
 * window.FalconDekont.read(file, { onStep(step, model), ctl }) → Promise<sonuç>
 *   sonuç: { source: 'ai'|'offline', model, provider: 'shamcash'|'', amount, currency, date (YYYY-MM-DD), time, sender, sender_account,
 *            receiver, receiver_account, ref, fee, status, text, check: { status: match|diff|fixed|none, diffs }, aiError,
 *            kind: 'pdf'|'image', jpeg: Uint8Array (saklanacak / gösterilecek resim), pdf: ArrayBuffer|null, name }
 *  1) Önce çevrimiçi yapay zeka (kullanıcının KENDİ Gemini anahtarı; FalconFaturaPdf.gemini — en güçlü model, kotada sıradaki).
 *  2) Çevrimdışı okuma her zaman aynı anda yapılır: PDF'te yazı varsa pdf.js metni, yoksa / resimse Tesseract OCR (ara+eng, assets/ocr).
 *     Yapay zeka okuduysa çevrimdışı okuma tutarı ve işlem numarasını TEYİT eder (match / diff); yapay zeka yoksa sonuç çevrimdışıdır.
 * parse(text) çevrimdışı ayrıştırıcıdır (Node testleri doğrudan çağırır). */
(function (root) {
  'use strict';

  // ---------- metin / sayı ----------
  var AR_DIG = '٠١٢٣٤٥٦٧٨٩', FA_DIG = '۰۱۲۳۴۵۶۷۸۹';
  function normDigits(s) {
    return String(s == null ? '' : s).replace(/[٠-٩]/g, function (c) { return String(AR_DIG.indexOf(c)); })
      .replace(/[۰-۹]/g, function (c) { return String(FA_DIG.indexOf(c)); }).replace(/٫/g, '.').replace(/٬/g, ',').replace(/‏|‎|؜/g, '');
  }
  // 2,145.75 · 2.145,75 · 2145,75 · 150,000 (tek ayraç + tam 3 hane = binlik) · 1 500 000
  function num(s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    var t = normDigits(s).replace(/[\s ]/g, '').replace(/[^\d.,\-]/g, '');
    if (!/\d/.test(t)) return null;
    var c = t.lastIndexOf(','), d = t.lastIndexOf('.');
    if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (c >= 0) t = t.split(',').length > 2 || /,\d{3}$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
    else if (d >= 0 && t.split('.').length > 2) t = t.replace(/\./g, '');
    var n = Number(t);
    return isFinite(n) ? n : null;
  }
  function pad(n) { return ('0' + n).slice(-2); }
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    oca: 1, şub: 2, sub: 2, nis: 4, haz: 6, tem: 7, ağu: 8, agu: 8, eyl: 9, eki: 10, kas: 11, ara: 12 };
  function isoDate(s) {
    s = normDigits(s);
    var m = /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/.exec(s);
    if (m && +m[2] <= 12 && +m[3] <= 31) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = /(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/.exec(s);
    if (m) {
      var a = +m[1], b = +m[2];
      if (b > 12 && a <= 12) { var x = a; a = b; b = x; } // ABD biçimi (ay/gün)
      if (b >= 1 && b <= 12 && a >= 1 && a <= 31) return m[3] + '-' + pad(b) + '-' + pad(a);
    }
    m = /(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]{3})[a-zçğıöşü]*\.?,?\s+(\d{4})/.exec(s);
    if (m && MON[m[2].toLocaleLowerCase('tr').slice(0, 3)]) return m[3] + '-' + pad(MON[m[2].toLocaleLowerCase('tr').slice(0, 3)]) + '-' + pad(m[1]);
    m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
    if (m && MON[m[1].toLowerCase()]) return m[3] + '-' + pad(MON[m[1].toLowerCase()]) + '-' + pad(m[2]);
    return '';
  }
  function curOf(s) {
    s = normDigits(s);
    if (/\bUSD\b|\$|US\s*DOLLAR|دولار|dolar/i.test(s)) return 'USD';
    if (/\bSYP\b|\bSP\b|ل\.?\s?س|ليرة\s*سورية|ليرة|syrian\s*pound|suriye\s*lir/i.test(s)) return 'SYP';
    if (/\bTRY\b|\bTL\b|₺|ليرة\s*تركية|türk\s*lira/i.test(s)) return 'TRY';
    if (/\bEUR\b|€|يورو/i.test(s)) return 'EUR';
    return '';
  }
  var clean = function (s) { return String(s == null ? '' : s).replace(/[ \t]+/g, ' ').trim(); };

  // ---------- çevrimdışı ayrıştırıcı ----------
  // Etiketler TR / EN / AR. Arapça OCR satırında etiket ile değer yer değiştirebilir: etiket satırdan çıkarılır, kalan değerdir.
  var LBL = {
    amount: /(transferred\s+amount|transfer\s+amount|total\s+amount|amount\s+sent|amount\s+received|net\s+amount|\bamount\b|\bsum\b|المبلغ\s+المحول|المبلغ\s+المرسل|المبلغ\s+المستلم|قيمة\s+التحويل|قيمة\s+الحوالة|المبلغ|القيمة|tutar[ıi]?|miktar)/i,
    fee: /(\bfees?\b|commission|\bcharge\b|العمولة|عمولة|الرسوم|رسوم|komisyon|masraf|ücret)/i,
    ref: /(transaction\s*(?:id|no\.?|number|#|ref(?:erence)?)|transfer\s*(?:id|no\.?|number)|operation\s*(?:id|no\.?|number)|reference\s*(?:no\.?|number|#)?|ref\.?\s*(?:no\.?|#)?|receipt\s*(?:no\.?|number)|رقم\s+العملية|رقم\s+المعاملة|رقم\s+الحوالة|رقم\s+التحويل|رقم\s+الإشعار|رقم\s+المرجع|المرجع|رقم\s+الإيصال|[iİI]şlem\s*(?:no|numaras[ıi])|referans\s*(?:no)?|dekont\s*no)/i,
    date: /(transaction\s+date|transfer\s+date|date\s*(?:&|and)?\s*time|\bdate\b|\btime\b|التاريخ|تاريخ\s+العملية|تاريخ\s+التحويل|الوقت|tarih|saat|zaman)/i,
    sender: /(sender\s*name|\bsender\b|\bfrom\b|sent\s+by|payer|اسم\s+المرسل|المرسل|المحول|من\s*:|gönderen|ödeyen)/i,
    receiver: /(receiver\s*name|recipient\s*name|beneficiary|\breceiver\b|\brecipient\b|\bto\b\s*:|paid\s+to|اسم\s+المستلم|المستلم|المستفيد|إلى\s*:|alıcı)/i,
    account: /(account\s*(?:no\.?|number|#)?|wallet\s*(?:no\.?|number|id)?|رقم\s+الحساب|الحساب|رقم\s+المحفظة|المحفظة|hesap\s*(?:no|numaras[ıi])?|cüzdan)/i,
    status: /(\bstatus\b|الحالة|durum)/i
  };
  var REF_TOK = /([A-Z]{0,6}[-_]?\d[\dA-Z\-_]{4,}|\d{6,})/i;
  function stripLabel(line, re) { return clean(line.replace(re, ' ').replace(/^[\s:：\-–—|#]+|[\s:：\-–—|]+$/g, '').replace(/\s*[:：]\s*/, ' ')); }
  function amountIn(s) {
    s = normDigits(s);
    var m = s.match(/-?\d{1,3}(?:[ ,.]\d{3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g);
    if (!m) return null;
    var best = null;
    m.forEach(function (x) { var n = num(x.replace(/ /g, '')); if (n != null && (best == null || Math.abs(n) > Math.abs(best))) best = n; });
    return best != null ? Math.abs(best) : null;
  }
  function parse(text) {
    var raw = normDigits(text || '');
    var lines = raw.split(/\r?\n/).map(clean).filter(Boolean);
    var o = { provider: /sham\s*cash|شام\s*كاش|شام\s*كاش|shamcash/i.test(raw) ? 'shamcash' : '', amount: null, currency: '', date: '', time: '', sender: '', sender_account: '',
      receiver: '', receiver_account: '', ref: '', fee: null, status: '' };
    var nextVal = function (i) { for (var j = i + 1; j < Math.min(lines.length, i + 3); j++) if (lines[j]) return lines[j]; return ''; };
    var lastParty = '';
    lines.forEach(function (l, i) {
      var v;
      if (LBL.fee.test(l)) { v = amountIn(stripLabel(l, LBL.fee)) ; if (v == null) v = amountIn(nextVal(i)); if (o.fee == null && v != null) o.fee = v; return; }
      if (LBL.ref.test(l) && !o.ref) {
        v = stripLabel(l, LBL.ref); var m = REF_TOK.exec(v) || REF_TOK.exec(nextVal(i));
        if (m) { o.ref = m[1].replace(/[-_]+$/, ''); return; }
      }
      if (LBL.amount.test(l) && o.amount == null) {
        v = stripLabel(l, LBL.amount); var a = amountIn(v), src = v;
        if (a == null) { src = nextVal(i); a = amountIn(src); }
        if (a != null) { o.amount = a; o.currency = o.currency || curOf(src) || curOf(l); return; }
      }
      if (LBL.sender.test(l)) { v = stripLabel(l, LBL.sender) || nextVal(i); lastParty = 's'; if (!o.sender && /\p{L}/u.test(v)) { o.sender = v; return; } }
      if (LBL.receiver.test(l)) { v = stripLabel(l, LBL.receiver) || nextVal(i); lastParty = 'r'; if (!o.receiver && /\p{L}/u.test(v)) { o.receiver = v; return; } }
      if (LBL.account.test(l)) {
        v = stripLabel(l, LBL.account) || nextVal(i); var acc = (/[\dA-Z][\dA-Z\s\-]{4,}/i.exec(v) || [''])[0].trim();
        if (acc) { if (lastParty === 'r') { if (!o.receiver_account) o.receiver_account = acc; } else if (!o.sender_account) o.sender_account = acc; else if (!o.receiver_account) o.receiver_account = acc; }
      }
      if (LBL.status.test(l) && !o.status) o.status = stripLabel(l, LBL.status);
      if (!o.date) { var d = isoDate(l); if (d) o.date = d; }
      if (!o.time) { var tm = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|ص|م)?/i.exec(l); if (tm && +tm[1] < 24) { var h = +tm[1]; if (/PM|م/i.test(tm[4] || '') && h < 12) h += 12; if (/AM|ص/i.test(tm[4] || '') && h === 12) h = 0; o.time = pad(h) + ':' + tm[2]; } }
    });
    // Etiketsiz dekont: para birimi yanındaki en büyük tutar (ücret satırı hariç)
    if (o.amount == null) {
      var best = null;
      lines.forEach(function (l) {
        if (LBL.fee.test(l) || !curOf(l)) return;
        var a = amountIn(l.replace(/\b\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}\b|\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' '));
        if (a != null && (best == null || a > best.a)) best = { a: a, c: curOf(l) };
      });
      if (best) { o.amount = best.a; o.currency = best.c; }
    }
    if (!o.currency) o.currency = curOf(raw);
    if (!o.ref) { var r2 = /(?:^|\s)#\s*([A-Z0-9\-]{6,})/i.exec(raw); if (r2) o.ref = r2[1]; }
    return o;
  }

  // ---------- dosya hazırlığı ----------
  function toBuf(f) {
    if (f instanceof ArrayBuffer) return Promise.resolve(f);
    if (f && f.buffer instanceof ArrayBuffer) return Promise.resolve(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength));
    if (f && f.arrayBuffer) return f.arrayBuffer();
    return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = no; r.readAsArrayBuffer(f); });
  }
  function kindOf(buf, name, type) {
    var u = new Uint8Array(buf.slice(0, 8));
    if (u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) return 'pdf';
    if (/pdf/i.test(type || '') || /\.pdf$/i.test(name || '')) return 'pdf';
    return 'image';
  }
  function loadImg(buf, type) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(new Blob([buf], { type: type || 'image/*' })), im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); ok(im); };
      im.onerror = function () { URL.revokeObjectURL(url); no(new Error('image-unreadable')); };
      im.src = url;
    });
  }
  // En uzun kenar en çok maxSide; çok küçük ekran görüntüleri OCR için büyütülür
  function toCanvas(src, maxSide, minSide) {
    var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, k = 1, big = Math.max(w, h);
    if (big > maxSide) k = maxSide / big; else if (minSide && big < minSide) k = minSide / big;
    var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }
  function canvasBytes(cv, type, q) {
    return new Promise(function (ok, no) {
      cv.toBlob(function (b) { if (!b) return no(new Error('canvas')); b.arrayBuffer().then(function (a) { ok(new Uint8Array(a)); }, no); }, type, q);
    });
  }
  // Dosya → { kind, buf, canvas (sayfa / resim), jpeg (saklama + yapay zeka için) }
  function prepare(file) {
    var name = file && file.name || '', type = file && file.type || '';
    return toBuf(file).then(function (buf) {
      var kind = kindOf(buf, name, type);
      var cvP = kind === 'pdf'
        ? (root.FalconFaturaPdf && root.FalconFaturaPdf.renderPage ? root.FalconFaturaPdf.renderPage(buf, 1, 2) : Promise.reject(new Error('pdf-reader')))
        : loadImg(buf, type).then(function (im) { return toCanvas(im, 2200); });
      return cvP.then(function (cv) {
        var keep = cv.width > 1800 || cv.height > 2400 ? toCanvas(cv, 1800) : cv;
        return canvasBytes(keep, 'image/jpeg', 0.88).then(function (jpeg) { return { kind: kind, buf: buf, canvas: cv, jpeg: jpeg, name: name }; });
      });
    });
  }

  // ---------- varlık dosyaları (Tesseract) ----------
  var base = (function () {
    try { var s = document.currentScript && document.currentScript.src; if (s) return s.replace(/[^\/]*$/, ''); } catch (e) {}
    return './assets/';
  })();
  function asset(url) {
    var F = root.falcon;
    // fetch file:// adresinde çalışmayabilir (telefon kabuğu): XHR'ye düşülür (durum 0 = dosyadan okundu)
    var viaXhr = function () {
      return new Promise(function (ok, no) {
        var x = new XMLHttpRequest(); x.open('GET', url, true); x.responseType = 'arraybuffer';
        x.onload = function () { if ((x.status === 200 || x.status === 0) && x.response && x.response.byteLength) ok(new Uint8Array(x.response)); else no(new Error('asset ' + x.status)); };
        x.onerror = function () { no(new Error('asset')); }; x.send();
      });
    };
    var viaFetch = function () { return fetch(url).then(function (r) { if (!r.ok) throw new Error('asset ' + r.status); return r.arrayBuffer(); }).then(function (a) { return new Uint8Array(a); }).catch(viaXhr); };
    if (F && F.readAsset) return Promise.resolve(F.readAsset(url)).then(function (b) { return b ? new Uint8Array(b.buffer ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b) : viaFetch(); }, viaFetch);
    return viaFetch();
  }
  function gunzip(u8) {
    if (!(u8[0] === 0x1f && u8[1] === 0x8b)) return Promise.resolve(u8);
    return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer().then(function (a) { return new Uint8Array(a); });
  }
  function loadScript(src) {
    return new Promise(function (ok, no) {
      if (root.TesseractCore) return ok();
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = function () { ok(); }; s.onerror = function () { no(new Error('ocr-script')); };
      document.head.appendChild(s);
    });
  }
  var engP = null;
  function engine() {
    if (!engP) {
      engP = loadScript(base + 'ocr/tesseract-core-lstm.wasm.js').then(function () { return root.TesseractCore({ print: function () {}, printErr: function () {} }); }).then(function (m) {
        return Promise.all(['ara', 'eng'].map(function (l) {
          return asset(base + 'ocr/' + l + '.traineddata.gz').then(gunzip).then(function (d) { m.FS.writeFile('/' + l + '.traineddata', d); });
        })).then(function () {
          var api = new m.TessBaseAPI();
          if (api.Init('/', 'ara+eng', 1) !== 0) throw new Error('ocr-init');
          api.SetVariable('tessedit_pageseg_mode', '3');
          return { m: m, api: api };
        });
      });
      engP.catch(function () { engP = null; });
    }
    return engP;
  }
  // Koyu temalı ekran görüntüsü (açık yazı / koyu zemin) çevrilir, gri tona alınır
  function ocrCanvas(cv) {
    var c = toCanvas(cv, 2600, 1400), cx = c.getContext('2d'), img = cx.getImageData(0, 0, c.width, c.height), d = img.data, sum = 0, n = d.length / 4;
    for (var i = 0; i < d.length; i += 4) { var g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = g; sum += g; }
    if (sum / n < 110) for (var j = 0; j < d.length; j += 4) d[j] = d[j + 1] = d[j + 2] = 255 - d[j];
    cx.putImageData(img, 0, 0);
    return c;
  }
  function ocr(cv) {
    return engine().then(function (E) {
      return canvasBytes(ocrCanvas(cv), 'image/png').then(function (png) {
        E.m.FS.writeFile('/input', png);
        if (E.api.SetImageFile(1, 0) === 1) throw new Error('ocr-image');
        E.api.Recognize(null);
        var txt = E.api.GetUTF8Text();
        try { E.api.Clear(); } catch (e) {}
        return txt;
      });
    });
  }
  // Çevrimdışı okuma: PDF'te yazı varsa onun metni (satırlara dizilmiş), yoksa OCR
  function offlineText(P) {
    var fromPdf = P.kind === 'pdf' && root.FalconFaturaPdf && root.FalconFaturaPdf.extract
      ? root.FalconFaturaPdf.extract(P.buf).then(function (pages) {
        var out = [];
        (pages || []).forEach(function (pg) {
          var its = pg.items.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }), line = null;
          its.forEach(function (it) {
            if (line && Math.abs(line.y - it.y) <= Math.max(2.5, (it.h || 8) * 0.45)) line.p.push(it); else { line = { y: it.y, p: [it] }; out.push(line); }
          });
        });
        return out.map(function (l) { return l.p.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.str; }).join(' '); }).join('\n');
      }).catch(function () { return ''; })
      : Promise.resolve('');
    return fromPdf.then(function (t) {
      if (String(t).replace(/\s/g, '').length > 20) return { text: t, via: 'pdf' };
      return ocr(P.canvas).then(function (x) { return { text: x, via: 'ocr' }; });
    });
  }

  // ---------- yapay zeka ----------
  var PROMPT = [
    'You read a payment / money-transfer receipt (Sham Cash wallet receipt, bank transfer slip, remittance receipt, screenshot or PDF).',
    'Text may be Arabic, English or Turkish. Return ONLY JSON, no prose. Do not invent values; unknown → "" or null.',
    'Numbers as plain JSON numbers with "." decimals (2,145.75 → 2145.75; Arabic digits ٢١٤٥٫٧٥ → 2145.75). Dates as YYYY-MM-DD, time as HH:MM (24h).',
    'Schema: {"provider":"shamcash|bank|other","amount":0,"currency":"USD|SYP|TRY|EUR","fee":null,"date":"","time":"",',
    ' "sender":"","sender_account":"","receiver":"","receiver_account":"","ref":"","status":"","note":""}',
    'amount = the transferred amount (not the balance, not the fee). ref = transaction / operation / reference number exactly as printed.',
    'Names exactly as printed (keep Arabic script). status = success / failed / pending text if printed. note = the transfer note / description if printed.'
  ].join('\n');
  function viaAi(P, opts) {
    var G = root.FalconFaturaPdf && root.FalconFaturaPdf.gemini;
    if (!G) { var e = new Error('no-ai'); e.skip = true; return Promise.reject(e); }
    var B = root.FalconFaturaPdf.b64;
    var part = P.kind === 'pdf' && P.buf.byteLength < 15 * 1024 * 1024
      ? { inline_data: { mime_type: 'application/pdf', data: B(P.buf) } }
      : { inline_data: { mime_type: 'image/jpeg', data: B(P.jpeg.buffer.slice(P.jpeg.byteOffset, P.jpeg.byteOffset + P.jpeg.byteLength)) } };
    return G([part, { text: PROMPT }], { timeout: 90000, onModel: opts.onModel }).then(function (r) { var o = norm(r.data); o.source = 'ai'; o.model = r.model; return o; });
  }
  function norm(o) {
    o = o || {};
    var cur = String(o.currency || '').toUpperCase(); cur = cur === 'TL' ? 'TRY' : /^(USD|SYP|TRY|EUR)$/.test(cur) ? cur : curOf(cur);
    var prov = String(o.provider || '').toLowerCase();
    return { provider: /sham/.test(prov) ? 'shamcash' : prov === 'bank' ? 'bank' : '', amount: num(o.amount), currency: cur, fee: num(o.fee), date: isoDate(o.date) || '',
      time: clean(o.time).slice(0, 5), sender: clean(o.sender), sender_account: clean(o.sender_account), receiver: clean(o.receiver), receiver_account: clean(o.receiver_account),
      ref: clean(o.ref).replace(/\s+/g, ''), status: clean(o.status), note: clean(o.note) };
  }
  var refKey = function (s) { return String(s || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); };
  function near(a, b) { return Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 0.0005); }
  // Yapay zeka sonucu ↔ çevrimdışı okuma. Çevrimdışı metinde yapay zekanın tutarı / işlem no'su aynen geçiyorsa da teyit sayılır.
  function verify(ai, off, text) {
    var diffs = [];
    if (!off || (off.amount == null && !off.ref)) { ai.check = { status: 'none', diffs: [] }; return ai; }
    var raw = normDigits(text || ''), rawKey = refKey(raw), rawNums = (raw.match(/\d[\d.,\s]*\d|\d/g) || []).map(function (x) { return num(x.replace(/\s/g, '')); });
    if (ai.amount != null) {
      var seen = rawNums.some(function (n) { return n != null && near(n, ai.amount); });
      if (off.amount != null && !near(off.amount, ai.amount) && !seen) diffs.push({ k: 'amount', a: ai.amount, b: off.amount });
      else if (off.amount == null && !seen) diffs.push({ k: 'amount', a: ai.amount, b: null });
    }
    if (ai.ref && rawKey.indexOf(refKey(ai.ref)) < 0) diffs.push({ k: 'ref', a: ai.ref, b: off.ref || null });
    if (ai.date && off.date && ai.date !== off.date) diffs.push({ k: 'date', a: ai.date, b: off.date });
    ai.check = { status: diffs.length ? 'diff' : 'match', diffs: diffs };
    ai.alt = off;
    return ai;
  }
  function reason(e) {
    if (!e) return '';
    if (e.cancel) return 'cancel'; if (e.skip) return 'skip'; if (e.key) return 'key'; if (e.timeout) return 'timeout'; if (e.quota) return 'quota'; if (e.net) return 'net';
    return 'fail';
  }
  function read(file, opts) {
    opts = opts || {};
    var step = function (s, m) { if (opts.onStep) try { opts.onStep(s, m); } catch (e) {} };
    step('prepare');
    return prepare(file).then(function (P) {
      var finish = function (o) { o.kind = P.kind; o.jpeg = P.jpeg; o.pdf = P.kind === 'pdf' ? P.buf : null; o.raw = P.kind === 'image' ? P.buf : null; o.name = P.name; return o; };
      var offP = offlineText(P).then(function (x) { var o = parse(x.text); o.text = x.text; o.via = x.via; return o; }, function (e) { return { error: String(e && e.message || e), text: '' }; });
      var offline = function (why) {
        step('offline');
        return offP.then(function (o) {
          if (o.error) { var e = new Error(o.error); throw e; }
          o.source = 'offline'; o.aiError = reason(why); o.check = { status: 'none', diffs: [] };
          return finish(o);
        });
      };
      if (opts.ai === false) return offline(null);
      step('ai');
      var aiP = viaAi(P, { onModel: function (m) { step('ai', m); } });
      if (opts.ctl) aiP = Promise.race([aiP, new Promise(function (_ok, no) { opts.ctl.skipAi = function () { var e = new Error('cancel'); e.cancel = true; no(e); }; })]);
      return aiP.then(function (ai) {
        if (ai.amount == null && !ai.ref) { var e = new Error('ai-empty'); return offline(e); }
        step('verify');
        return offP.then(function (off) { return finish(verify(ai, off.error ? null : off, off.text)); });
      }, offline);
    });
  }

  var api = { read: read, parse: parse, num: num, isoDate: isoDate, curOf: curOf, verify: verify, norm: norm, refKey: refKey, prepare: prepare, ocr: ocr, version: '1.65.0' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FalconDekont = api;
})(typeof window !== 'undefined' ? window : globalThis);
