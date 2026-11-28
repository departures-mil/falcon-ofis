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
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.drawImage(src, 0, 0, cv.width, cv.height);
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
      engP = loadScript(base + 'ocr/tesseract-core-simd-lstm.wasm.js').then(function () { return root.TesseractCore({ print: function () {}, printErr: function () {} }); }).then(function (m) {
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
    // v1.69: masaüstünde yerel zekâ paketi kuruluysa PaddleOCR PP-OCRv5 + Tesseract (Arapça rakamlar ve adlar çok daha doğru)
    if (root.FCYZ && root.FCYZ.available()) {
      return root.FCYZ.ready('ocr').then(function (ok) {
        if (!ok) return tessOcr(cv);
        return root.FCYZ.ocr(toCanvas(cv, 4000, 4000), { langs: ['ar', 'en'] }).then(function (r) { return r && r.text ? r.text : tessOcr(cv); }, function () { return tessOcr(cv); });
      });
    }
    return tessOcr(cv);
  }
  function tessOcr(cv) {
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
  // ---------- v1.71: belge (fatura / teklif) OCR'ı — sözcükler konumlarıyla ----------
  // Dönüş: { width, height, items: [{ str, x, y, w, h, conf }], via } — fatura-pdf.js'in konumlu ayrıştırıcısına (pdf.js öğeleriyle aynı biçim) verilir.
  // Yerel zekâ (PP-OCRv5) kuruluysa o; değilse Tesseract (tur + eng, en iyi model) sözcük kutuları (TSV), eğiklik düzeltilerek.
  var docEngP = null;
  function docEngine() {
    if (!docEngP) {
      docEngP = engine().then(function (E) {
        return asset(base + 'ocr/tur.traineddata.gz').then(gunzip).then(function (d) { E.m.FS.writeFile('/tur.traineddata', d); }).then(function () { return 'tur+eng'; }, function () { return 'eng'; }).then(function (lg) {
          var api = new E.m.TessBaseAPI();
          if (api.Init('/', lg, 1) !== 0) throw new Error('ocr-init');
          api.SetVariable('tessedit_pageseg_mode', '6');
          api.SetVariable('preserve_interword_spaces', '1');
          return { m: E.m, api: api, lg: lg };
        });
      });
      docEngP.catch(function () { docEngP = null; });
    }
    return docEngP;
  }
  // Belge görüntüsü (v1.71): eğiklik düzeltilir (izdüşüm yöntemi), gri ton, koyu zemin çevrilir, en uzun kenar ~3000 px;
  // mode 'lat' = yerel uyarlamalı eşik (ekran fotoğrafındaki hare ve parlama için), 'soft' = hafif yumuşatma
  function skewOf(cv) {
    var s = toCanvas(cv, 900), W = s.width, H = s.height, d = s.getContext('2d').getImageData(0, 0, W, H).data, sum = 0, n = W * H, g = new Uint8Array(n);
    for (var i = 0, k = 0; k < n; i += 4, k++) { g[k] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0; sum += g[k]; }
    var mean = sum / n, inv = mean < 110, pts = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var v = g[y * W + x]; if (inv ? v > mean + 40 : v < mean - 50) pts.push(x, y); }
    if (pts.length < 200) return 0;
    var step = Math.max(1, Math.floor(pts.length / 2 / 60000)) * 2, best = 0, bs = -1;
    for (var a = -5; a <= 5.001; a += 0.1) {
      var t = Math.tan(a * Math.PI / 180), bins = new Float64Array(H * 2 + 20), sc = 0;
      for (var j = 0; j < pts.length; j += step) { var yy = Math.round(pts[j + 1] - pts[j] * t) + H; if (yy >= 0 && yy < bins.length) bins[yy]++; }
      for (var q = 0; q < bins.length; q++) sc += bins[q] * bins[q];
      if (sc > bs) { bs = sc; best = a; }
    }
    return Math.abs(best) < 0.15 ? 0 : best;
  }
  function rotated(cv, deg) {
    if (!deg) return cv;
    var r = -deg * Math.PI / 180, W = cv.width, H = cv.height;
    var nw = Math.ceil(Math.abs(W * Math.cos(r)) + Math.abs(H * Math.sin(r))), nh = Math.ceil(Math.abs(W * Math.sin(r)) + Math.abs(H * Math.cos(r)));
    var c = document.createElement('canvas'); c.width = nw; c.height = nh;
    var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, nw, nh);
    cx.translate(nw / 2, nh / 2); cx.rotate(r); cx.drawImage(cv, -W / 2, -H / 2);
    return c;
  }
  // temiz belge mi (ekran görüntüsü / PDF sayfası: zeminin çoğu saf beyaz) — öyleyse önce yumuşak gri ton denenir
  function docClean(cv) {
    var c = toCanvas(cv, 600), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w = 0, n = d.length / 4;
    for (var i = 0; i < d.length; i += 4) if (d[i] > 243 && d[i + 1] > 243 && d[i + 2] > 243) w++;
    return w / n;
  }
  // v1.74: koyu / renkli başlık bandı var mı (turuncu, lacivert tablo başlığı): genişliğin yarısından fazlası koyu ya da doygun renkli,
  // yüksekliğin %1'inden kalın yatay şerit. Taranmış / gri belgelerde yoktur (ince tablo çizgileri sayılmaz).
  function hasBands(cv) {
    var c = toCanvas(cv, 800), W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data, run = 0, need = Math.max(3, Math.round(H * 0.01));
    for (var y = 0; y < H; y++) {
      var n = 0;
      for (var x = 0; x < W; x++) { var i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 110 || (mx - mn > 90 && mx > 120)) n++; }
      if (n > W * 0.45) { if (++run >= need) return true; } else run = 0;
    }
    return false;
  }
  function docCanvas(cv, mode, minSide, band) {
    var sk = skewOf(cv);
    var c = toCanvas(Math.abs(sk) >= 0.4 ? rotated(cv, sk) : cv, Math.max(3000, minSide || 0), minSide || 2600), cx = c.getContext('2d'), W = c.width, H = c.height, img = cx.getImageData(0, 0, W, H), d = img.data, sum = 0, n = W * H;
    var g = new Float32Array(n), x, y;
    for (var i = 0, k = 0; k < n; i += 4, k++) { g[k] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += g[k]; }
    if (sum / n < 110) for (var k2 = 0; k2 < n; k2++) g[k2] = 255 - g[k2];
    // v1.74: renkli / koyu zeminli bölgeler (tablo başlığı bantları: turuncu, lacivert…): blok blok yazının kutbu bulunur; açık renk yazı koyu
    // zeminin üstündeyse blok tersine çevrilip zemin beyaza, yazı siyaha gerilir; düz renkli (yazısız) zemin beyaza boyanır
    if (band && !root.__noBand) (function () {
      var B = 24, bw = Math.ceil(W / B), bh = Math.ceil(H / B), mn = new Float32Array(bw * bh), mx = new Float32Array(bw * bh), me = new Float32Array(bw * bh), bx, by;
      for (by = 0; by < bh; by++) for (bx = 0; bx < bw; bx++) {
        var lo = 255, hi = 0, su = 0, cn = 0;
        for (var yy = by * B; yy < Math.min(H, by * B + B); yy++) for (var xx = bx * B; xx < Math.min(W, bx * B + B); xx++) { var v = g[yy * W + xx]; if (v < lo) lo = v; if (v > hi) hi = v; su += v; cn++; }
        mn[by * bw + bx] = lo; mx[by * bw + bx] = hi; me[by * bw + bx] = su / cn;
      }
      for (by = 0; by < bh; by++) for (bx = 0; bx < bw; bx++) {
        var L = 255, Hh = 0, S = 0, C = 0;
        for (var ny = Math.max(0, by - 1); ny <= Math.min(bh - 1, by + 1); ny++) for (var nx = Math.max(0, bx - 1); nx <= Math.min(bw - 1, bx + 1); nx++) { var bi = ny * bw + nx; if (mn[bi] < L) L = mn[bi]; if (mx[bi] > Hh) Hh = mx[bi]; S += me[bi]; C++; }
        var M = S / C, i0 = by * bw + bx, flat = mx[i0] - mn[i0] < 22 && me[i0] < 232, inv = !flat && Hh - L > 60 && M < 225 && (Hh - M) > 1.3 * (M - L);
        if (!flat && !inv) continue;
        // bloğun kendi zemini: tersinde koyu uç (L), düzde blok ortalaması
        for (var y2 = by * B; y2 < Math.min(H, by * B + B); y2++) for (var x2 = bx * B; x2 < Math.min(W, bx * B + B); x2++) {
          var q2 = y2 * W + x2;
          g[q2] = flat ? 255 : Math.max(0, Math.min(255, 255 - (g[q2] - L) * 255 / Math.max(40, Hh - L)));
        }
      }
    })();
    // yerel ortalama (tümlev görüntüsü), pencere ≈ en uzun kenarın %2'si; ortalamanın %9 altı yazı (gölgeli satır / parlama / hare için)
    var ink = new Uint8Array(n), I = new Float64Array((W + 1) * (H + 1)), r = Math.max(8, Math.round(Math.max(W, H) * 0.01));
    for (y = 0; y < H; y++) { var row = 0; for (x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
    for (y = 0; y < H; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (x = 0; x < W; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        var m = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((y1 - y0) * (x1 - x0));
        ink[y * W + x] = g[y * W + x] < m * 0.91 ? 1 : 0;
      }
    }
    // tablo çizgileri (yatayda genişliğin %4'ünden, dikeyde yüksekliğin %2,5'inden uzun kesintisiz koyu çizgiler) silinir:
    // OCR çizgileri harf sanmaz, hücre yazıları satırlarına doğru dağılır
    var LH = Math.round(W * 0.04), LV = Math.round(H * 0.025), kill = new Uint8Array(n), run, st0;
    for (y = 0; y < H; y++) {
      run = 0;
      for (x = 0; x <= W; x++) {
        if (x < W && ink[y * W + x]) { if (!run) st0 = x; run++; }
        else { if (run >= LH) for (var kx = st0; kx < st0 + run; kx++) kill[y * W + kx] = 1; run = 0; }
      }
    }
    for (x = 0; x < W; x++) {
      run = 0;
      for (y = 0; y <= H; y++) {
        if (y < H && ink[y * W + x]) { if (!run) st0 = y; run++; }
        else { if (run >= LV) for (var ky = st0; ky < st0 + run; ky++) kill[ky * W + x] = 1; run = 0; }
      }
    }
    var o = new Float32Array(n);
    if (mode === 'soft') {
      // hafif yumuşatılmış gri ton (temiz ekran görüntüsü), çizgiler beyaza boyanır
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var s9 = 0, c9 = 0;
        for (var dy = -1; dy <= 1; dy++) { var yy = y + dy; if (yy < 0 || yy >= H) continue; for (var dx = -1; dx <= 1; dx++) { var xx = x + dx; if (xx < 0 || xx >= W) continue; s9 += g[yy * W + xx]; c9++; } }
        o[y * W + x] = kill[y * W + x] ? 255 : s9 / c9;
      }
    } else for (var z = 0; z < n; z++) o[z] = ink[z] && !kill[z] ? 0 : 255;
    for (var j = 0, q = 0; q < n; j += 4, q++) { d[j] = d[j + 1] = d[j + 2] = o[q]; d[j + 3] = 255; }
    cx.putImageData(img, 0, 0);
    return c;
  }
  // Eğiklik: aynı satırdaki sözcüklerin eğimi (ortanca) → y' = y − eğim·x
  function deskewItems(items, lineKey) {
    var by = {};
    items.forEach(function (it) { var k = lineKey(it); if (k != null) (by[k] = by[k] || []).push(it); });
    var sl = [];
    Object.keys(by).forEach(function (k) {
      var l = by[k]; if (l.length < 3) return;
      var mx = 0, my = 0; l.forEach(function (i) { mx += i.x + i.w / 2; my += i.y + i.h / 2; }); mx /= l.length; my /= l.length;
      var a = 0, b = 0; l.forEach(function (i) { var dx = i.x + i.w / 2 - mx; a += dx * (i.y + i.h / 2 - my); b += dx * dx; });
      if (b > 0) sl.push(a / b);
    });
    if (sl.length < 3) return items;
    sl.sort(function (p, q) { return p - q; });
    var m = sl[Math.floor(sl.length / 2)];
    if (Math.abs(m) < 0.002 || Math.abs(m) > 0.2) return items;
    items.forEach(function (it) { it.y = it.y - m * (it.x + it.w / 2); });
    return items;
  }
  function tessWords(cv, mode, minSide, band) {
    return docEngine().then(function (E) {
      var c = docCanvas(cv, mode, minSide, band);
      return canvasBytes(c, 'image/png').then(function (png) {
        E.m.FS.writeFile('/input', png);
        if (E.api.SetImageFile(1, 0) === 1) throw new Error('ocr-image');
        E.api.Recognize(null);
        var tsv = E.api.GetTSVText(0);
        try { E.api.Clear(); } catch (e) {}
        var items = [];
        String(tsv || '').split('\n').forEach(function (ln) {
          var f = ln.split('\t');
          if (f.length < 12 || f[0] !== '5') return;
          var txt = f.slice(11).join('\t').trim(), conf = Number(f[10]);
          if (!txt || conf < 0) return;
          items.push({ str: txt, x: +f[6], y: +f[7], w: +f[8], h: +f[9], conf: conf, ln: f[2] + '.' + f[3] + '.' + f[4] });
        });
        deskewItems(items, function (i) { return i.ln; });
        // aynı OCR satırındaki sözcükler aynı yükseklikte sayılır (köşeli parantez / büyük harf gibi uzun sözcükler satırı bölmesin)
        var byLn = {}, allH = items.map(function (i) { return i.h; }).sort(function (a, b) { return a - b; }), gH = allH.length ? allH[Math.floor(allH.length / 2)] : 20;
        items.forEach(function (i) { (byLn[i.ln] = byLn[i.ln] || []).push(i); });
        Object.keys(byLn).forEach(function (k) {
          var l = byLn[k], cs = l.map(function (i) { return i.y + i.h / 2; }).sort(function (a, b) { return a - b; }), hs = l.map(function (i) { return i.h; }).sort(function (a, b) { return a - b; });
          var mc = cs[Math.floor(cs.length / 2)], mh = Math.min(hs[Math.floor(hs.length / 2)], gH * 1.3);
          l.forEach(function (i) { i.h = mh; i.y = mc - mh / 2; });
        });
        return { width: c.width, height: c.height, items: items, via: 'tesseract-' + E.lg + '-' + (mode || 'lat') + (band ? '-band' : '') };
      });
    });
  }
  // opts.mode: 'lat' (varsayılan) | 'soft' (Tesseract ikinci deneme); opts.tess: yerel zekâ kurulu olsa da Tesseract
  function docOcr(cv, opts) {
    opts = opts || {};
    var tw = function () { return tessWords(cv, opts.mode, opts.min, opts.band); };
    if (!opts.tess && root.FCYZ && root.FCYZ.available()) {
      return root.FCYZ.ready('ocr').then(function (ok) {
        if (!ok) return tw();
        var big = toCanvas(cv, 4000, 2000);
        return root.FCYZ.ocr(big, { langs: ['tr', 'en'] }).then(function (r) {
          var its = (r && r.items || []).filter(function (i) { return i && i.text && String(i.text).trim(); }).map(function (i) {
            var xs = (i.box || []).map(function (p) { return p[0]; }), ys = (i.box || []).map(function (p) { return p[1]; });
            var x0 = xs.length ? Math.min.apply(null, xs) : i.cx - 10, x1 = xs.length ? Math.max.apply(null, xs) : i.cx + 10;
            var hh = i.h || (ys.length ? Math.max.apply(null, ys) - Math.min.apply(null, ys) : 12);
            return { str: String(i.text).trim(), x: x0, y: i.cy - hh / 2, w: x1 - x0, h: hh, conf: Math.round((i.score || 0) * 100) };
          });
          if (its.length < 5) return tw();
          return { width: big.width, height: big.height, items: its, via: 'yerel-zeka' };
        }, function () { return tw(); });
      });
    }
    return tw();
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

  var api = { read: read, parse: parse, num: num, isoDate: isoDate, curOf: curOf, verify: verify, norm: norm, refKey: refKey, prepare: prepare, ocr: ocr, docOcr: docOcr, hasBands: hasBands, docClean: docClean, loadImg: loadImg, toCanvas: toCanvas, canvasBytes: canvasBytes, kindOf: kindOf, version: '1.71.0' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FalconDekont = api;
})(typeof window !== 'undefined' ? window : globalThis);
