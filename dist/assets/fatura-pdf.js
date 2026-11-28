/* v1.60: Faturayı PDF'den okuma (masaüstü + telefon aynı dosya).
 * window.FalconFaturaPdf.read(file|ArrayBuffer, { ai: true }) → Promise<{ source, model, seller, buyer, meta, items, totals, currency, warnings }>
 *  1) Önce çevrimiçi yapay zeka: kullanıcının KENDİ Gemini anahtarı (Ayarlar → Asistan; `ai_gemini_key`, `ai_mode` = local ise atlanır).
 *     Hesaptaki modeller listelenir, en güçlüsü (pro, en yeni sürüm) seçilir; kota / hata olursa sıradakine geçilir.
 *  2) İnternet / anahtar yoksa ya da yapay zeka okuyamazsa: çevrimdışı okuma — pdf.js (dist/assets/pdfjs) ile metin + konum,
 *     Türkiye e-Fatura / e-Arşiv düzenine göre ayrıştırma (satıcı, SAYIN bloğu, fatura bilgileri tablosu, kalemler, toplamlar).
 *  3) v1.61.2: çevrimdışı okuma her zaman yapay zeka ile aynı anda yapılır ve yapay zeka sonucunu TEYİT eder (verify):
 *     rakamlar aynıysa check.status = match; farklıysa ve PDF'in kendi yazısı tutarlıysa rakamlar ondan alınır (fixed), değilse diff.
 *     Yapay zeka neden kullanılamadı: aiError = skip | key | net | timeout | quota | empty | fail | cancel.
 * parseLayout(pages) ayrıştırıcıyı dışarıya açar (Node testleri pdf.js çıktısıyla çağırır). */
(function (root) {
  'use strict';

  // ---------- sayı / tarih ----------
  // Türkçe biçim: 1.785,00 · İngilizce: 1,785.00 · tek ayraç: ondalık sayılır (3 hane binlik ise binlik)
  function num(s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    var t = String(s).replace(/\s| /g, '').replace(/[^\d.,\-]/g, '');
    if (!/\d/.test(t)) return null;
    var c = t.lastIndexOf(','), d = t.lastIndexOf('.');
    if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (c >= 0) t = /,\d{3}$/.test(t) && t.split(',').length > 2 ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
    else if (d >= 0 && (t.split('.').length > 2 || /^\-?\d{1,3}\.\d{3}$/.test(t) && TR_STYLE)) t = t.replace(/\./g, '');
    var n = Number(t);
    return isFinite(n) ? n : null;
  }
  var TR_STYLE = true;
  function isoDate(s) {
    var m = /(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/.exec(String(s || ''));
    // v1.71: ABD biçimi (10/22/2026): ikinci sayı 12'den büyükse ay / gün
    if (m && Number(m[2]) > 12 && Number(m[1]) <= 12) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/.exec(String(s || ''));
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
  }
  function curOf(s) {
    s = String(s || '').toUpperCase();
    if (/\bTL\b|TRY|₺/.test(s)) return 'TRY';
    if (/USD|\$|DOLAR/.test(s)) return 'USD';
    if (/SYP|ل\.س|LS\b/.test(s)) return 'SYP';
    if (/EUR|€/.test(s)) return 'EUR';
    return '';
  }
  var low = function (s) { return String(s || '').toLocaleLowerCase('tr'); };
  var clean = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };

  // ---------- satırlar ----------
  // pdf.js öğeleri (sol üst köşe başlangıçlı x, y) → aynı yükseklikteki öğeler bir satır, soldan sağa
  function linesOf(items) {
    var its = items.filter(function (i) { return clean(i.str); }).slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var out = [];
    its.forEach(function (it) {
      var h = it.h || 8, l = out.length ? out[out.length - 1] : null;
      if (l && Math.abs(l.y - it.y) <= Math.max(2.2, h * 0.38)) { l.items.push(it); l.y = (l.y * (l.items.length - 1) + it.y) / l.items.length; }
      else out.push({ y: it.y, h: h, items: [it] });
    });
    out.forEach(function (l) {
      l.items.sort(function (a, b) { return a.x - b.x; });
      l.x0 = l.items[0].x; l.x1 = Math.max.apply(null, l.items.map(function (i) { return i.x + (i.w || 0); }));
    });
    return out;
  }
  function textOf(items) {
    var s = '', prev = null;
    items.forEach(function (i) {
      var gap = prev ? i.x - (prev.x + (prev.w || 0)) : 0;
      s += (prev && (gap > (i.h || 8) * 0.18 || !/[\-\/(]$/.test(s) && gap > 0.6) && !/^[.,:;)]/.test(i.str) ? ' ' : '') + i.str;
      prev = i;
    });
    return clean(s);
  }

  // ---------- anahtar / değer ----------
  var META_KEYS = [
    [/^(fatura\s*)?tarih(i)?$|^düzenlenme tarihi$|^invoice date$|^date$/, 'date'],
    [/^fatura\s*no$|^fatura numaras[ıi]$|^belge no$|^invoice no$/, 'number'],
    [/^özelleştirme\s*no$/, 'customization'],
    [/^senaryo$/, 'scenario'],
    [/^fatura\s*tipi$|^belge tipi$/, 'inv_type'],
    [/^(oluşma|düzenlenme|düzenleme)\s*(zaman[ıi]|saati)$/, 'issue_time'],
    [/^ettn$/, 'ettn'],
    [/^kampanya\s*kodu$/, 'campaign'],
    [/^sipariş\s*(no|numaras[ıi])$/, 'order_no'],
    [/^sipariş\s*tarihi$/, 'order_date'],
    [/^irsaliye\s*(no|numaras[ıi])$/, 'waybill_no'],
    [/^irsaliye\s*tarihi$/, 'waybill_date'],
    [/^son ödeme tarihi$|^vade tarihi$/, 'due_date']
  ];
  var PARTY_KEYS = [
    [/^tel(efon)?$|^gsm$|^cep$/, 'phone'], [/^fax|^faks/, 'fax'], [/^web( sitesi)?$|^web adresi$|^internet$/, 'web'],
    [/^e-?posta$|^e-?mail$/, 'email'], [/^vergi dairesi$|^v\.?\s?d\.?$/, 'tax_office'], [/^vkn$|^tckn$|^vkn\/tckn$|^vergi (no|numaras[ıi])$|^t\.?c\.? kimlik no$/, 'tax_no'],
    [/^mersis( no)?$/, 'mersis'], [/^ticaret sicil( no)?$/, 'trade_reg'], [/^kep( adresi)?$/, 'kep']
  ];
  function keyOf(list, k) { k = low(clean(k)).replace(/\s*:$/, ''); for (var i = 0; i < list.length; i++) if (list[i][0].test(k)) return list[i][1]; return ''; }
  // "Tel: 0212 …" / "VKN: 123" → [anahtar, değer]
  function kv(text) {
    var m = /^([^:]{1,32}):\s*(.*)$/.exec(text);
    return m ? [m[1], clean(m[2])] : null;
  }

  // ---------- taraf (satıcı / alıcı) ----------
  var ILLER = 'ADANA ADIYAMAN AFYONKARAHİSAR AĞRI AKSARAY AMASYA ANKARA ANTALYA ARDAHAN ARTVİN AYDIN BALIKESİR BARTIN BATMAN BAYBURT BİLECİK BİNGÖL BİTLİS BOLU BURDUR BURSA ÇANAKKALE ÇANKIRI ÇORUM DENİZLİ DİYARBAKIR DÜZCE EDİRNE ELAZIĞ ERZİNCAN ERZURUM ESKİŞEHİR GAZİANTEP GİRESUN GÜMÜŞHANE HAKKARİ HATAY IĞDIR ISPARTA İSTANBUL İZMİR KAHRAMANMARAŞ KARABÜK KARAMAN KARS KASTAMONU KAYSERİ KİLİS KIRIKKALE KIRKLARELİ KIRŞEHİR KOCAELİ KONYA KÜTAHYA MALATYA MANİSA MARDİN MERSİN MUĞLA MUŞ NEVŞEHİR NİĞDE ORDU OSMANİYE RİZE SAKARYA SAMSUN ŞANLIURFA SİİRT SİNOP ŞIRNAK SİVAS TEKİRDAĞ TOKAT TRABZON TUNCELİ UŞAK VAN YALOVA YOZGAT ZONGULDAK'.split(' ');
  var upTr = function (s) { return String(s || '').toLocaleUpperCase('tr'); };
  var ADDR_RE = /\b(mah(alle(si)?)?\.?|cad(de(si)?)?\.?|sk\.?|sok(ak|ağı)?\.?|bulvar[ıi]?|blv\.?|no\s*:|apt\.?|kat\s*:|plaza|blok|osb|organize|sanayi sitesi|köyü|mevkii|iç kapı|d[ıi]ş kapı)/i;
  // küçük harfe çevrilmiş (tr) metin üzerinde: "TAŞOCAĞI" içindeki "aş" unvan sayılmaz
  var COMPANY_RE = /(^|[\s.])(a\.?\s?ş\.?|ltd\.?|şti\.?|limited|anonim|şirketi?|ticaret|san\.|tic\.|inc\.?|llc|gmbh)(?=[\s.,]|$)/;
  var COMPANY_END_RE = /(^|[\s.])(a\.?\s?ş\.?|ltd\.?\s?şti\.?|şti\.?|limited|şirketi|ticaret|inc\.?|llc|gmbh)\s*(sn\.?|sayın)?\s*$/;
  function party(lines) {
    var p = { name: '', address: '', phone: '', email: '', web: '', tax_office: '', tax_no: '', mersis: '', fax: '', trade_reg: '', district: '', city: '', postal_code: '' };
    var rest = [], nameLines = [], addr = [];
    lines.forEach(function (t) {
      var x = kv(t), k = x ? keyOf(PARTY_KEYS, x[0]) : '';
      if (k) { if (!p[k]) p[k] = x[1]; return; }
      rest.push(t);
    });
    // logo yazısı gibi baştaki satırlar: ilk üç satırda şirket unvanı varsa ondan başlanır
    for (var s0 = 0; s0 < Math.min(3, rest.length); s0++) if (COMPANY_RE.test(low(rest[s0]))) { rest = rest.slice(s0); break; }
    var i = 0;
    for (; i < rest.length; i++) {
      if (i > 0 && (ADDR_RE.test(rest[i]) || /\d{5}/.test(rest[i]))) break;
      nameLines.push(rest[i]);
      if (i === 0 && COMPANY_END_RE.test(low(rest[i]))) { i++; break; }
      if (nameLines.length >= 2) { i++; break; }
    }
    addr = rest.slice(i);
    p.name = clean(nameLines.join(' ')).replace(/\s+(sn\.?|sayın)$/i, '');
    p.address = clean(addr.join(' ').replace(/\s*\/\s*/g, '/ ').replace(/\/ $/, '')).replace(/\s+\//g, '/');
    var pc = /\b(\d{5})\b/.exec(p.address); if (pc) p.postal_code = pc[1];
    // "BAĞCILAR/ İSTANBUL" → ilçe / il (adresin sonu)
    var words = upTr(p.address).replace(/[\/,.]/g, ' ').split(/\s+/).filter(Boolean);
    for (var w = words.length - 1; w >= Math.max(0, words.length - 4); w--) {
      if (ILLER.indexOf(words[w]) >= 0) {
        p.city = words[w];
        var dw = words[w - 1];
        if (dw && !/\d/.test(dw) && ILLER.indexOf(dw) < 0 && !/^(MAH|MAHALLESİ|CAD|SK|SOK|NO|KAT|BLOK)$/.test(dw)) p.district = dw;
        break;
      }
    }
    var em = /[\w.+\-]+@[\w\-]+(\.[\w\-]+)+/.exec(p.email); p.email = em ? em[0] : '';
    var wb = /(https?:\/\/)?[\w\-]+(\.[\w\-]+)+(\/[^\s]*)?/i.exec(p.web); p.web = wb ? wb[0] : p.web;
    p.phone = (/[+(]?\d[\d()\s\-]{6,}\d/.exec(p.phone) || [''])[0].trim();
    p.fax = (/[+(]?\d[\d()\s\-]{6,}\d/.exec(p.fax) || [''])[0].trim();
    p.tax_no = (/\d{10,11}/.exec(p.tax_no.replace(/\s/g, '')) || [p.tax_no.replace(/\D/g, '')])[0];
    p.mersis = p.mersis.replace(/\s/g, '');
    return p;
  }

  // ---------- kalem tablosu ----------
  var COL_KEYS = [
    [/^s[ıi]ra( no)?$|^no$|^#$/, 'no'], [/^depo$/, 'depot'], [/stok\s*kodu|ürün\s*kodu|malzeme\s*kodu|^kod(u)?$/, 'code'],
    [/mal\s*hizmet\s*tutar|mal\s*\/\s*hizmet\s*tutar|^tutar(ı)?$|^toplam$|^net tutar$/, 'amount'],
    [/kdv\s*oran|vergi\s*oran/, 'vat'], [/kdv\s*tutar|vergi\s*tutar/, 'vat_amount'],
    [/iskonto\s*oran/, 'disc_rate'], [/iskonto\s*tutar|indirim/, 'disc_amount'],
    [/birim\s*fiyat|fiyat/, 'price'], [/^miktar$|^adet$/, 'qty'], [/^birim$/, 'unit'],
    [/mal\s*hizmet|mal\s*\/\s*hizmet|açıklama|ürün( adı)?|malzeme|hizmet/, 'name']
  ];
  function colKey(label) { var k = low(clean(label)); for (var i = 0; i < COL_KEYS.length; i++) if (COL_KEYS[i][0].test(k)) return COL_KEYS[i][1]; return ''; }
  var TOTAL_RE = /(mal\s*hizmet\s*toplam|toplam\s*iskonto|hesaplanan\s*kdv|vergiler\s*dahil|ödenecek\s*tutar|genel\s*toplam|ara\s*toplam|toplam\s*tutar|yaz[ıi]yla|not\s*:|açıklama\s*:)/i;
  function findHeader(lines, from) {
    for (var i = from; i < lines.length; i++) {
      var t = low(textOf(lines[i].items));
      if (/miktar/.test(t) && /(mal|hizmet|açıklama|ürün|malzeme)/.test(t) || /miktar/.test(t) && /fiyat/.test(t)) return i;
      // başlık iki satıra bölünmüş olabilir ("Birim" / "Fiyat")
      if (i + 1 < lines.length && /miktar/.test(t + ' ' + low(textOf(lines[i + 1].items))) && /(fiyat|tutar)/.test(t + ' ' + low(textOf(lines[i + 1].items))) && /(s[ıi]ra|mal|stok|depo)/.test(t)) return i;
    }
    return -1;
  }
  // Başlık satır(lar)ından sütunlar: x aralığına göre öbekler
  var HEAD_WORD = /^(s[ıi]ra|no|depo|stok|kodu?|mal|hizmet|miktar|birim|fiyat[ıi]?|tutar[ıi]?|kdv|oran[ıi]|iskonto|açıklama|ürün|malzeme|vergi|toplam|adet|#)$/i;
  function headish(l) {
    if (!l) return false;
    var ws = low(textOf(l.items)).split(/[\s\/]+/).filter(Boolean);
    return ws.length > 0 && ws.every(function (w) { return HEAD_WORD.test(w); });
  }
  function columns(lines, hi) {
    var hs = [lines[hi]], h = lines[hi].h || 8;
    var pv = lines[hi - 1], nx = lines[hi + 1];
    if (pv && lines[hi].y - pv.y < h * 2.2 && headish(pv)) hs.unshift(pv);
    if (nx && nx.y - lines[hi].y < h * 2.2 && headish(nx)) hs.push(nx);
    var nx2 = lines[hi + 2];
    if (hs[hs.length - 1] === nx && nx2 && nx2.y - nx.y < h * 2.2 && headish(nx2)) hs.push(nx2);
    var cells = [];
    hs.forEach(function (l, li) {
      // aynı satırda yakın öğeler (ör. "Mal" "Hizmet") birleşir
      var grp = [];
      l.items.forEach(function (it) {
        var g = grp.length ? grp[grp.length - 1] : null;
        if (g && it.x - g.x1 < (it.h || 8) * 0.9) { g.parts.push(it); g.x1 = it.x + (it.w || 0); }
        else grp.push({ parts: [it], x0: it.x, x1: it.x + (it.w || 0), line: li });
      });
      grp.forEach(function (g) {
        var ov = null;
        for (var j = 0; j < cells.length; j++) { var c = cells[j]; if (c.line !== g.line && g.x0 < c.x1 + 2 && g.x1 > c.x0 - 2) { ov = c; break; } }
        var txt = textOf(g.parts);
        if (ov) { if (g.line < ov.line) ov.label = txt + ' ' + ov.label; else ov.label += ' ' + txt; ov.x0 = Math.min(ov.x0, g.x0); ov.x1 = Math.max(ov.x1, g.x1); ov.line = g.line; }
        else cells.push({ label: txt, x0: g.x0, x1: g.x1, line: g.line });
      });
    });
    cells.sort(function (a, b) { return a.x0 - b.x0; });
    cells.forEach(function (c) { c.key = colKey(c.label); c.cx = (c.x0 + c.x1) / 2; });
    return { cols: cells, end: lines.indexOf(hs[hs.length - 1]) + 1, start: lines.indexOf(hs[0]) };
  }
  function cellOf(cols, it) {
    var cx = it.x + (it.w || 0) / 2, best = null, bd = 1e9;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      // sütun sınırları: komşu başlıkların ortası
      var left = i ? (cols[i - 1].x1 + c.x0) / 2 : -1e9, right = i < cols.length - 1 ? (c.x1 + cols[i + 1].x0) / 2 : 1e9;
      if (cx >= left && cx < right) return c;
      var d = Math.abs(cx - c.cx); if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function tableRows(lines, from, cols) {
    var body = [];
    for (var i = from; i < lines.length; i++) {
      var t = textOf(lines[i].items);
      if (TOTAL_RE.test(t)) break;
      if (findHeader([lines[i]], 0) === 0) continue; // sayfa başında tekrar eden başlık
      body.push(lines[i]);
    }
    var noCol = cols.filter(function (c) { return c.key === 'no'; })[0];
    var qtyCol = cols.filter(function (c) { return c.key === 'qty'; })[0];
    var cellsOf = function (l) {
      var o = {};
      l.items.forEach(function (it) { var c = cellOf(cols, it); if (!c) return; (o[c.key || ('c' + c.x0)] = o[c.key || ('c' + c.x0)] || []).push(it); });
      return o;
    };
    // PDF iki hücreyi tek metin parçası yapmış olabilir ("K2B04/06 KOM.KNN.05.000180" = Depo + Stok Kodu): sütun sınırını aşan parça sözcüklere bölünür
    var bounds = [];
    for (var bi = 0; bi < cols.length - 1; bi++) bounds.push((cols[bi].x1 + cols[bi + 1].x0) / 2);
    body.forEach(function (l) {
      var out = [];
      l.items.forEach(function (it) {
        var x1 = it.x + (it.w || 0), str = String(it.str);
        var crosses = bounds.some(function (bx) { return it.x < bx - 2 && x1 > bx + 2; });
        if (!crosses || str.indexOf(' ') < 0) { out.push(it); return; }
        var cw = (it.w || 0) / Math.max(1, str.length), pos = 0, parts = [];
        str.split(' ').forEach(function (wd) {
          if (wd) parts.push({ str: wd, x: it.x + pos * cw, y: it.y, w: wd.length * cw, h: it.h });
          pos += wd.length + 1;
        });
        // yalnız kod / depo gibi tek sözcüklük hücreler bölünür; ürün adı (uzun metin) olduğu gibi kalır
        var keys = parts.map(function (x) { var c = cellOf(cols, x); return c ? c.key : ''; });
        var distinct = keys.filter(function (k, i) { return keys.indexOf(k) === i; });
        if (distinct.length < 2 || keys.indexOf('name') >= 0) { out.push(it); return; }
        // aynı sütuna düşen ardışık sözcükler birleşir
        var merged = [];
        parts.forEach(function (x, i) {
          var m = merged[merged.length - 1];
          if (m && m.k === keys[i]) { m.it.str += ' ' + x.str; m.it.w = x.x + x.w - m.it.x; } else merged.push({ k: keys[i], it: x });
        });
        merged.forEach(function (m) { out.push(m.it); });
      });
      // bölünen sözcükler aynı sütunda kalıyorsa yeniden birleşir (sütuna göre öbeklenince metin yine boşlukla birleşir)
      l.items = out;
    });
    var parsed = body.map(function (l) { return { y: l.y, cells: cellsOf(l) }; });
    // satır başı: sıra no sütununda tam sayı (yoksa miktar sütununda sayı)
    var anchors = parsed.filter(function (p) {
      if (noCol) { var v = p.cells.no ? textOf(p.cells.no) : ''; return /^\d{1,4}$/.test(v); }
      return qtyCol && p.cells.qty && /\d/.test(textOf(p.cells.qty));
    });
    if (!anchors.length) return [];
    // Sütunların veri aralığı: satır başı satırlarındaki öğelerden (başlık ortalı olsa da alt satırlar doğru sütuna düşer)
    var span = {};
    cols.forEach(function (c) { span[c.key || ('c' + c.x0)] = { a: c.x0, b: c.x1 }; });
    anchors.forEach(function (p) { Object.keys(p.cells).forEach(function (k) { p.cells[k].forEach(function (it) { var sp = span[k]; sp.a = Math.min(sp.a, it.x); sp.b = Math.max(sp.b, it.x + (it.w || 0)); }); }); });
    var bySpan = function (it) {
      var x0 = it.x, x1 = it.x + (it.w || 0), best = null, bo = -1, bd = 1e9;
      Object.keys(span).forEach(function (k) {
        var sp = span[k], ov = Math.min(x1, sp.b) - Math.max(x0, sp.a);
        var d = ov > 0 ? 0 : Math.min(Math.abs(x0 - sp.b), Math.abs(sp.a - x1));
        if (ov > bo || (ov <= 0 && bo <= 0 && d < bd)) { bo = Math.max(bo, ov); bd = d; best = k; }
      });
      return best;
    };
    parsed.forEach(function (p) {
      if (anchors.indexOf(p) >= 0) return;
      var o = {};
      Object.keys(p.cells).forEach(function (k) { p.cells[k].forEach(function (it) { var kk = bySpan(it) || k; (o[kk] = o[kk] || []).push(it); }); });
      p.cells = o;
    });
    var rows = anchors.map(function (a) { return { y: a.y, parts: {} }; });
    parsed.forEach(function (p) {
      var best = 0, bd = 1e9;
      rows.forEach(function (r, i) { var d = Math.abs(r.y - p.y) + (p.y < r.y ? 0.01 : 0); if (d < bd) { bd = d; best = i; } });
      // ilk satırdan çok yukarıdaki / son satırdan çok aşağıdaki metin tabloya ait değil
      if (bd > 60) return;
      var r = rows[best];
      Object.keys(p.cells).forEach(function (k) { (r.parts[k] = r.parts[k] || []).push({ y: p.y, text: textOf(p.cells[k]) }); });
    });
    return rows.map(function (r) {
      var o = {};
      Object.keys(r.parts).forEach(function (k) { o[k] = clean(r.parts[k].sort(function (a, b) { return a.y - b.y; }).map(function (x) { return x.text; }).join(k === 'name' ? '\n' : ' ')); });
      return o;
    });
  }
  function itemFrom(o, warnings) {
    var it = { name: '', code: o.code || '', depot: o.depot || '', qty: null, unit: '', price: null, amount: null, vat: null, vat_amount: null, disc_rate: null, disc_amount: null, cur: '' };
    // ad: satırlar birleşir (sözcük ortasında bölünme olmaz; tire ile biten satır bitişik)
    it.name = String(o.name || '').split('\n').reduce(function (s, l) { return !s ? l : /[\-\/]$/.test(s) ? s + l : s + ' ' + l; }, '').trim();
    var q = String(o.qty || '');
    var qm = /(-?[\d.,]+)\s*([^\d\s].*)?$/.exec(q);
    if (qm) { it.qty = num(qm[1]); it.unit = clean(qm[2] || o.unit || ''); } else it.unit = clean(o.unit || '');
    it.price = num(o.price); it.amount = num(o.amount); it.vat_amount = num(o.vat_amount);
    it.vat = rateNum(o.vat); it.disc_rate = num(o.disc_rate); it.disc_amount = num(o.disc_amount);
    it.cur = curOf([o.price, o.amount].join(' '));
    if (it.qty == null && it.amount != null && it.price) it.qty = Math.round(it.amount / it.price * 1000) / 1000;
    if (it.price == null && it.amount != null && it.qty) it.price = Math.round(it.amount / it.qty * 10000) / 10000;
    if (it.vat == null && it.vat_amount != null && it.amount) it.vat = Math.round(it.vat_amount / it.amount * 1000) / 10;
    if (it.amount != null && it.qty && it.price && Math.abs(it.qty * it.price - it.amount) > Math.max(0.05, it.amount * 0.002) && !it.disc_amount && !it.disc_rate)
      warnings.push('check:' + it.name.slice(0, 40));
    return it;
  }

  // ---------- belge düzeni ----------
  // pages: [{ width, height, items: [{ str, x, y (üstten), w, h }] }]
  function parseLayout(pages) {
    var warnings = [];
    var all = [];
    pages.forEach(function (pg, pi) { linesOf(pg.items).forEach(function (l) { l.page = pi; l.W = pg.width; all.push(l); }); });
    var fullText = all.map(function (l) { return textOf(l.items); }).join('\n');
    TR_STYLE = /\d,\d{2}\b/.test(fullText) || !/\d\.\d{2}\b/.test(fullText);
    var W = pages[0] ? pages[0].width : 595;
    // sağ sütun (fatura bilgileri tablosu) sınırı: "Tarih:" / "Fatura No:" etiketlerinin x'i
    var split = W * 0.58;
    var metaLabels = [];
    all.forEach(function (l) { l.items.forEach(function (it) { if (keyOf(META_KEYS, it.str) && it.x > W * 0.35) metaLabels.push(it.x); }); });
    var hi = findHeader(all, 0), hcol = hi >= 0 ? columns(all, hi) : null;
    var top = hi >= 0 ? all.slice(0, hcol.start) : all;
    if (metaLabels.length >= 2) {
      split = Math.min.apply(null, metaLabels) - 2;
      // sağ sütunun gerçek başlangıcı: ortanın sağında, solunda büyük boşluk olan ilk öğe (logo yazısı, kargo satırı)
      top.forEach(function (l) {
        l.items.forEach(function (it, k) {
          var prevEnd = k ? l.items[k - 1].x + (l.items[k - 1].w || 0) : 0;
          if (it.x >= W * 0.5 && it.x < split && (k === 0 || it.x - prevEnd > 24)) split = it.x - 2;
        });
      });
    }
    // sol / sağ
    var leftLines = [], rightLines = [];
    top.forEach(function (l) {
      var L = l.items.filter(function (i) { return i.x < split; }), R = l.items.filter(function (i) { return i.x >= split; });
      if (L.length) leftLines.push({ y: l.y, text: textOf(L), x: L[0].x });
      if (R.length) rightLines.push({ y: l.y, text: textOf(R), items: R });
    });
    // fatura bilgileri (sağ tablo + soldaki ETTN gibi tekil satırlar)
    var meta = {};
    var takeMeta = function (key, val) { if (key && val && !meta[key]) meta[key] = val; };
    rightLines.forEach(function (l) {
      var its = l.items, joined = l.text;
      var x = kv(joined);
      if (x && keyOf(META_KEYS, x[0])) { takeMeta(keyOf(META_KEYS, x[0]), x[1]); return; }
      // tablo hücreleri ayrı öğe: ilk öğe etiket
      if (its.length >= 2 && keyOf(META_KEYS, its[0].str)) takeMeta(keyOf(META_KEYS, its[0].str), clean(textOf(its.slice(1)).replace(/^:\s*/, '')));
    });
    leftLines.concat(rightLines).forEach(function (l) {
      var x = kv(l.text);
      if (x && keyOf(META_KEYS, x[0])) takeMeta(keyOf(META_KEYS, x[0]), x[1]);
    });
    // kargo firması: "… KARGO …" satırı (sağ sütun, tablonun üstü)
    rightLines.forEach(function (l, i) {
      if (!meta.cargo && /kargo|lojistik|taşımacılık|yurtiçi|aras|sürat|ptt|ups|dhl/i.test(l.text) && !kv(l.text)) {
        var c = [l.text];
        var nx = rightLines[i + 1];
        if (nx && !kv(nx.text) && nx.y - l.y < 22 && /a\.?\s?ş\.?|ltd|taşımacılık/i.test(nx.text)) c.push(nx.text);
        meta.cargo = clean(c.join(' '));
      }
    });
    if (meta.date) meta.date = isoDate(meta.date) || meta.date;
    if (meta.due_date) meta.due_date = isoDate(meta.due_date) || meta.due_date;
    // satıcı (SAYIN'dan önce) / alıcı (SAYIN'dan sonra, ETTN'e kadar)
    var si = -1;
    leftLines.forEach(function (l, i) { if (si < 0 && /^(sayın|sayin|alıcı|alici|müşteri bilgileri|bill to)\b/i.test(l.text)) si = i; });
    var sellerL = [], buyerL = [];
    leftLines.forEach(function (l, i) {
      var t = l.text;
      if (kv(t) && keyOf(META_KEYS, kv(t)[0])) return;
      if (/^e-?(fatura|arşiv)/i.test(t)) return;
      if (si < 0 || i < si) sellerL.push(t);
      else if (i > si) buyerL.push(t);
      else { var rest = t.replace(/^(sayın|sayin|alıcı|alici)\s*:?/i, '').trim(); if (rest) buyerL.push(rest); }
    });
    var seller = party(sellerL), buyer = party(buyerL);
    // kalemler
    var items = [], end = hi;
    if (hi >= 0) {
      var c = hcol;
      if (!c.cols.some(function (x) { return x.key === 'name'; })) warnings.push('no-name-col');
      items = tableRows(all, c.end, c.cols).map(function (o) { return itemFrom(o, warnings); }).filter(function (it) { return it.name; });
    } else warnings.push('no-table');
    // toplamlar
    var totals = {};
    var after = all.slice(Math.max(0, end));
    after.forEach(function (l) {
      var t = textOf(l.items), lt = low(t);
      var val = function () { var m = t.match(/-?[\d.]+(?:,\d+)?(?:\s*(?:TL|TRY|USD|EUR|₺|\$))?\s*$/i); return m ? num(m[0]) : null; };
      if (/mal\s*hizmet\s*toplam|ara\s*toplam/.test(lt)) totals.subtotal = totals.subtotal == null ? val() : totals.subtotal;
      else if (/toplam\s*iskonto|indirim/.test(lt)) totals.discount = val();
      else if (/hesaplanan\s*kdv|toplam\s*kdv/.test(lt)) { var v = val(); if (v != null) totals.vat = (totals.vat || 0) + v; }
      else if (/vergiler\s*dahil|genel\s*toplam/.test(lt)) totals.total = val();
      else if (/ödenecek\s*tutar/.test(lt)) totals.payable = val();
    });
    var cur = curOf(items.map(function (i) { return i.cur; }).join(' ')) || curOf(fullText.slice(-800)) || '';
    return { source: 'offline', seller: seller, buyer: buyer, meta: meta, items: items, totals: totals, currency: cur, warnings: warnings };
  }

  // ---------- v1.71: genel belge düzeni (teklif mektubu, proforma, yabancı fatura; PDF metni ya da OCR sözcükleri) ----------
  // parseLayout Türkiye e-Fatura düzenine göredir; burada sütun başlıkları TR / EN olarak tanınır, çok sayfalı tablolar (sayfa başında tekrar
  // eden başlık, "Total: 28" / "Page 1 / 3" altlıkları), çok satırlı açıklamalar, liste fiyatı + iskonto + net fiyat, KDV satırı, kur satırı okunur.
  var G_COLS = [
    [/stock\s*status|^status$|^[sc]tatus$|stok\s*durum|^stock$|availability|teslim\s*süre|delivery/, 'status'],
    [/list\s*price|liste\s*fiyat|(l[i1!]st|[lu][sz][tr]|lst|ust)\s*pr[il1]ce|gross\s*price|brüt\s*fiyat/, 'list'],
    [/net\s*price|net\s*fiyat/, 'net'],
    [/disc|iskonto|indirim/, 'disc'],
    [/kdv\s*tutar|vergi\s*tutar|vat\s*amount|tax\s*amount/, 'vat_amount'],
    [/diğer\s*vergi|other\s*tax/, 'other'],
    [/total\s*amount|line\s*total|^amount$|^tutar[ıi]?$|^toplam(\s*tutar)?$|^total$|^net\s*tutar$|mal\s*hizmet\s*tutar|hizmet\s*tutar|^sub\s*total$|tutar[ıi]$/, 'amount'],
    [/unit\s*price|birim\s*fiyat|^price$|^fiyat[ıi]?$|^b\.?\s*fiyat|fiyat/, 'price'],
    [/^kdv|^vat\b|^tax\b|kdv\s*oran/, 'vat'],
    [/^(birim|unit|uom|ölçü|ölçü birimi)$/, 'unit'],
    [/^(miktar[ıi]?|qty|quantity|quan\.?|adet|q'?ty|pcs|q[rt][yv]|qy|ory|oty|q\.?ty\.?|menge|cantidad|[gqo]uant[il1]t[yv]|[gqo]uant[il1]ty)$/, 'qty'],
    [/item\s*code|ürün\s*kodu|stok\s*kodu|malzeme.*kodu|hizmet.*kodu|part\s*(no|number)|^code$|^kod[u]?$|^ref(erence)?\.?$|^model$/, 'code'],
    [/description|descr|desc\b|d[eo]scr|açıklama|aciklama|ürün|^item$|^items$|malzeme|mal\s*hizmet|hizmet|product|tanım|cins|goods|services|^article$|bezeichnung/, 'name'],
    [/^(no\.?|#|s[ıi]ra( no)?|sr\.?|s\.?\s?no|item\s*no)$/, 'no']
  ];
  // İngilizce sözcüklerde Türkçe küçük harf «ı» olur (ITEM → ıtem): iki biçim de denenir
  function rx(re, s) { return re.test(low(s)) || re.test(String(s || '').toLowerCase()); }
  function rxe(re, s) { return re.exec(low(s)) || re.exec(String(s || '').toLowerCase()); }
  function gKey(label) {
    // OCR gürültüsü (1–2 harflik parçalar, işaretler) atılır
    var k = clean(String(label).split(/\s+/).filter(function (w) { var a = w.replace(/[^\p{L}\p{N}%#]/gu, ''); return a.length > 2 || /^(no|#|%)$/i.test(a); }).join(' ')).replace(/[:.]+$/, '');
    if (!k) return '';
    if (rx(/^s[ıi]ra\b/, k)) return 'no';
    if (rx(/(kdv|vat|vergi).*tutar|tutar.*(kdv|vat)/, k)) return 'vat_amount';
    for (var i = 0; i < G_COLS.length; i++) if (rx(G_COLS[i][0], k)) return G_COLS[i][1];
    return '';
  }
  var UNIT_RE = /^(adet|ad\.?|pcs\.?|pc\.?|piece|pieces|ea|each|unit|units|set|sets|takım|kg|gr|g|ton|lt|l|litre|liter|m|mt|metre|meter|m2|m²|m3|paket|pk|kutu|box|rulo|roll|çift|pair|top|koli|saat|hour|gün|day|ay|month)$/i;
  var G_END = /(ara\s*toplam|sub\s*-?\s*total|genel\s*toplam|grand\s*total|total\s*list\s*price|total\s*net\s*amount|toplam\s*tutar|bugünkü\s*fatura|kdv\s*\(|vat\s*\(|^total\b|^toplam\b|^discount\b|^iskonto\b|^page\s*\d|^sayfa\s*\d|teklife\s*ilişkin|^not\s*:|^notes?\s*:)/;
  function gGroups(l) {
    var gs = [];
    l.items.forEach(function (it) {
      var g = gs.length ? gs[gs.length - 1] : null, h = it.h || 8;
      if (g && it.x - g.x1 < Math.max(h * 0.95, 5)) { g.parts.push(it); g.x1 = Math.max(g.x1, it.x + (it.w || 0)); }
      else gs.push({ parts: [it], x0: it.x, x1: it.x + (it.w || 0) });
    });
    gs.forEach(function (g) { g.label = textOf(g.parts); });
    // OCR iki başlığı tek öbek yapabilir («Miktar — Birim»): öbek tanınmıyor ama parçaları ayrı sütun adıysa bölünür
    var out = [];
    // «… Açıklamalar Miktar» gibi bitişik başlıklar: miktar / tutar sözcüğü ayrı sütun yapılır
    var gs2 = [];
    gs.forEach(function (g) {
      var gk = gKey(g.label);
      if (g.parts.length < 2 || !gk) { gs2.push(g); return; }
      var cur = null;
      g.parts.forEach(function (p) {
        var pk = gKey(p.str), solo = (pk === 'qty' || pk === 'amount') && pk !== gk && /^[\p{L}]+[ıi]?$/u.test(p.str);
        if (solo) { if (cur) gs2.push(cur); gs2.push({ parts: [p], x0: p.x, x1: p.x + (p.w || 0) }); cur = null; return; }
        if (!cur) cur = { parts: [], x0: p.x, x1: p.x + (p.w || 0) };
        cur.parts.push(p); cur.x1 = Math.max(cur.x1, p.x + (p.w || 0));
      });
      if (cur) gs2.push(cur);
    });
    gs = gs2; gs.forEach(function (g) { g.label = textOf(g.parts); });
    gs.forEach(function (g) {
      if (g.parts.length > 1 && !gKey(g.label)) {
        var ps = g.parts.filter(function (p) { return /[\p{L}]/u.test(p.str); });
        var ks = ps.map(function (p) { return gKey(p.str); });
        var distinct = ks.filter(function (k, i) { return k && ks.indexOf(k) === i; });
        if (distinct.length >= 2 && ks.every(Boolean)) { ps.forEach(function (p) { out.push({ parts: [p], x0: p.x, x1: p.x + (p.w || 0), label: p.str }); }); return; }
      }
      out.push(g);
    });
    return out;
  }
  var hasDigit = function (s) { return /\d/.test(s); };
  // bir satır başlığın parçası olabilir mi: rakamsız, kısa öbekler
  function headPart(l) {
    if (!l) return false;
    // OCR gürültüsü (tek harf / rakam, işaret) sayılmaz
    var gs = gGroups(l).filter(function (g) { return g.label.replace(/[^\p{L}\p{N}]/gu, '').length > 2; });
    return gs.length > 0 && gs.every(function (g) { return !hasDigit(g.label.replace(/%/g, '')) && g.label.length <= 60; });
  }
  function gHeaderAt(all, i) {
    var l = all[i]; if (!l || !headPart(l)) return null;
    var h = l.h || 8, hs = [l];
    var pv = all[i - 1], nx = all[i + 1];
    if (pv && pv.page === l.page && l.y - pv.y < h * 2.4 && headPart(pv) && gGroups(pv).some(function (g) { return gKey(g.label) || /stock|list|net|total|birim|kdv|iskonto|unit|malzeme|hizmet/i.test(g.label); })) hs.unshift(pv);
    if (nx && nx.page === l.page && nx.y - l.y < h * 2.4 && headPart(nx)) {
      hs.push(nx);
      var nx2 = all[i + 2];
      if (nx2 && nx2.page === l.page && nx2.y - nx.y < h * 2.4 && headPart(nx2) && gGroups(nx2).every(function (g) { return gKey(g.label) || /^(price|fiyat|amount|tutar|status|code|no|%)$/i.test(g.label); })) hs.push(nx2);
    }
    var cells = [];
    hs.forEach(function (hl, li) {
      gGroups(hl).forEach(function (g) {
        var ov = null;
        for (var j = 0; j < cells.length; j++) { var c = cells[j]; if (c.line !== li && g.x0 < c.x1 + 3 && g.x1 > c.x0 - 3) { ov = c; break; } }
        if (ov) { ov.label = ov.line < li ? ov.label + ' ' + g.label : g.label + ' ' + ov.label; ov.x0 = Math.min(ov.x0, g.x0); ov.x1 = Math.max(ov.x1, g.x1); ov.line = li; }
        else cells.push({ label: g.label, x0: g.x0, x1: g.x1, line: li });
      });
    });
    cells = cells.filter(function (c) { return c.label.replace(/[^\p{L}\p{N}%#]/gu, '').length >= 2 || /^(no|#)$/i.test(c.label.trim()); });
    cells.sort(function (a, b) { return a.x0 - b.x0; });
    // OCR'da iç içe geçen başlıklar (ör. «Sıra / Malzeme» + «No / Kodu»): soldaki sütun sağdakinin başında biter
    for (var ci = 0; ci < cells.length - 1; ci++) if (cells[ci].x1 > cells[ci + 1].x0 - 2) cells[ci].x1 = Math.max(cells[ci].x0 + 4, cells[ci + 1].x0 - 4);
    cells.forEach(function (c) { c.key = gKey(c.label); c.cx = (c.x0 + c.x1) / 2; });
    // e-Fatura: son sütun «Malzeme / Hizmet Tutarı» (alt satırdaki «Tutarı» okunamadıysa ad sanılır) → tutar
    var nmc = cells.filter(function (c) { return c.key === 'name'; });
    if (nmc.length >= 2 && !cells.some(function (c) { return c.key === 'amount'; }) && cells[cells.length - 1].key === 'name') cells[cells.length - 1].key = 'amount';
    var keys = {}; cells.forEach(function (c) { if (c.key) keys[c.key] = (keys[c.key] || 0) + 1; });
    var n = Object.keys(keys).length;
    // v1.74: fiyatsız ürün listesi (ekran görüntüsü: «Goods / Services | Quantity») — ad + miktar yeter
    var qtyOnly = !(keys.amount || keys.price || keys.net || keys.list) && keys.qty && keys.name;
    if (!qtyOnly && (n < 3 || !(keys.amount || keys.price || keys.net) || !(keys.name || keys.qty))) return null;
    // aynı adlı iki "PRICE" sütunu (liste / net): soldaki liste, sağdaki net
    // okunamayan fiyat başlığı («usr PRICE»): net sütunu varsa ondan önceki fiyat başlığı liste fiyatıdır
    cells.forEach(function (c, ci) { if (!c.key && /pr[il1]ce|fiyat/i.test(c.label) && cells.slice(ci + 1).some(function (x) { return x.key === 'net'; })) c.key = 'list'; });
    var pr = cells.filter(function (c) { return c.key === 'price'; });
    if (pr.length === 2 && !keys.list && !keys.net) { pr[0].key = 'list'; pr[1].key = 'net'; }
    return { cols: cells, qtyOnly: !!qtyOnly, start: all.indexOf(hs[0]), end: all.indexOf(hs[hs.length - 1]) + 1, sig: cells.map(function (c) { return c.key; }).join(',') };
  }
  // Sütun sınırı: komşu başlıkların ortası; sola yaslı yazı sütunundan (ad / kod) sonra gelen sütunun sınırı o sütunun başına yakın
  // (uzun ürün adının son sözcükleri miktar sütununa kaymasın)
  function gBound(cols, i) {
    var a = cols[i], b = cols[i + 1];
    if (a.key === 'name' || a.key === 'code') return Math.max((a.x1 + b.x0) / 2, b.x0 - (b.x1 - b.x0) * 0.35 - 4);
    return (a.x1 + b.x0) / 2;
  }
  function gCell(cols, cx) {
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i], left = i ? gBound(cols, i - 1) : -1e9, right = i < cols.length - 1 ? gBound(cols, i) : 1e9;
      if (cx >= left && cx < right) return c;
    }
    return cols[cols.length - 1];
  }
  // Bir satırın öğeleri sütunlara: sütun sınırını aşan öğe sözcüklere bölünür (OCR / PDF iki hücreyi tek parça verebilir)
  function gCells(cols, l) {
    var o = {};
    l.items.forEach(function (it) {
      var words = String(it.str).split(/(\s+)/), W = it.w || 0, L = String(it.str).length || 1, pos = 0;
      var parts = [];
      words.forEach(function (w) { if (!w.trim()) { pos += w.length; return; } var x = it.x + W * pos / L, ww = W * w.length / L; parts.push({ str: w, x: x, w: ww, h: it.h }); pos += w.length; });
      var keys = parts.map(function (p) { return gCell(cols, p.x + p.w / 2); });
      var same = keys.every(function (k) { return k === keys[0]; });
      (same ? [{ c: keys[0], it: it }] : parts.map(function (p, i) { return { c: keys[i], it: p }; })).forEach(function (x) {
        var k = x.c.key || ('c' + Math.round(x.c.x0));
        (o[k] = o[k] || []).push(x.it);
      });
    });
    var r = {}; Object.keys(o).forEach(function (k) { r[k] = textOf(o[k].sort(function (a, b) { return a.x - b.x; })); });
    return r;
  }
  var CUR_TOK = /^(\$|€|₺|tl|try|usd|eur|us\$|syp)$/i;
  function lastNum(s) {
    var m = String(s || '').match(/-?\d[\d.,]*/g);
    return m ? num(m[m.length - 1]) : null;
  }
  // v1.75: KDV ORANI hücresi. OCR / dar sütunlarda oran ile yanındaki KDV TUTARI birleşebiliyor («% 20,00) 2296.57», «20,002.896,47»):
  // önce «%» işaretli sayı, sonra 0–100 arasındaki ilk sayı, sonra yapışık sayının başındaki oran («20,00» + «2.896,47»). Bulunamazsa null.
  function rateNum(s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) && s >= 0 && s <= 100 ? s : null;
    s = String(s);
    var m = /%\s*(\d{1,3}(?:[.,]\d{1,2})?)(?![\d])/.exec(s) || /(?:^|[^\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s*%/.exec(s);
    if (m) { var v = num(m[1]); if (v != null && v >= 0 && v <= 100) return v; }
    var toks = s.match(/\d[\d.,]*/g) || [];
    for (var i = 0; i < toks.length; i++) { var w = num(toks[i]); if (w != null && w >= 0 && w <= 100) return w; }
    // yapışık: «20,00» + «2.896,47» — başındaki oranın ondalık ayracı, kalan sayının ondalık ayracıyla aynı olmalı
    for (var j = 0; j < toks.length; j++) {
      var f = /^(\d{1,2})([.,])(\d{2})(\d[\d.,]*[.,]\d{1,2})$/.exec(toks[j]);
      if (f && f[4].charAt(f[4].search(/[.,]\d{1,2}$/)) === f[2] && num(f[4]) != null) return Number(f[1] + '.' + f[3]);
    }
    return null;
  }
  // tam sayıya çok yakın oran tam sayı olur (19,98 → 20); en çok 2 ondalık
  function snapRate(v) {
    if (v == null || !isFinite(v)) return null;
    var r = Math.round(v);
    return Math.abs(v - r) < 0.06 ? r : Math.round(v * 100) / 100;
  }
  // v1.75: kalem KDV'sinin genel denetimi (çevrimdışı + yapay zekâ okuması, her belge türü):
  // oran 0–100 dışındaysa (çoğunlukla KDV tutarı ya da birleşmiş hücre) atılır → KDV tutarı ÷ satır tutarı → belgenin oranı (öteki kalemler / toplamlar);
  // oran geçerli ama satırın KDV tutarıyla açıkça çelişiyorsa (OCR «20» yerine «2») tutardan bulunan tam sayı oran kullanılır.
  function fixVat(items, totals) {
    var base = function (o) { return o.amount != null && o.amount > 0 ? o.amount : o.qty > 0 && o.price > 0 ? o.qty * o.price : null; };
    var bad = [];
    items.forEach(function (o, i) {
      var b = base(o);
      if (o.vat_amount != null && (!(o.vat_amount >= 0) || (b && o.vat_amount > b))) o.vat_amount = null;
      var fa = o.vat_amount != null && b ? o.vat_amount / b * 100 : null;
      var v = o.vat;
      if (v != null && !(v >= 0 && v <= 100)) {
        // oran yerine KDV tutarı okunmuş olabilir
        if (o.vat_amount == null && b && v <= b && Math.abs(v / b * 100 - Math.round(v / b * 100)) < 0.3) { o.vat_amount = v; fa = v / b * 100; }
        v = null; bad.push(i);
      }
      if (v == null && fa != null) v = fa;
      else if (v != null && fa != null && Math.abs(fa - Math.round(fa)) < 0.3 && Math.abs(fa - v) > 1) v = Math.round(fa);
      o.vat = snapRate(v);
    });
    if (bad.length) {
      var cnt = {}, best = null;
      items.forEach(function (o) { if (o.vat != null) { cnt[o.vat] = (cnt[o.vat] || 0) + 1; if (best == null || cnt[o.vat] > cnt[best]) best = o.vat; } });
      var t = totals || {}, net = t.subtotal != null ? t.subtotal - (t.discount || 0) : null;
      if (best == null && t.vat != null && net > 0 && t.vat / net * 100 <= 100) best = snapRate(t.vat / net * 100);
      bad.forEach(function (i) { if (items[i].vat == null && best != null) items[i].vat = Number(best); });
    }
    return items;
  }
  var NUM_TOK = /^[$€₺]?-?\d[\d.,]*[$€₺]?$/;
  function gItems(all, warnings) {
    var items = [], head = null, cur = null, sig = '', seg = null;
    var NUMK = { qty: 1, price: 1, amount: 1, vat: 1, vat_amount: 1, disc: 1, list: 1, net: 1, other: 1, status: 1, no: 1 };
    // satırın yazı kısmı (sayı sütunlarındaki rakam / para birimi hariç), sütun sırasıyla
    var textCells = function (c) {
      var seenK = {};
      return clean(head.cols.map(function (col) {
        var k = col.key || ('c' + Math.round(col.x0)), v = c[k];
        if (!v || !col.key || seenK[k]) return '';
        seenK[k] = 1;
        if (NUMK[col.key] && /^[\d.,\s%$€₺|—–\-:;=]*(tl|usd|eur|try)?[\s|]*$/i.test(v)) return '';
        if (NUMK[col.key] && UNIT_RE.test(v.replace(/[\d\s.,]+/g, '').replace(/\.$/, ''))) return '';
        return v;
      }).join(' '));
    };
    // tablo bölümü bitince: devam satırları kalemlere dağıtılır. Açıklama satırları ilk kalemin ÜSTÜNDE de varsa (e-Fatura: satır içinde
    // dikey ortalı) her satır en yakın kaleme, yoksa (AKKO: açıklama kodun altında) bir önceki kaleme eklenir.
    var flush = function () {
      if (cur) { seg.rows.push(cur); cur = null; }
      if (!seg) return;
      var rows = seg.rows, conts = seg.conts;
      // OCR: tutarı bir satır yukarıda / aşağıda okunmuş kalem (fiyatsız «tutar satırı» + tutarı hesaplanmış asıl satır) birleştirilir
      for (var ri = 0; ri < rows.length; ri++) {
        var a0 = rows[ri];
        if (a0._pr) continue;
        var nb = [rows[ri + 1], rows[ri - 1]].filter(function (b0) { return b0 && b0._pr && Math.abs(b0._y - a0._y) < Math.max(a0._h, b0._h) * 2.6; })[0];
        if (!nb) continue;
        if (nb.qty != null && nb.price && Math.abs(nb.qty * nb.price - a0.amount) < Math.max(0.05, a0.amount * 0.01)) nb.amount = a0.amount;
        if (a0.name) seg.conts.push({ y: a0._y, txt: a0.name, prev: nb });
        if (a0.code && !nb.code) nb.code = a0.code;
        rows.splice(ri, 1); ri--;
      }
      var centered = rows.length && conts.some(function (x) { return x.y < rows[0]._y; });
      conts.forEach(function (x) {
        var r = null;
        if (centered) { var bd = 1e9; rows.forEach(function (rw) { var d = Math.abs(rw._y - x.y) + (x.y > rw._y ? 0.01 : 0); if (d < bd) { bd = d; r = rw; } }); }
        else r = x.prev;
        if (!r) return;
        if (x.unit) { if (!r.unit) r.unit = x.unit; return; }
        (r._parts = r._parts || []).push({ y: x.y, t: x.txt });
      });
      rows.forEach(function (rw) {
        if (rw._parts) {
          var ps = rw._parts.concat(rw.name ? [{ y: rw._y, t: rw.name }] : []).sort(function (p1, p2) { return p1.y - p2.y; });
          ps = ps.filter(function (p, k) { return !ps.some(function (q2, j) { return j !== k && q2.t.length > p.t.length && q2.t.indexOf(p.t) >= 0; }) && ps.findIndex(function (q2) { return q2.t === p.t; }) === k; });
          rw.name = ps.reduce(function (acc, p) { return !acc ? p.t : /[\-\/]$/.test(acc) ? acc + p.t : acc + ' ' + p.t; }, '');
        }
        delete rw._parts; delete rw._y; delete rw._h; delete rw._pr;
        items.push(rw);
      });
      seg = null;
    };
    for (var i = 0; i < all.length; i++) {
      var l = all[i], t = textOf(l.items), lt = low(t);
      var hh = gHeaderAt(all, i);
      if (hh && (!head || hh.cols.length >= 3)) { flush(); head = hh; sig = hh.sig; seg = { rows: [], conts: [] }; i = hh.end - 1; continue; }
      if (!head) continue;
      if (rx(G_END, t) || /^total\s*[:：]?\s*\d+$/i.test(t)) { flush(); head = null; continue; }
      var c = gCells(head.cols, l);
      var amt = c.amount != null ? lastNum(c.amount) : null, pri = c.price != null ? lastNum(c.price) : null, net = c.net != null ? lastNum(c.net) : null;
      var qtyRead = c.qty != null && /\d/.test(c.qty);
      var isRow = amt != null || ((!head.cols.some(function (x) { return x.key === 'amount'; }) || qtyRead) && (pri != null || net != null)) || (head.qtyOnly && qtyRead && /^\s*\d[\d.,]*\s*\p{L}{0,8}\.?\s*$/u.test(c.qty));
      if (isRow) {
        if (cur) seg.rows.push(cur);
        var it = { _y: l.y, _h: l.h || 10, _pr: pri != null || net != null,  name: '', code: '', qty: null, unit: '', price: null, amount: amt, list_price: null, disc_rate: null, vat: null, cur: curOf(t) };
        it.code = clean(c.code || '');
        it.name = clean(c.name || '');
        // miktar / birim hücresinin başındaki yazı sözcükleri adın sonudur
        ['qty', 'unit'].forEach(function (k) {
          if (!c[k]) return;
          var ws = c[k].split(/\s+/), lead = [];
          while (ws.length && !/\d/.test(ws[0]) && !UNIT_RE.test(ws[0].replace(/\.$/, ''))) lead.push(ws.shift());
          if (lead.length) { it.name = clean(it.name + ' ' + lead.join(' ')); c[k] = ws.join(' '); }
        });
        var q = clean(c.qty || ''), qm = /(-?\d[\d.,]*)\s*([^\d\s].*)?$/.exec(q);
        if (qm) { it.qty = num(qm[1]); if (qm[2] && UNIT_RE.test(clean(qm[2]))) it.unit = clean(qm[2]); }
        if (c.unit && !it.unit) it.unit = clean(c.unit).replace(/\d+/g, '').trim();
        it.list_price = c.list != null ? lastNum(c.list) : null;
        it.disc_rate = c.disc != null ? lastNum(c.disc) : null;
        it.price = net != null ? net : pri != null ? pri : null;
        if (c.vat != null) it.vat = rateNum(c.vat);
        // miktar sütunu yoksa ya da boşsa: adın / fiyatın içindeki "15 ADET" kalıbı
        if (it.qty == null) {
          var src = [c.name, c.unit, c.price].filter(Boolean).join(' ');
          var m2 = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(adet|ad\.?|pcs|pc|ea|set|takım|kg|lt|m|mt|metre|paket|kutu|unit|units|piece|pieces)\b/i.exec(src);
          if (m2) { it.qty = num(m2[1]); it.unit = it.unit || m2[2]; it.name = clean(it.name.replace(m2[0], ' ')); }
        }
        if (!it.unit) { var um = /(?:^|\s)(adet|pcs|ea|set|takım|kg|lt|paket|kutu)\s*$/i.exec(it.name); if (um) { it.unit = um[1]; it.name = clean(it.name.slice(0, um.index)); } }
        // ad sütununa kayan sonlardaki sayılar (miktar) ayıklanır
        if (it.qty == null) { var tq = /\s(\d{1,5})$/.exec(it.name); if (tq && it.amount != null && it.price && Math.abs(num(tq[1]) * it.price - it.amount) < Math.max(0.05, it.amount * 0.002)) { it.qty = num(tq[1]); it.name = clean(it.name.slice(0, tq.index)); } }
        if (G_OCR && !root.__noFix) fixRow(it, c);
        if (it.price == null && it.list_price != null) it.price = it.disc_rate ? Math.round(it.list_price * (1 - it.disc_rate / 100) * 10000) / 10000 : it.list_price;
        if (it.qty == null && it.amount != null && it.price) it.qty = Math.round(it.amount / it.price * 1000) / 1000;
        if (it.price == null && it.amount != null && it.qty) it.price = Math.round(it.amount / it.qty * 10000) / 10000;
        if (it.amount == null && it.price != null && it.qty != null) it.amount = Math.round(it.price * it.qty * 100) / 100;
        // v1.74: OCR'da kaybolan ondalık ayracı («$8620» = 86,20; iskonto «S000» = 50,00): liste fiyatı × (1 − iskonto) = net, net × miktar = tutar
        // ilişkilerini en iyi sağlayan basamak düzeltmesi seçilir (yalnız ilişkiler bozuksa)
        if (c.status != null && clean(c.status)) it.status = clean(c.status).replace(/(\d)\s*(ready|week|day|stok|hafta|gün)/i, '$1 $2');
        // OCR'da tek basamak kayması: miktar × fiyat ≠ tutar ise ve tutar / fiyat tam sayıysa miktar ondan;
        // fark %1'den azsa (kuruş hanesi yanlış okunmuş) tutar miktar × fiyattan
        if (it.amount != null && it.price && it.qty != null && Math.abs(it.qty * it.price - it.amount) > Math.max(0.05, it.amount * 0.002)) {
          var qq = it.amount / it.price, ratio = it.amount / (it.qty * it.price), p10 = Math.round(Math.log(ratio) / Math.LN10);
          // ayraç kaybolmuş (1.671.058 ↔ 1.671,04): tutar 10'un kuvveti kadar sapmışsa miktar × fiyat esas
          if (G_OCR && p10 !== 0 && Math.abs(ratio / Math.pow(10, p10) - 1) < 0.01) { it.amount = Math.round(it.qty * it.price * 100) / 100; warnings.push('amount-fixed'); }
          else if (Math.abs(qq - Math.round(qq)) < 0.001 && Math.round(qq) > 0) it.qty = Math.round(qq);
          else if (Math.abs(it.qty * it.price - it.amount) < it.amount * 0.01) { it.amount = Math.round(it.qty * it.price * 100) / 100; warnings.push('amount-fixed'); }
          else warnings.push('check:' + (it.name || it.code).slice(0, 40));
        }
        // OCR: kuruş hanesi yanlış okunmuş tutar (fark %1'den az) → miktar × fiyat
        if (G_OCR && it.amount != null && it.price && it.qty != null) { var dd = Math.abs(it.qty * it.price - it.amount); if (dd > 0.01 && dd < it.amount * 0.01) it.amount = Math.round(it.qty * it.price * 100) / 100; }
        if (G_OCR) it.name = it.name.replace(/\b(1|10|16|25|32|40|56|100)6(?=\s*(SFP|FC|HBA|Base|GbE|QSFP)\b)/g, '$1G');
        if (G_OCR) { it.code = clean(it.code.replace(/[|—–_=]+/g, ' ')); it.name = clean(it.name.replace(/(^|\s)[|—–_=;:]+(?=\s|$)/g, ' ')); }
        if (it.disc_rate === 0) it.disc_rate = null;
        cur = it;
      } else {
        // devam satırı: açıklamanın sürmesi ("0" satırları, çizgi gürültüsü, tekrar eden başlık atılır)
        var nm = textCells(c);
        if (!nm) continue;
        // yalnız birim / sayı olan kaymış satır («ADET»): birimse kaleme yazılır, ada eklenmez
        if (nm.split(/\s+/).every(function (w) { return UNIT_RE.test(w.replace(/\.$/, '')) || /^[\d.,$€₺%]+$/.test(w); })) { var u0 = nm.split(/\s+/).filter(function (w) { return UNIT_RE.test(w.replace(/\.$/, '')); })[0]; if (u0) seg.conts.push({ y: l.y, unit: u0, prev: cur }); continue; }
        // para değerleri, «TL», tek karakterlik OCR gürültüsü atılır
        if (G_OCR) nm = clean(nm.split(/\s+/).filter(function (w) { var a = w.replace(/[^\p{L}\p{N}]/gu, ''); var wn = w.replace(/^[^\d$€₺-]+|[^\d$€₺]+$/g, ''); return (a.length > 2 || /\d/.test(a)) && !(wn && MONEY_TOK.test(wn)) && !/^(tl|try|usd|eur)$/i.test(a); }).join(' '));
        else nm = clean(nm.replace(/^[^\p{L}\p{N}(]+/u, ''));
        if (nm && nm !== '0' && nm.replace(/[^\p{L}\p{N}]/gu, '').length > 1 && !gHeaderAt(all, i)) seg.conts.push({ y: l.y, txt: nm, prev: cur });
      }
    }
    flush();
    return items.filter(function (it) { return (it.name || it.code) && (it.amount != null || it.price != null || it.qty != null) && (it.code || String(it.name).replace(/[^\p{L}]/gu, '').length >= 3); }).map(function (it) {
      if (/^[yt]ota[lk1]\b/i.test(it.name || '')) it.name = '';
      if (!it.name) { it.name = it.code; }
      return it;
    });
  }
  function fixRow(it, c) {
    var rel = function (x, y) { return Math.abs(x - y) / Math.max(Math.abs(y), 0.01); };
    var disc0 = it.disc_rate;
    if ((disc0 == null || disc0 >= 100) && c.disc != null) { var dm = /[S$5]?(\d{3,4})\b/.exec(String(c.disc).replace(/[Oo]/g, '0')); if (dm) disc0 = num(dm[1]); }
    var list0 = it.list_price ? it.list_price : null;
    // ayraçsız okunmuş tam sayı («$4310»): belgedeki para değerleri kuruşlu yazılıyorsa iki hane kuruş sayılması öncelikli
    var noSep = function (k) { var t = String(c[k] || ''); return /\d{3,}/.test(t) && !/\d[.,]\d/.test(t); };
    var cand = function (v, k) { if (v == null) return [[null, 0]]; var o = [[v, 0]], ns = k && noSep(k) && Math.round(v) === v; [100, 10, 1000].forEach(function (d, i) { if (v >= d) o.push([Math.round(v / d * 10000) / 10000, d === 100 && ns ? -0.003 : 0.002 * (i + 1)]); }); return o; };
    var dc = disc0 == null ? [[null, 0]] : [[disc0, 0], [disc0 / 100, 0.002]].filter(function (x) { return x[0] >= 0 && x[0] < 100; });
    var qc = it.qty != null && it.qty > 0 ? [[it.qty, 0]] : [[null, 0]];
    var eval1 = function (o) { if (o.qty == null || o.price == null || o.amount == null) return null; return rel(o.qty * o.price, o.amount); };
    var e0 = eval1({ qty: it.qty, price: it.price, amount: it.amount });
    var l0 = list0 != null && it.price != null ? rel(list0 * (1 - (disc0 || 0) / 100), it.price) : 0;
    var anyNs = ['net', 'price', 'amount'].some(function (k) { return c[k] != null && noSep(k); });
    if (e0 != null && e0 < 0.004 && l0 < 0.004 && !anyNs) return;
    var best = null;
    cand(it.price, c.net != null ? 'net' : 'price').forEach(function (pp) { cand(it.amount, 'amount').forEach(function (aa) { cand(list0, 'list').forEach(function (ll) { (dc.length ? dc : [[null, 0]]).forEach(function (d) { qc.forEach(function (qq) {
      var o = { qty: qq[0], price: pp[0], amount: aa[0], list: ll[0], disc: d[0] };
      if (o.price == null && o.list != null) o.price = Math.round(o.list * (1 - (o.disc || 0) / 100) * 10000) / 10000;
      if (o.qty == null && o.price && o.amount != null) { var q2 = o.amount / o.price; if (Math.abs(q2 - Math.round(q2)) < 0.003 && Math.round(q2) > 0) o.qty = Math.round(q2); }
      if (o.amount == null && o.qty != null && o.price != null) o.amount = Math.round(o.qty * o.price * 100) / 100;
      var e1 = eval1(o); if (e1 == null) return;
      var e2 = o.list != null && o.price != null ? rel(o.list * (1 - (o.disc || 0) / 100), o.price) : 0.002;
      var e = e1 + Math.min(e2, 0.05) * 0.5 + pp[1] + aa[1] + ll[1] + d[1];
      if (!best || e < best.e) best = { e: e, e1: e1, e2: e2, o: o };
    }); }); }); }); });
    if (!best || best.e1 > 0.004) return;
    it.qty = best.o.qty; it.price = best.o.price; it.amount = best.o.amount;
    if (best.o.list != null && best.e2 < 0.01) { it.list_price = best.o.list; if (best.o.disc != null) it.disc_rate = best.o.disc; }
    else if (best.e2 >= 0.01) { it.list_price = null; }
  }
  // Başlığı okunamayan tablo (eğik / parlak fotoğraf): sağda iki para değeri (birim fiyat + tutar), önünde «15 ADET» olan satırlar kalemdir;
  // aradaki yazı satırları açıklamanın devamı. Tutar = miktar × fiyat denetimiyle doğrulanır.
  var MONEY_TOK = /^[$€₺]?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})[$€₺]?$|^[$€₺]?-?\d+[.,]\d{1,4}[$€₺]?$/;
  function gItemsLoose(all, warnings) {
    var items = [], cur = null, lastY = -1e9;
    for (var i = 0; i < all.length; i++) {
      var l = all[i], t = textOf(l.items);
      if (rx(G_END, t)) { if (items.length) break; else continue; }
      var raw = t.split(/\s+/).filter(Boolean), alnum = function (w) { return /[\p{L}\p{N}]/u.test(w); };
      var money = [], k = raw.length - 1;
      while (k >= 0 && money.length < 3) {
        var w = raw[k].replace(/[|]/g, '');
        if (!alnum(w) || /^(tl|usd|eur|try)$/i.test(w)) { k--; continue; }
        if (MONEY_TOK.test(w)) { money.unshift(num(w)); k--; } else break;
      }
      var toks = raw.filter(alnum);
      // tutar okunamadıysa: «16 ADET 750,00 $ …» kalıbı (miktar + birim + birim fiyat) → tutar = miktar × fiyat
      if (money.length < 2) {
        for (var u = 1; u < raw.length - 1; u++) {
          if (!UNIT_RE.test(raw[u].replace(/\.$/, '')) || !/^\d+(?:[.,]\d+)?$/.test(raw[u - 1])) continue;
          var v = u + 1; while (v < raw.length && !alnum(raw[v])) v++;
          if (v < raw.length && MONEY_TOK.test(raw[v].replace(/[|]/g, ''))) {
            var pr0 = num(raw[v].replace(/[|]/g, '')), q0 = num(raw[u - 1]);
            var w2 = v + 1; while (w2 < raw.length && !alnum(raw[w2])) w2++;
            var am0 = w2 < raw.length && MONEY_TOK.test(raw[w2].replace(/[|]/g, '')) ? num(raw[w2].replace(/[|]/g, '')) : Math.round(q0 * pr0 * 100) / 100;
            money = [pr0, am0]; k = u; // k: birimin indeksi → baş kısım birim + miktarla birlikte aşağıda ayrılır
            raw = raw.slice(0, u + 1);
            if (w2 >= raw.length) warnings.push('amount-calc');
            break;
          }
        }
      }
      if (money.length >= 2 && money[money.length - 1] > 0) {
        var head = raw.slice(0, k + 1), unit = '', qty = null;
        while (head.length && !alnum(head[head.length - 1])) head.pop();
        if (head.length && UNIT_RE.test(head[head.length - 1].replace(/\.$/, ''))) unit = head.pop();
        while (head.length && !alnum(head[head.length - 1])) head.pop();
        if (head.length && /^\d+(?:[.,]\d+)?$/.test(head[head.length - 1])) qty = num(head.pop());
        while (head.length && (head[0].length === 1 || !alnum(head[0]))) head.shift();
        var name = clean(head.join(' ').replace(/^[\[\]{}|]+|[\[\]{}|_]+$/g, ''));
        var amount = money[money.length - 1], price = money[money.length - 2];
        if (qty == null && price) { var qq = amount / price; if (Math.abs(qq - Math.round(qq)) < 0.001) qty = Math.round(qq); }
        if (qty != null && price && Math.abs(qty * price - amount) > Math.max(0.05, amount * 0.002)) {
          var q2 = amount / price; if (Math.abs(q2 - Math.round(q2)) < 0.001 && Math.round(q2) > 0) qty = Math.round(q2); else warnings.push('check:' + name.slice(0, 40));
        }
        if (!name) continue;
        cur = { name: name, code: '', qty: qty, unit: unit, price: price, amount: amount, cur: curOf(t), x0: l.x0 };
        items.push(cur); lastY = l.y;
        continue;
      }
      // devam satırı: öncekinin hemen altında, sözcükleri anlamlı (ortalama ≥ 3 harf), sayı değeri yok
      if (cur && l.y - lastY < (l.h || 12) * 2.6) {
        var long = toks.filter(function (w) { return w.replace(/[^\p{L}\p{N}]/gu, '').length >= 3; });
        if (long.length >= 3 && long.length >= toks.length * 0.4 && !money.length) {
          var body = raw.slice(); while (body.length && (body[0].length === 1 && !/\d/.test(body[0]) || !alnum(body[0]))) body.shift(); while (body.length && !alnum(body[body.length - 1])) body.pop();
          cur.name = clean(cur.name + ' ' + body.join(' ')); lastY = l.y;
        }
      }
    }
    return items.map(function (it) { delete it.x0; return it; });
  }
  function gTotals(all, from, cur) {
    var T = {}, extra = {};
    // etiketten sonraki ilk sayı; aynı satırda iki para biriminde (USD | TL) toplam varsa belgenin para birimindeki seçilir
    var after = function (t, re) {
      var g = new RegExp(re.source, 'g'), m, best = null;
      while ((m = g.exec(t))) {
        var rest = t.slice(m.index + m[0].length).replace(/\(\s*%?\s*\d+(?:[.,]\d+)?\s*%?\s*\)/g, ' ').replace(/%\s*\d+(?:[.,]\d+)?/g, ' ');
        var n = /-?\d[\d.,]*\d|\d/.exec(rest);
        if (!n) continue;
        var raw = n[0], tail = rest.slice(n.index, n.index + raw.length + 6), head = rest.slice(Math.max(0, n.index - 4), n.index);
        var o = { v: num(raw), money: /[.,]\d{2,4}$/.test(raw) || /[$€₺]|tl|usd|eur/i.test(head + tail), cur: curOf(head + tail) };
        if (!best || (cur && o.cur === cur && best.cur !== cur)) best = o;
        if (m[0].length === 0) g.lastIndex++;
      }
      return best;
    };
    for (var i = Math.max(0, from); i < all.length; i++) {
      var t = textOf(all[i].items), lt = low(t).replace(/ı/g, 'i').replace(/İ/g, 'i'), x;
      if ((x = after(lt, /ara\s*toplam|sub\s*-?\s*total|total\s*net\s*amount|mal\s*\/?\s*hizmet\s*toplam\s*tutar[ıi]?/)) && x.money) { if (T.subtotal == null || /total\s*net\s*amount/.test(lt)) T.subtotal = x.v; }
      if ((x = after(lt, /total\s*list\s*price/)) && x.money) extra.list_total = x.v;
      if ((x = after(lt, /toplam\s*iskonto|(^|\s)(discount|iskonto|indirim)\b/)) && x.money) extra.discount = x.v;
      var vr = /(kdv|vat|tax)\s*\(?\s*%\s*(\d+(?:[.,]\d+)?)|(kdv|vat)\s*\(?\s*(\d+(?:[.,]\d+)?)\s*%/.exec(lt);
      if (vr) extra.vat_rate = num(vr[2] || vr[4]);
      if ((x = after(lt, /hesaplanan\s*kdv|(^|\s)(kdv|vat)\b(?!\s*no)/)) && x.money) T.vat = x.v;
      if ((x = after(lt, /vergiler\s*dahil\s*toplam\s*tutar[ıi]?|genel\s*toplam|grand\s*total|(^|\s)toplam\s*tutar[ıi]?(?=\s|$|\d|[:：])|(^|\s)total(?!\s*(list|net))\s*[:：$€]?/)) && x.money && !/mal\s*\/?\s*hizmet\s*toplam/.test(lt)) T.total = x.v;
      if ((x = after(lt, /ödenecek\s*tutar|amount\s*due|balance\s*due/)) && x.money) T.payable = x.v;
      if ((x = after(lt, /bugünkü\s*fatura\s*tutar[ıi]|tl\s*karş[ıi]l[ıi]ğ[ıi]/)) && x.money) extra.try_total = x.v;
      if ((x = after(lt, /(usd|eur|dolar|euro)\s*(sat[ıi]ş|al[ıi]ş)?\s*kur(u)?|exchange\s*rate/))) { extra.fx_rate = x.v; extra.fx_cur = /eur|euro/.test(lt) ? 'EUR' : 'USD'; }
    }
    return { totals: T, extra: extra };
  }
  // üst bölüm: sol / orta / sağ bloklar → satıcı (belgeyi düzenleyen) / alıcı (müşteri)
  var G_COMPANY = /(^|[\s.,])(a\.?\s?ş\.?|ltd\.?|şti\.?|limited|anonim|şirketi?|ticaret|san\.|tic\.|inc\.?|llc|gmbh|corp\.?|corporation|co\.|company|fze|fzco|s\.?a\.?r\.?l|trading|holding)(?=[\s.,]|$)/;
  var G_BUYER = /^(customer|müşteri|sayın|sayin|bill\s*to|alıcı|alici|to\s*:|consignee|sold\s*to|invoice\s*to|attn|yetkili|ilgili)/i;
  var G_SELLER = /(tel\b|telefon|phone|fax|faks|tax\s*id|vergi|\bvd\b|\bv\.d\.|iban|banka|bank|www\.|@|e-?mail|e-?posta|mersis)/i;
  var G_SKIP = /^(proje\s*ad[ıi]|teklif\s*(no|tarihi)|geçerlilik|fatura\s*(no|tarihi)|tarih|date|no\s*[:：]|quotation|invoice|proforma|sales\s*rep|payment\s*terms|incoterms|delivery\s*address|teklif\s*mektubu|banka\s*bilgilerimiz|uyarı|garanti|ziraat|iş\s*bankası|akbank|yapı\s*kredi|vakıf|halk|qnb|denizbank|ing\b|tr\d{2}\s?\d{4})/i;
  var G_LABEL = /^(vd\s*\/\s*vn|v\.?d\.?|vergi\s*dairesi|yetkili|tel(efon)?|fax|faks|proje\s*ad[ıi]|teklif\s*(no|tarihi)|fatura\s*(no|tarihi)|geçerlilik|tax\s*id|date|tarih|no|sales\s*rep\.?|payment\s*terms|incoterms|attn)\s*[:：]?$/i;
  function gBlocks(top, W) {
    var segs = [];
    top.forEach(function (l) {
      var cur = null, h = l.h || 8;
      l.items.forEach(function (it) {
        // «Yetkili      : Habib» gibi etiket / değer aralığı büyük olsa da tek parça
        if (cur && (it.x - cur.x1 < Math.max(h * 3, W * 0.035) || (/^[:：—–]/.test(it.str) && it.x - cur.x1 < W * 0.3) || ((/[:：]$/.test(cur.items[cur.items.length - 1].str) || G_LABEL.test(textOf(cur.items))) && it.x - cur.x1 < W * 0.25))) { cur.items.push(it); cur.x1 = Math.max(cur.x1, it.x + (it.w || 0)); }
        else { cur = { items: [it], x0: it.x, x1: it.x + (it.w || 0), y: l.y, h: h }; segs.push(cur); }
      });
    });
    segs.forEach(function (s) { s.text = textOf(s.items); });
    var cl = [];
    segs.forEach(function (s) {
      var best = null;
      cl.forEach(function (c) { if (Math.abs(c.x0 - s.x0) < W * 0.05 || Math.abs(c.x1 - s.x1) < W * 0.04 || (s.x0 >= c.x0 - 2 && s.x1 <= c.x1 + W * 0.05 && s.x0 < c.x1)) { if (!best) best = c; } });
      if (best) { best.segs.push(s); best.x1 = Math.max(best.x1, s.x1); } else cl.push({ x0: s.x0, x1: s.x1, segs: [s] });
    });
    var blocks = [];
    cl.forEach(function (c) {
      c.segs.sort(function (a, b) { return a.y - b.y; });
      var b = null;
      c.segs.forEach(function (s) {
        if (b && s.y - b.y1 < s.h * 3.3) { b.lines.push(s.text); b.y1 = s.y; } else { b = { x0: c.x0, y0: s.y, y1: s.y, lines: [s.text] }; blocks.push(b); }
      });
    });
    return blocks;
  }
  var G_ADDR = /(^|\s)(mah(alle(si)?)?\.?|cad(de(si)?)?\.?|sk\.?|sok(ak|ağı)?\.?|bulvar[ıi]?|blv\.?|no\s*:|apt\.?|kat\s*:|blok|osb|köyü|mevkii|iç kapı|p\.\s?k\.?|street|st\.|road|avenue|floor|building)(?=\s|$|[.:,])/i;
  function gParty(lines) {
    var p = { name: '', address: '', phone: '', email: '', web: '', tax_office: '', tax_no: '', fax: '', district: '', city: '', postal_code: '', country: '', contact: '' };
    var body = [];
    lines.forEach(function (t) {
      t = clean(String(t).replace(/^[^\p{L}\p{N}(+]+/u, '').replace(/[|]+/g, ' '));
      if (!t) return;
      var lt = low(t), m;
      if ((m = /^(vd\s*\/\s*vn|v\.?d\.?\s*\/\s*v\.?n\.?|vergi\s*dairesi\s*\/\s*(no|numaras[ıi]))\s*[:：—\-|]*\s*(.*)$/i.exec(t))) {
        var pr = m[3].split('/'); p.tax_office = clean((pr[0] || '').replace(/[:：—\-|]/g, ' ')); p.tax_no = (pr.slice(1).join('') || '').replace(/\D/g, '');
        if (!p.tax_no && /\d{8,}/.test(m[3].replace(/\s/g, ''))) { p.tax_no = (/\d{8,}/.exec(m[3].replace(/\s/g, '')) || [''])[0]; p.tax_office = clean(m[3].replace(/[\d\s:：—\-|\/]+$/, '').replace(/[:：—\-|]/g, ' ')); }
        return;
      }
      if ((m = /^(.*?)\s*\b(vd|v\.d\.)\s*[\/:：]?\s*([\d\s]{8,})$/i.exec(t))) { p.tax_office = clean(m[1]); p.tax_no = m[3].replace(/\D/g, ''); return; }
      if ((m = /(tax\s*id|tax\s*no|vkn|tckn|vergi\s*no)\s*[:：]?\s*([\d\s]{8,})/i.exec(t))) { p.tax_no = m[2].replace(/\D/g, ''); return; }
      if ((m = /^(yetkili|attn|contact|ilgili)\s*[:：]?\s*(.*)$/i.exec(t))) { p.contact = clean(m[2]); return; }
      if ((m = /^(tel|telefon|phone|gsm)\.?\s*[:：]?\s*(.*)$/i.exec(t))) { p.phone = clean(m[2]); return; }
      if ((m = /^(fax|faks)\.?\s*[:：]?\s*(.*)$/i.exec(t))) { p.fax = clean(m[2]); return; }
      if ((m = /[\w.+\-]+@[\w\-]+(\.[\w\-]+)+/.exec(t))) { p.email = p.email || m[0]; if (clean(t.replace(m[0], '').replace(/e-?(mail|posta)\s*[:：]?/i, '')).length < 3) return; }
      if (G_SKIP.test(lt) || G_BUYER.test(lt) && clean(t.replace(G_BUYER, '').replace(/^[:：]/, '')).length < 2) return;
      body.push(clean(t.replace(/^(customer|müşteri|sayın|sayin|bill\s*to|alıcı|alici|to)\s*[:：]?\s*/i, '')));
    });
    body = body.filter(Boolean);
    var ci = -1;
    for (var i = 0; i < body.length; i++) if (G_COMPANY.test(low(body[i]))) { ci = i; break; }
    // unvanın baş tarafı: şirket ekli satırdan önceki (adres / rakam olmayan) en çok iki satır
    var s0 = ci >= 0 ? ci : 0;
    while (s0 > 0 && ci - s0 < 2 && !G_ADDR.test(body[s0 - 1]) && !/\d{3,}/.test(body[s0 - 1]) && body[s0 - 1].length > 3) s0--;
    var nameEnd = ci >= 0 ? ci : 0;
    // unvanın sürmesi: şirket ekiyle bitmiyorsa sonraki satır da (adres değilse)
    if (ci >= 0 && !/(a\.?\s?ş\.?|şti\.?|şirketi|limited|inc\.?|llc|gmbh|corp\.?|co\.)\s*$/i.test(low(body[ci])) && body[ci + 1] && !G_ADDR.test(body[ci + 1]) && G_COMPANY.test(low(body[ci + 1]))) nameEnd = ci + 1;
    if (ci < 0 && body.length) nameEnd = 0;
    p.name = clean(body.slice(s0, nameEnd + 1).join(' '));
    var addr = body.slice(nameEnd + 1).concat(body.slice(0, s0));
    p.address = clean(addr.join(' ').replace(/\s*\/\s*/g, '/ ').replace(/\/ $/, '')).replace(/\s+\//g, '/');
    var pc = /\b(\d{5})\b/.exec(p.address); if (pc) p.postal_code = pc[1];
    var words = upTr(p.address).replace(/[\/,.]/g, ' ').split(/\s+/).filter(Boolean);
    for (var w = words.length - 1; w >= Math.max(0, words.length - 4); w--) if (ILLER.indexOf(words[w]) >= 0) { p.city = words[w]; break; }
    if (/\bsyria\b|suriye|سوريا/i.test(p.address)) p.country = 'Syria';
    p.phone = (/[+(]?\d[\d()\s\-]{6,}\d/.exec(p.phone) || [''])[0].trim();
    return p;
  }
  var G_OCR = false;
  function parseGeneric(pages) {
    var warnings = [], all = [];
    G_OCR = pages.some(function (pg) { return pg.items.some(function (it) { return it.conf != null; }); });
    pages.forEach(function (pg, pi) { linesOf(pg.items).forEach(function (l) { l.page = pi; l.W = pg.width; all.push(l); }); });
    var fullText = all.map(function (l) { return textOf(l.items); }).join('\n');
    TR_STYLE = /\d,\d{2}\b/.test(fullText) || !/\d\.\d{2}\b/.test(fullText);
    var W = pages[0] ? pages[0].width : 595;
    var items = gItems(all, warnings);
    if (!items.length) { items = gItemsLoose(all, warnings); if (items.length) warnings.push('loose-table'); }
    var hi = -1;
    for (var i = 0; i < all.length && hi < 0; i++) { var hh = gHeaderAt(all, i); if (hh) hi = hh.start; }
    if (hi < 0) warnings.push('no-table');
    var top = all.filter(function (l, k) { return l.page === 0 && (hi < 0 ? k < all.length * 0.4 : k < hi); });
    var cur0 = curOf(items.map(function (i) { return i.cur; }).join(' ')) || '';
    var tt = gTotals(all, hi < 0 ? 0 : hi, cur0);
    // fatura bilgileri
    var meta = {}, topText = top.map(function (l) { return textOf(l.items); }).join('\n');
    // belge no: «Teklif No : GBT45287», «Invoice No: …», «No : S157004» (adresteki «Kat:13 No:1990», «Kapı No: 509» sayılmaz)
    var nre = /(teklif|fatura|invoice|quotation|quote|proforma|belge|sipariş|order|document)?\s*(no|number|numaras[ıi]|#)\.?\s*([:：]\s*)?([A-Z]{0,8}[\-\/]?\d[\w\-\/]*)/gi, nm, bestN = null, bestS = -99;
    while ((nm = nre.exec(topText))) {
      if (!nm[1] && !nm[3]) continue; // yalın «No» iki nokta ister
      var ix = nm.index; nm = [nm[0], nm[1], nm[2], nm[4]]; nm.index = ix;
      var before = topText.slice(Math.max(0, nm.index - 14), nm.index).toLowerCase(), v = nm[3], sc0 = 0;
      if (/kat|kap[ıi]|sokak|sk\.?|blok|mah|cad|apt|daire|iç|d[ıi]ş|p\.?k/.test(before + ' ' + String(nm[1] || ''))) sc0 -= 6;
      if (nm[1]) sc0 += 3;
      if (/[A-Za-z]/.test(v)) sc0 += 2;
      if (v.length >= 5) sc0 += 1;
      if (sc0 > bestS) { bestS = sc0; bestN = v; }
    }
    if (bestN && bestS >= 2) meta.number = bestN;
    var dm = /(teklif\s*tarihi|fatura\s*tarihi|invoice\s*date|quotation\s*date|düzenlenme\s*tarihi|tarih|date)\s*[:：]?\s*(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i.exec(topText) || /(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/.exec(topText);
    if (dm) meta.date = isoDate(dm[2] || dm[1]) || '';
    var vm = /(geçerlilik|valid\s*until|validity|son\s*geçerlilik)\s*(tarihi)?\s*[:：]?\s*(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{4})/i.exec(topText);
    if (vm) meta.valid_until = isoDate(vm[3]);
    var km = /(teklif\s*mektubu|teklif|quotation|proforma|invoice|fatura)/i.exec(topText);
    if (km) meta.doc_kind = /teklif|quotation/i.test(km[1]) ? 'quote' : /proforma/i.test(km[1]) ? 'proforma' : 'invoice';
    var rep = /(sales\s*rep\.?|satış\s*temsilcisi)\s*[:：]?\s*([^\n]+)/i.exec(topText); if (rep) meta.sales_rep = clean(rep[2]);
    var pt = /(payment\s*terms|ödeme\s*şekli|ödeme\s*koşul\w*)\s*[:：]?\s*([^\n]+)/i.exec(topText); if (pt) meta.payment_terms = clean(pt[2]);
    if (tt.extra.fx_rate) { meta.doc_fx_rate = String(tt.extra.fx_rate); meta.doc_fx_cur = tt.extra.fx_cur; }
    if (tt.extra.try_total) meta.doc_try_total = String(tt.extra.try_total);
    // taraflar
    var blocks = gBlocks(top, W).filter(function (b) { return b.lines.some(function (t) { return G_COMPANY.test(low(t)) || G_BUYER.test(low(t)); }); });
    var sc = blocks.map(function (b) {
      var txt = b.lines.join('\n'), lt = low(txt);
      var buy = (G_BUYER.test(low(b.lines[0])) ? 3 : 0) + (/yetkili|attn|contact|sayın|bill\s*to|customer|müşteri/.test(lt) ? 1 : 0);
      var sel = (lt.match(new RegExp(G_SELLER.source, 'gi')) || []).length + (/delivery\s*address|teslimat/.test(lt) ? -2 : 0);
      return { b: b, buy: buy, sel: sel, comp: b.lines.some(function (t) { return G_COMPANY.test(low(t)); }) };
    }).filter(function (x) { return x.comp && !/delivery\s*address|teslimat\s*adresi|ship\s*to/i.test(x.b.lines[0]); });
    var seller = null, buyer = null;
    var bs = sc.slice().sort(function (a, b) { return (b.buy - b.sel) - (a.buy - a.sel); });
    if (bs.length && bs[0].buy > 0) buyer = bs[0];
    var ss = sc.filter(function (x) { return x !== buyer; }).sort(function (a, b) { return (b.sel - b.buy) - (a.sel - a.buy) || a.b.y0 - b.b.y0; });
    if (ss.length) seller = ss[0];
    if (!buyer) { var rest = sc.filter(function (x) { return x !== seller; }); if (rest.length) buyer = rest[0]; }
    var cur = curOf(items.map(function (i) { return i.cur; }).join(' ')) || curOf(fullText.slice(-1500)) || '';
    if (tt.extra.vat_rate != null) items.forEach(function (it) { if (it.vat == null) it.vat = tt.extra.vat_rate; });
    if (tt.extra.discount != null && tt.totals.subtotal == null) tt.totals.discount = tt.extra.discount;
    return { source: 'offline', parser: 'generic', seller: seller ? gParty(seller.b.lines) : {}, buyer: buyer ? gParty(buyer.b.lines) : {}, meta: meta, items: items, totals: tt.totals, currency: cur, warnings: warnings };
  }
  // Konumlu okumanın en iyisi: e-Fatura düzeni ile genel düzen; tutarlı (kalem toplamı = ara toplam) ve daha çok kalemli olan
  function parseBest(pages) {
    var a = null, b = null;
    try { a = normalize(parseLayout(pages)); } catch (e) { a = null; }
    try { b = normalize(parseGeneric(pages)); } catch (e) { b = null; }
    if (!a) return b; if (!b) return a;
    var score = function (x) { return (selfCheck(x) === true ? 1000 : 0) + x.items.length * 10 + (x.buyer.name ? 2 : 0) + (x.seller.name ? 2 : 0) + (x.totals.total != null ? 1 : 0); };
    var r = score(b) > score(a) ? b : a, o = r === a ? b : a;
    // eksik taraf / bilgi diğerinden tamamlanır
    ['buyer', 'seller'].forEach(function (k) { if (!r[k].name && o[k].name) r[k] = o[k]; });
    Object.keys(o.meta).forEach(function (k) { if (!r.meta[k]) r.meta[k] = o.meta[k]; });
    return r;
  }

  // ---------- pdf.js ----------
  var base = (function () {
    try { var s = document.currentScript && document.currentScript.src; if (s) return s.replace(/[^\/]*$/, ''); } catch (e) {}
    return './assets/';
  })();
  var pdfjsP = null;
  function pdfjs() {
    if (!pdfjsP) {
      pdfjsP = import(base + 'pdfjs/pdf.min.mjs').then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = base + 'pdfjs/pdf.worker.min.mjs';
        // ayrı iş parçacığı (Worker) dosya adresinden açılamayabilir: çalışan modül ana iş parçacığında yüklenir
        return import(base + 'pdfjs/pdf.worker.min.mjs').then(function (w) { root.pdfjsWorker = w; return lib; }, function () { return lib; });
      });
      pdfjsP.catch(function () { pdfjsP = null; });
    }
    return pdfjsP;
  }
  function extract(buf) {
    return pdfjs().then(function (lib) {
      return lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, useSystemFonts: true }).promise;
    }).then(function (doc) {
      var n = Math.min(doc.numPages, 20), out = [];
      var one = function (i) {
        return doc.getPage(i).then(function (pg) {
          var vp = pg.getViewport({ scale: 1 });
          return pg.getTextContent().then(function (tc) {
            out.push({ width: vp.width, height: vp.height, items: tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
              var h = Math.abs(it.transform[3]) || it.height || 8;
              return { str: it.str, x: it.transform[4], y: vp.height - it.transform[5] - h, w: it.width, h: h };
            }) });
          });
        });
      };
      var p = Promise.resolve();
      for (var i = 1; i <= n; i++) (function (i) { p = p.then(function () { return one(i); }); })(i);
      return p.then(function () { try { doc.destroy(); } catch (e) {} return out; });
    });
  }

  // ---------- yapay zeka (Gemini) ----------
  var F = function () { return root.falcon || {}; };
  function setting(k) { try { return Promise.resolve(F().settings.get(k)).then(function (v) { return v == null ? '' : String(v); }, function () { return ''; }); } catch (e) { return Promise.resolve(''); } }
  // v1.61.2: zaman aşımı ayrı bildirilir (eskiden "internet yok" sanılıyordu); her istek kendi süresiyle
  function http(url, body, key, timeout) {
    var ai = F().ai, ms = timeout || 60000;
    var netErr = function (msg) { var e = new Error(msg || 'network'); e.net = true; if (/timeout|abort/i.test(String(msg))) e.timeout = true; return e; };
    if (ai && ai.request) return Promise.resolve(ai.request({ url: url, body: body, key: key, timeout: ms })).then(function (r) { if (r && r.status === 0) throw netErr(r.error); return r; });
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    return fetch(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: body ? JSON.stringify(body) : undefined, signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.json().catch(function () { return null; }).then(function (d) { return { status: res.status, data: d }; }); }, function (e) { throw netErr(e && e.name === 'AbortError' ? 'timeout' : String(e && e.message || e)); })
      .then(function (r) { clearTimeout(tm); return r; }, function (e) { clearTimeout(tm); throw e; });
  }
  var API = 'https://generativelanguage.googleapis.com/v1beta/';
  var FALLBACK = ['gemini-pro-latest', 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
  // Hesaptaki en güçlü modeller: pro > flash > lite, büyük sürüm önce, kararlı sürüm deneme sürümünden önce
  function rankModels(list) {
    var sc = function (n) {
      var m = /^gemini-(\d+(?:\.\d+)?)-(pro|flash)(-lite)?(?:-(.*))?$/.exec(n);
      if (!m || /image|tts|audio|live|embed|vision|thinking-exp|computer|robotics|nano/.test(n)) return null;
      var v = Number(m[1]), tier = m[2] === 'pro' ? 3 : m[3] ? 1 : 2, pre = m[4] ? (/latest/.test(m[4]) ? 0 : /preview/.test(m[4]) ? 1 : 2) : 0;
      return tier * 1000 + v * 100 - pre;
    };
    return list.map(function (n) { return { n: n, s: sc(n) }; }).filter(function (x) { return x.s != null; }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.n; });
  }
  var modelsCache = null;
  function models(key) {
    if (modelsCache) return Promise.resolve(modelsCache);
    return http(API + 'models?pageSize=200', null, key).then(function (r) {
      if (r.status === 401 || r.status === 403) { var e = new Error('ai-key'); e.key = true; throw e; }
      var ls = r.data && r.data.models ? r.data.models.filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; }).map(function (m) { return String(m.name).replace(/^models\//, ''); }) : [];
      var best = rankModels(ls);
      modelsCache = best.length ? best.slice(0, 5).concat(FALLBACK.filter(function (x) { return best.indexOf(x) < 0; }).slice(0, 2)) : FALLBACK;
      return modelsCache;
    }, function (e) { if (e.net) throw e; return FALLBACK; });
  }
  var PROMPT = [
    'You read a commercial document and return ONLY JSON, no prose. It may be a Turkish e-Fatura / e-Arşiv invoice, a price offer / quotation',
    '("Teklif", "Teklif Mektubu", "Quotation", "Proforma"), or a foreign invoice; given as a PDF or as a PHOTO of a screen / paper',
    '(perspective, glare, moiré lines — read carefully, use the table grid; never guess digits you cannot see).',
    'Keep every text exactly as printed (Turkish letters, upper/lower case, model numbers). Numbers as plain JSON numbers with "." decimals',
    '(Turkish 8.330,00 → 8330; English 2,175.10 → 2175.1; 0,5500 → 0.55). Dates as YYYY-MM-DD (10/22/2026 is month/day). Unknown → "" or null. Do not invent values.',
    'Schema:',
    '{"doc_type":"invoice|quote|proforma|other",',
    ' "seller":{"name":"","address":"","district":"","city":"","postal_code":"","country":"","phone":"","fax":"","email":"","web":"","tax_office":"","tax_no":"","mersis":"","trade_reg":"","contact":""},',
    ' "buyer":{ same keys as seller },',
    ' "meta":{"date":"","number":"","ettn":"","scenario":"","inv_type":"","customization":"","issue_time":"","campaign":"","cargo":"","order_no":"","order_date":"","waybill_no":"","waybill_date":"","due_date":"","valid_until":"","sales_rep":"","payment_terms":"","doc_fx_rate":null,"doc_fx_cur":"","doc_try_total":null},',
    ' "currency":"TRY|USD|EUR|SYP",',
    ' "items":[{"no":1,"depot":"","code":"","name":"","model":"","part_no":"","serial":"","qty":0,"unit":"","list_price":null,"disc_rate":null,"disc_amount":null,"price":0,"amount":0,"vat":null,"vat_amount":null,"status":""}],',
    ' "totals":{"subtotal":0,"discount":0,"vat":0,"total":0,"payable":0}}',
    'seller = the company that ISSUED the document (its logo, bank accounts / IBAN, stamp, "Tel", Tax ID usually belong to it). buyer = the addressee / customer',
    '("SAYIN", "Customer", "Bill to", the framed address box, "Yetkili" contact person). contact = the named contact person ("Yetkili", "Attn").',
    'items: one entry per table line in order (tables may continue over several pages with the header repeated; skip repeated headers, page footers like "Total: 28" or "Page 1 / 3").',
    'name = the full product / service description joined into one line (descriptions may wrap over several lines; drop stray "0" lines). code = item / stock code column.',
    'model / part_no / serial = values written as "Model:", "P/N:", "S/N:" inside the description (keep them in name too).',
    'qty = number only, unit = unit word (ADET, Adet, pcs, Kg…). price = NET unit price excluding VAT (after line discount). list_price = list / gross unit price when a',
    'separate list price and discount % are printed (disc_rate = that %). amount = line total as printed. vat = VAT % (20 for "KDV (%20)") when it applies to the lines.',
    'totals.subtotal = "Ara Toplam" / "Sub Total" / "Total Net Amount"; totals.vat = KDV / VAT amount; totals.total = "Genel Toplam" / "Grand Total" / "Total".',
    'meta.number = invoice / quotation number ("Teklif No", "Fatura No", "Quotation No"), meta.date = its date, valid_until = "Geçerlilik" / validity.',
    'doc_fx_rate = an exchange rate printed on the document (e.g. "USD Satış Kuru : 49,2540 TL" → 49.254, doc_fx_cur "USD"); doc_try_total = a printed TL equivalent',
    '("Bugünkü Fatura Tutarı : 1.112.352,336 TL" → 1112352.336).',
    'The image may be only a CROP of a table (a screenshot of some product rows, maybe without the header row, document header or totals): still return every',
    'product row you can see in items (seller / buyer / meta / totals empty when not visible). status = stock / delivery status column ("1 Ready", "2 WEEK", "Stokta").',
    'cargo = shipping company name if printed. campaign = "Kampanya Kodu" value. issue_time = "Oluşma Zamanı" (HH:MM:SS).'
  ].join('\n');
  function b64(buf) {
    var u = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
    return btoa(s);
  }
  function parseJson(text) {
    var t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    var i = t.indexOf('{'), j = t.lastIndexOf('}');
    return JSON.parse(i >= 0 ? t.slice(i, j + 1) : t);
  }
  // v1.61.5: gerçek denemede 28 kalemli 2 sayfalık fatura gemini-3.8-flash ile ~2,5 dk sürdü → istek başına 4 dk
  var AI_TIMEOUT = 240000;
  function viaAi(buf, opts) {
    return Promise.all([setting('ai_gemini_key'), setting('ai_mode')]).then(function (r) {
      var key = r[0].trim();
      if (!key || r[1] === 'local') { var e = new Error('no-ai'); e.skip = true; throw e; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { var e2 = new Error('offline'); e2.net = true; throw e2; }
      var body = {
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: opts && opts.mime || 'application/pdf', data: b64(buf) } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' }
      };
      return models(key).then(function (list) {
        var i = 0, lastErr = null, quota = false, slow = 0;
        var next = function () {
          if (i >= list.length || slow >= 2) { var x = lastErr || new Error('ai-failed'); if (quota && !x.timeout) x.quota = true; throw x; }
          var m = list[i++];
          if (opts && opts.onModel) try { opts.onModel(m); } catch (e) {}
          return http(API + 'models/' + encodeURIComponent(m) + ':generateContent', body, key, AI_TIMEOUT).then(function (res) {
            if (res.status === 401 || res.status === 403) { var e = new Error('ai-key'); e.key = true; throw e; }
            if (res.status === 429) quota = true;
            if (res.status !== 200) { lastErr = new Error('ai-' + res.status); return next(); }
            var parts = res.data && res.data.candidates && res.data.candidates[0] && res.data.candidates[0].content && res.data.candidates[0].content.parts || [];
            var txt = parts.map(function (p) { return p.text || ''; }).join('');
            var o;
            try { o = parseJson(txt); } catch (e) { lastErr = e; return next(); }
            o.source = 'ai'; o.model = m;
            return o;
          }, function (e) {
            // büyük model zamanında cevap vermediyse daha hızlı modele geçilir; gerçek bağlantı hatası hemen çevrimdışına düşer
            if (e && e.timeout) { slow++; lastErr = e; return next(); }
            throw e;
          });
        };
        return next();
      });
    });
  }
  // v1.65: genel amaçlı JSON isteği (dekont okuma vb.): parts = Gemini içerik parçaları (inline_data / text). Dönüş: { data, model }
  function gemini(parts, opts) {
    opts = opts || {};
    return Promise.all([setting('ai_gemini_key'), setting('ai_mode')]).then(function (r) {
      var key = r[0].trim();
      if (!key || r[1] === 'local') { var e = new Error('no-ai'); e.skip = true; throw e; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { var e2 = new Error('offline'); e2.net = true; throw e2; }
      var body = { contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
      return models(key).then(function (list) {
        var i = 0, lastErr = null, quota = false, slow = 0;
        var next = function () {
          if (i >= list.length || slow >= 2) { var x = lastErr || new Error('ai-failed'); if (quota && !x.timeout) x.quota = true; throw x; }
          var m = list[i++];
          if (opts.onModel) try { opts.onModel(m); } catch (e) {}
          return http(API + 'models/' + encodeURIComponent(m) + ':generateContent', body, key, opts.timeout || 120000).then(function (res) {
            if (res.status === 401 || res.status === 403) { var e = new Error('ai-key'); e.key = true; throw e; }
            if (res.status === 429) quota = true;
            if (res.status !== 200) { lastErr = new Error('ai-' + res.status); return next(); }
            var ps = res.data && res.data.candidates && res.data.candidates[0] && res.data.candidates[0].content && res.data.candidates[0].content.parts || [];
            var o;
            try { o = parseJson(ps.map(function (p) { return p.text || ''; }).join('')); } catch (e) { lastErr = e; return next(); }
            return { data: o, model: m };
          }, function (e) { if (e && e.timeout) { slow++; lastErr = e; return next(); } throw e; });
        };
        return next();
      });
    });
  }
  // v1.65: PDF sayfasını resme çevirir (taranmış dekontun çevrimdışı okunması / ek olarak saklanması). Dönüş: canvas
  function renderPage(buf, pageNo, scale) {
    return pdfjs().then(function (lib) {
      return lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, useSystemFonts: true }).promise;
    }).then(function (doc) {
      return doc.getPage(Math.min(pageNo || 1, doc.numPages)).then(function (pg) {
        var vp = pg.getViewport({ scale: scale || 2 });
        var cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        return pg.render({ canvasContext: cx, viewport: vp }).promise.then(function () { try { doc.destroy(); } catch (e) {} return cv; });
      });
    });
  }
  // v1.63: fatura çıktısında ürün adlarını seçilen dile çevirir (kullanıcının kendi Gemini anahtarı). Dönüş: aynı sırada dizi.
  // v1.69: Gemini yoksa / çevrimdışıysa masaüstündeki yerel zekâ (TranslateGemma / NLLB) — olmazsa çağıran TERMS sözlüğüne düşer
  function translate(list, lg) {
    return translateAi(list, lg).catch(function (err) {
      var Y = root.FCYZ;
      if (!Y || !Y.available() || !list || !list.length) throw err;
      return Y.ready('mt').then(function (ok) {
        if (!ok) throw err;
        var out = [], i = 0;
        var step = function () {
          if (i >= list.length) return out;
          var s = String(list[i++] || '');
          return (s.trim() ? Y.translate(s, 'auto', lg).then(function (r) { return r && r.text ? String(r.text).trim() : s; }, function () { return s; }) : Promise.resolve(s)).then(function (t) { out.push(t); return step(); });
        };
        return step();
      });
    });
  }
  function translateAi(list, lg) {
    var LN = { en: 'English', ar: 'Arabic (Modern Standard, as used on official commercial invoices)', tr: 'Turkish' }[lg];
    if (!LN || !list || !list.length) return Promise.resolve(list || []);
    return Promise.all([setting('ai_gemini_key'), setting('ai_mode')]).then(function (r) {
      var key = r[0].trim();
      if (!key || r[1] === 'local') { var e = new Error('no-ai'); e.skip = true; throw e; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { var e2 = new Error('offline'); e2.net = true; throw e2; }
      var prompt = ['Translate each product / service name from a commercial invoice into ' + LN + '.',
        'Rules: use the standard formal technical terminology of the electrical, electronics, automotive, aviation and machine-tool / tooling industries (ISO and manufacturer catalogue language, not everyday language).',
        'Machine-tool terms (Turkish → English): döner punta = Live Center; takma uçlu = with Interchangeable Tips; punta ucu = Center Tip; gövde = Body; anahtar (ANHT.) = Wrench; dış çap tutucu = OD Turning Tool Holder; iç çap tutucu = ID Boring Tool Holder; delik kater = Boring Bar; delik kater soketi / kovanı = Boring Bar Sleeve; DKT = Boring Bar Holder; UDT = U-Drill Holder; pens = Collet; mandren / ayna = Chuck; kılavuz = Tap; kısa = Short. In Arabic use the equivalent formal Modern Standard Arabic technical terms (e.g. ذنبة دوّارة, حامل قضيب التجويف, جلبة قضيب التجويف).',
        'Expand Turkish abbreviations into full terms (e.g. "TAK.UC" = takma uçlu, "4UC" = 4 tips, "ANHT." = wrench). Keep Morse-taper codes such as "MK5" exactly as written (the app converts them itself).',
        'Keep model numbers, part numbers, codes, brand names, sizes, voltages, currents and units (e.g. "LP-12-C04PE-02-001", "GX-16", "SE2600M", "BMT55", "CUTEX-160A-B/MC_BMT55", "Ø40 H60", "D40 d12", "19mm", "6-36V", "200A", "2NO+2NC", "PNP", "NC") exactly as written.',
        'Do not add or drop information. Return ONLY a JSON array of strings, same length and order as the input.',
        'Input:', JSON.stringify(list)].join('\n');
      var body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
      // en güçlü model önce (kullanıcı kuralı); gecikirse arayüz çevrimdışı çeviriyle devam eder, bu çeviri gelince önizleme güncellenir
      return models(key).then(function (ms) {
        var i = 0, last = null;
        var next = function () {
          if (i >= ms.length) throw last || new Error('ai-failed');
          var m = ms[i++];
          return http(API + 'models/' + encodeURIComponent(m) + ':generateContent', body, key, 120000).then(function (res) {
            if (res.status === 401 || res.status === 403) { var e = new Error('ai-key'); e.key = true; throw e; }
            if (res.status !== 200) { last = new Error('ai-' + res.status); return next(); }
            var parts = res.data && res.data.candidates && res.data.candidates[0] && res.data.candidates[0].content && res.data.candidates[0].content.parts || [];
            var txt = parts.map(function (p) { return p.text || ''; }).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
            var a; try { a = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1)); } catch (e) { last = e; return next(); }
            if (!Array.isArray(a) || a.length !== list.length) { last = new Error('ai-shape'); return next(); }
            return a.map(function (x) { return String(x == null ? '' : x); });
          }, function (e) { if (e && e.timeout) { last = e; return next(); } throw e; });
        };
        return next();
      });
    });
  }
  // Yapay zeka çıktısı da çevrimdışı çıktı da aynı biçime getirilir
  function normalize(o) {
    o = o || {};
    var P = function (p) {
      p = p || {}; var r = {};
      ['name', 'address', 'district', 'city', 'postal_code', 'country', 'phone', 'fax', 'email', 'web', 'tax_office', 'tax_no', 'mersis', 'trade_reg', 'contact'].forEach(function (k) { r[k] = clean(p[k] == null ? '' : p[k]); });
      r.tax_no = r.tax_no.replace(/\D/g, '');
      // yapay zeka unvanın sonundaki hitabı ("… ŞİRKETİ SN.", "SAYIN") da alabiliyor
      r.name = r.name.replace(/\s+(sn\.?|sayın|sayin)$/i, '');
      return r;
    };
    var meta = {};
    Object.keys(o.meta || {}).forEach(function (k) { var v = clean(o.meta[k] == null ? '' : o.meta[k]); if (v) meta[k] = v; });
    if (meta.date) meta.date = isoDate(meta.date) || meta.date;
    var items = (Array.isArray(o.items) ? o.items : []).map(function (it) {
      var n = function (v) { return v == null || v === '' ? null : num(v); };
      var o = { name: clean(it.name), code: clean(it.code || ''), depot: clean(it.depot || ''), qty: n(it.qty), unit: clean(it.unit || ''), price: n(it.price),
        amount: n(it.amount), vat: n(it.vat), vat_amount: n(it.vat_amount), disc_rate: n(it.disc_rate), disc_amount: n(it.disc_amount) };
      // v1.71: ek alanlar yalnız varsa (liste fiyatı, Model / P/N / S/N)
      if (n(it.list_price) > 0) o.list_price = n(it.list_price);
      if (clean(it.status || '')) o.status = clean(it.status);
      ['model', 'part_no', 'serial'].forEach(function (k) { if (clean(it[k] || '')) o[k] = clean(it[k]); });
      // v1.71: adın içindeki Model / P/N / S/N ayrı alanlara da yazılır (ad değişmez)
      var mo = /\bmodel\s*(no)?\s*[:：]\s*([A-Z0-9][\w\-.\/]+)/i.exec(o.name); if (mo && !o.model) o.model = mo[2].replace(/[,.]$/, '');
      var pn = /\b(?:[A-Za-z]+\s+)?(?:p\/n|pn|part\s*(?:no|number)|parça\s*no)\s*[:：]\s*([A-Z0-9][\w\-.]+)/i.exec(o.name); if (pn && !o.part_no) o.part_no = pn[1];
      var sn = /\b(?:s\/n|sn|serial\s*(?:no|number)?|seri\s*no)\s*[:：]\s*([A-Z0-9][\w\-.]+)/i.exec(o.name); if (sn && !o.serial) o.serial = sn[1];
      return o;
    }).filter(function (it) { return it.name; });
    // v1.75: miktar / fiyat akla yatkın olmalı (OCR'dan gelen eksi işareti, sıfır miktar)
    items.forEach(function (it) {
      if (it.qty != null && !(it.qty > 0)) it.qty = it.qty < 0 ? -it.qty : null;
      if (it.price != null && it.price < 0 && !(it.amount != null && it.amount < 0)) it.price = -it.price;
    });
    var t = o.totals || {};
    fixVat(items, { subtotal: num(t.subtotal), discount: num(t.discount), vat: num(t.vat) });
    var cur = String(o.currency || '').toUpperCase(); cur = cur === 'TL' ? 'TRY' : curOf(cur) || cur;
    return { source: o.source || 'offline', model: o.model || '', parser: o.parser || '', seller: P(o.seller), buyer: P(o.buyer), meta: meta, items: items,
      totals: { subtotal: num(t.subtotal), discount: num(t.discount), vat: num(t.vat), total: num(t.total), payable: num(t.payable) }, currency: cur, warnings: o.warnings || [] };
  }
  function toBuf(f) {
    if (f instanceof ArrayBuffer) return Promise.resolve(f);
    if (f && f.buffer instanceof ArrayBuffer) return Promise.resolve(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength));
    if (f && f.arrayBuffer) return f.arrayBuffer();
    return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = no; r.readAsArrayBuffer(f); });
  }
  // ---------- teyit: yapay zeka okuması ↔ çevrimdışı okuma (v1.61.2) ----------
  // Çevrimdışı okuma PDF'teki yazıyı olduğu gibi alır (rakamlarda tahmin yok); yapay zeka okumasını onunla karşılaştırırız.
  function near(a, b) { return Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.0005); }
  function itemsSum(x) { return x.items.reduce(function (a, i) { return a + (i.amount != null ? i.amount : (i.qty || 0) * (i.price || 0)); }, 0); }
  // kendi içinde tutarlı mı: kalemler toplamı = ara toplam (ya da ara toplam − iskonto); ara toplam − iskonto + KDV = genel toplam
  function selfCheck(x) {
    if (!x || !x.items.length) return false;
    var t = x.totals || {}, s = itemsSum(x), ok = null;
    if (t.subtotal != null) ok = near(s, t.subtotal) || (t.discount != null && near(s, t.subtotal - t.discount));
    if (ok !== false && t.subtotal != null && t.vat != null && t.total != null) ok = near(t.subtotal - (t.discount || 0) + t.vat, t.total) || near(t.subtotal + t.vat, t.total);
    return ok;
  }
  var normS = function (v) { return String(v == null ? '' : v).replace(/\s+/g, '').toLocaleUpperCase('tr'); };
  function compare(a, b) {
    var d = [];
    var numD = function (f, i, k, x, y) { if (x != null && y != null && !near(x, y)) d.push({ f: f, i: i, k: k, a: x, b: y }); };
    var strD = function (f, k, x, y) { if (normS(x) && normS(y) && normS(x) !== normS(y)) d.push({ f: f, k: k, a: x, b: y }); };
    if (a.items.length !== b.items.length) d.push({ f: 'count', k: 'count', a: a.items.length, b: b.items.length });
    for (var i = 0; i < Math.min(a.items.length, b.items.length); i++) {
      var p = a.items[i], q = b.items[i];
      ['qty', 'amount', 'vat'].forEach(function (k) { numD('item', i, k, p[k], q[k]); });
      // birim fiyat: satır iskontosu varsa ikisi farklı yorumlanabilir — tutar zaten karşılaştırılıyor
      if (!(p.disc_amount || p.disc_rate || q.disc_amount || q.disc_rate)) numD('item', i, 'price', p.price, q.price);
      if (normS(p.code) && normS(q.code) && normS(p.code) !== normS(q.code)) d.push({ f: 'item', i: i, k: 'code', a: p.code, b: q.code });
    }
    ['subtotal', 'discount', 'vat', 'total', 'payable'].forEach(function (k) { numD('total', null, k, a.totals[k], b.totals[k]); });
    ['number', 'date', 'ettn'].forEach(function (k) { strD('meta', k, a.meta[k], b.meta[k]); });
    strD('buyer', 'tax_no', a.buyer.tax_no, b.buyer.tax_no);
    strD('seller', 'tax_no', a.seller.tax_no, b.seller.tax_no);
    return d;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  // ai: yapay zeka sonucu, off: çevrimdışı sonuç (ya da null). Dönüş: kullanılacak sonuç + check { status, diffs, okAi, okOff } + alt (diğer okuma)
  function verify(ai, off) {
    var usable = off && (off.items.length || off.totals.total != null || off.totals.payable != null);
    if (!usable) { ai.check = { status: 'none', why: off && off.warnings.indexOf('scanned') >= 0 ? 'scanned' : 'unreadable', diffs: [] }; return ai; }
    var diffs = compare(ai, off), okAi = selfCheck(ai), okOff = selfCheck(off);
    if (!diffs.length) { ai.check = { status: 'match', diffs: [], okAi: okAi, okOff: okOff }; ai.alt = off; return ai; }
    var res;
    if (okOff === true && ai.items.length === off.items.length) {
      // aynı satırlar: metinler yapay zekadan, rakamlar PDF'in kendi yazısından
      res = clone(ai);
      res.items.forEach(function (it, i) {
        var o = off.items[i];
        ['qty', 'price', 'amount', 'vat', 'vat_amount', 'disc_rate', 'disc_amount'].forEach(function (k) { if (o[k] != null) it[k] = o[k]; });
        if (o.code) it.code = o.code;
        if (!it.unit && o.unit) it.unit = o.unit;
      });
      ['subtotal', 'discount', 'vat', 'total', 'payable'].forEach(function (k) { if (off.totals[k] != null) res.totals[k] = off.totals[k]; });
      ['number', 'date', 'ettn'].forEach(function (k) { if (off.meta[k]) res.meta[k] = off.meta[k]; });
      ['buyer', 'seller'].forEach(function (s) { if (off[s].tax_no) res[s].tax_no = off[s].tax_no; });
      res.check = { status: 'fixed', diffs: diffs, okAi: okAi, okOff: okOff };
      res.alt = ai;
      return res;
    }
    if (okOff === true && okAi !== true) {
      // satır sayısı bile farklı ve yalnız çevrimdışı okuma tutarlı: çevrimdışı sonuç kullanılır, yapay zeka okuması yedekte
      res = clone(off); res.source = 'offline'; res.model = ai.model; res.verifiedBy = 'ai';
      res.check = { status: 'fixed', whole: true, diffs: diffs, okAi: okAi, okOff: okOff };
      res.alt = ai;
      return res;
    }
    ai.check = { status: 'diff', diffs: diffs, okAi: okAi, okOff: okOff };
    ai.alt = off;
    return ai;
  }
  function reason(e) {
    if (!e) return '';
    if (e.cancel) return 'cancel';
    if (e.skip) return 'skip';
    if (e.key) return 'key';
    if (e.timeout) return 'timeout';
    if (e.quota) return 'quota';
    if (e.net) return 'net';
    if (e.empty) return 'empty';
    return 'fail';
  }
  // v1.71: dosya türü baytlardan (PDF / JPEG / PNG / WEBP)
  function kindOf(buf) {
    var u = new Uint8Array(buf.slice(0, 12));
    if (u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) return 'pdf';
    if (u[0] === 0xff && u[1] === 0xd8) return 'jpeg';
    if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return 'png';
    if (u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45) return 'webp';
    return '';
  }
  var D = function () { return root.FalconDekont || null; };
  // Resim → canvas (yapay zekaya gidecek JPEG de: çok büyükse küçültülür)
  function imageCanvas(buf, kind) {
    var X = D(); if (!X) return Promise.reject(new Error('ocr-reader'));
    return X.loadImg(buf, kind === 'png' ? 'image/png' : kind === 'webp' ? 'image/webp' : 'image/jpeg').then(function (im) { return X.toCanvas(im, 4000); });
  }
  // OCR ile konumlu sayfa(lar) → en iyi ayrıştırma; tutarsızsa (kalem toplamı ≠ ara toplam) Tesseract ikinci ayarla bir kez daha
  function ocrRead(canvases, step) {
    var X = D(); if (!X || !X.docOcr) return Promise.reject(new Error('ocr-reader'));
    var run = function (o) {
      var pages = [], i = 0, via = '';
      var next = function () {
        if (i >= canvases.length) return pages;
        return X.docOcr(canvases[i++], o).then(function (pg) { via = pg.via; pages.push({ width: pg.width, height: pg.height, items: pg.items }); return next(); });
      };
      return Promise.resolve(next()).then(function () { var r = parseBest(pages); if (r) { r.ocr = via; } return r; });
    };
    // v1.74: puan = kendi içinde tutarlı satırlar (miktar × fiyat = tutar) + kalem sayısı + dolu alanlar; toplamlar tutuyorsa en üstte
    var score = function (x) {
      if (!x) return -1;
      var ok = 0, filled = 0;
      x.items.forEach(function (it) {
        if (it.qty != null && it.price != null && it.amount != null && Math.abs(it.qty * it.price - it.amount) <= Math.max(0.02, Math.abs(it.amount) * 0.003) && (it.qty >= 1 || /kg|lt|m\b|metre|ton/i.test(it.unit || ''))) ok++;
        ['qty', 'price', 'amount', 'code'].forEach(function (k) { if (it[k] != null && it[k] !== '') filled++; });
      });
      return (selfCheck(x) === true ? 1000 : 0) + ok * 20 + x.items.length * 5 + filled + (x.totals.total != null ? 2 : 0) + (x.meta.number ? 1 : 0);
    };
    var full = function (x) { return x && x.items.length && x.items.every(function (it) { return it.qty != null && it.price != null && it.amount != null && Math.abs(it.qty * it.price - it.amount) <= Math.max(0.02, Math.abs(it.amount) * 0.003); }); };
    step('ocr');
    // temiz görüntü (ekran görüntüsü, PDF sayfası) önce yumuşak gri tonla, fotoğraf önce uyarlamalı eşikle; sonra öteki ayar ve gerekirse
    // daha büyük ölçekle bir daha — en tutarlı sonuç seçilir (küçük yazılı ekran görüntülerinde ondalık noktaları ayarlar arasında değişiyor)
    var clean0 = false; try { clean0 = X.docClean && X.docClean(canvases[0]) > 0.55; } catch (e) {}
    var first = clean0 ? 'soft' : 'lat', second = clean0 ? 'lat' : 'soft';
    var best = null, keep = function (r) { if (score(r) > score(best)) best = r; return r; };
    // 1) ilk ayar toplamları tutturursa hemen kabul (önceki sürümlerle aynı); 2) öteki ayar; 3) renkli başlık bantları ters çevrilerek (turuncu /
    // lacivert başlıklı ekran görüntüleri); 4) aynısı daha büyük ölçekle — en tutarlı sonuç seçilir
    var good = function () { return best && (selfCheck(best) === true || full(best)); };
    return run({ mode: first }).then(keep).then(function (a) {
      if (a && selfCheck(a) === true) return a;
      step('ocr2');
      return run({ mode: second, tess: true }).then(keep, function () {}).then(function () {
        var bands = false; try { bands = !!(X.hasBands && X.hasBands(canvases[0])); } catch (e) {}
        if (good() || !bands) return best;
        return run({ mode: 'lat', tess: true, band: true }).then(keep, function () {}).then(function () {
          if (good()) return best;
          return run({ mode: 'lat', tess: true, band: true, min: 3400 }).then(keep, function () {}).then(function () { return best; });
        });
      });
    });
  }
  // opts: { ai: true|false, onStep(step, model), ctl: {} → ctl.skipAi() yapay zekayı beklemeden çevrimdışı sonucu verir }
  // Çevrimdışı okuma her zaman yapılır (yapay zeka ile aynı anda): yapay zeka okursa onu teyit eder, okuyamazsa sonuç odur.
  // v1.71: JPEG / PNG / WEBP (ekran fotoğrafı, taranmış belge) ve metni olmayan PDF'ler OCR ile; teklif mektubu / yabancı fatura düzeni (parseGeneric)
  function read(file, opts) {
    opts = opts || {};
    var step = function (s, m) { if (opts.onStep) try { opts.onStep(s, m); } catch (e) {} };
    return toBuf(file).then(function (buf) {
      var kind = kindOf(buf) || (/\.pdf$/i.test(file && file.name || '') ? 'pdf' : 'jpeg');
      var isImg = kind !== 'pdf';
      var aiBufP = Promise.resolve({ buf: buf, mime: 'application/pdf' });
      var offP;
      if (isImg) {
        var cvP = imageCanvas(buf, kind);
        aiBufP = buf.byteLength < 6 * 1024 * 1024 ? Promise.resolve({ buf: buf, mime: 'image/' + kind }) : cvP.then(function (cv) {
          return D().canvasBytes(D().toCanvas(cv, 3000), 'image/jpeg', 0.9).then(function (u) { return { buf: u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength), mime: 'image/jpeg' }; });
        });
        offP = cvP.then(function (cv) { return ocrRead([cv], step); }).then(function (r) {
          if (!r) return null;
          if (!r.items.length && !r.buyer.name) r.warnings.push('unreadable');
          return r;
        }).catch(function () { return null; });
      } else {
        var pagesP = extract(buf).catch(function () { return null; });
        offP = pagesP.then(function (pages) {
          if (!pages) return null;
          var txt = pages.reduce(function (n, p) { return n + p.items.length; }, 0);
          if (txt < 8) {
            // taranmış PDF: sayfalar resme çevrilip OCR (en çok 4 sayfa)
            var n = Math.min(pages.length || 1, 4), cvs = [], k = 0;
            var rp = function () { if (k >= n) return Promise.resolve(cvs); return renderPage(buf, ++k, 4.2).then(function (cv) { cvs.push(cv); return rp(); }); };
            return rp().then(function (c) { return ocrRead(c, step); }).then(function (r) { if (r) { r.scanned = true; if (!r.items.length && !r.buyer.name) r.warnings.push('scanned'); } return r; }, function () {
              var e = normalize({ warnings: ['scanned'] }); return e;
            });
          }
          var r = parseBest(pages);
          if (!r.items.length && !r.buyer.name) r.warnings.push('unreadable');
          return r;
        }).catch(function () { return null; });
      }
      var fin = function (r) { if (r) { r.kind = isImg ? 'image' : 'pdf'; } return r; };
      var offline = function (why) {
        step('offline');
        return offP.then(function (r) {
          if (!r) throw new Error(isImg ? 'image-unreadable' : 'pdf-unreadable');
          r.aiError = reason(why);
          if (why && why.message && !/^(no-ai|offline|ai-key)$/.test(why.message)) r.aiDetail = String(why.message).slice(0, 120);
          return fin(r);
        });
      };
      if (opts.ai === false) return offline(null);
      step('ai');
      var aiP = aiBufP.then(function (x) { return viaAi(x.buf, { mime: x.mime, onModel: function (m) { step('ai', m); } }); });
      if (opts.ctl) aiP = Promise.race([aiP, new Promise(function (_ok, no) { opts.ctl.skipAi = function () { var e = new Error('cancel'); e.cancel = true; no(e); }; })]);
      return aiP.then(function (o) {
        var r = normalize(o);
        if (o && o.doc_type && !r.meta.doc_kind) r.meta.doc_kind = String(o.doc_type);
        if (!r.items.length && !r.buyer.name) { var e = new Error('ai-empty'); e.empty = true; return offline(e); }
        step('verify');
        return offP.then(function (off) { return fin(verify(r, off)); });
      }, offline);
    });
  }

  // v1.74: çoklu belge (ör. 3 sayfalık teklifin ayrı ayrı ekran görüntüleri / PDF'leri) sırayla okunup tek belgede birleştirilir:
  // kalemler sırayla eklenir (üst üste binen ekran görüntülerinde sınırdaki tekrar eden kalemler atılır), taraflar / belge bilgisi ilk dolu
  // olandan, toplamlar son dolu olandan (son sayfa) alınır.
  function readMany(files, opts) {
    opts = opts || {};
    files = Array.prototype.slice.call(files || []);
    if (files.length === 1) return read(files[0], opts);
    var res = [], i = 0;
    var step = function (s, m) { if (opts.onStep) try { opts.onStep(s, m, { i: i, n: files.length }); } catch (e) {} };
    var next = function () {
      if (i >= files.length) return Promise.resolve();
      var f = files[i];
      return read(f, Object.assign({}, opts, { onStep: step })).then(function (r) { res.push(r); }, function (e) { res.push(null); if (opts.onPageError) opts.onPageError(i, e); }).then(function () { i++; return next(); });
    };
    return next().then(function () {
      var ok = res.filter(Boolean); if (!ok.length) throw new Error('unreadable');
      var key = function (it) { return [String(it.code || '').replace(/\s/g, '').toUpperCase(), String(it.name || '').replace(/\s/g, '').toUpperCase().slice(0, 40), it.qty, it.amount].join('|'); };
      var out = normalize({ items: [] }), items = [], first = function (f) { for (var k = 0; k < ok.length; k++) { var v = f(ok[k]); if (v) return v; } return null; };
      ok.forEach(function (r) {
        var its = r.items.slice();
        // sınırda üst üste binen satırlar (önceki parçanın son satırları = bu parçanın ilk satırları)
        for (var n = Math.min(its.length, items.length, 6); n > 0; n--) {
          var a = items.slice(-n).map(key).join('#'), b = its.slice(0, n).map(key).join('#');
          if (a === b) { its = its.slice(n); break; }
        }
        items = items.concat(its);
      });
      out.items = items;
      ['seller', 'buyer'].forEach(function (k) { out[k] = first(function (r) { return r[k] && (r[k].name || r[k].tax_no) ? r[k] : null; }) || ok[0][k]; });
      ok.forEach(function (r) { Object.keys(r.meta || {}).forEach(function (k) { if (out.meta[k] == null && r.meta[k]) out.meta[k] = r.meta[k]; }); });
      for (var t = ok.length - 1; t >= 0; t--) { var tt = ok[t].totals || {}; if (['subtotal', 'vat', 'total', 'payable'].some(function (k) { return tt[k] != null; })) { out.totals = tt; break; } }
      out.currency = first(function (r) { return r.currency; }) || '';
      out.source = ok.every(function (r) { return r.source === 'ai'; }) ? 'ai' : ok.some(function (r) { return r.source === 'ai'; }) ? 'mixed' : 'offline';
      out.model = first(function (r) { return r.model; }) || '';
      out.parser = first(function (r) { return r.parser; }) || '';
      out.warnings = [].concat.apply([], ok.map(function (r) { return r.warnings || []; })).filter(function (w, k, a) { return a.indexOf(w) === k; });
      out.aiError = first(function (r) { return r.aiError; }) || null;
      out.kind = 'many'; out.parts = res.map(function (r) { return r ? { n: r.items.length, source: r.source } : null; });
      if (ok.some(function (r) { return r.ocr; })) out.ocr = first(function (r) { return r.ocr; });
      return out;
    });
  }

  var api = { _g: { linesOf: linesOf, gHeaderAt: gHeaderAt, gGroups: gGroups, gKey: gKey, headPart: headPart }, gemini: gemini, renderPage: renderPage, b64: b64, translate: translate, read: read, readMany: readMany, kindOf: kindOf, parseLayout: parseLayout, parseGeneric: parseGeneric, parseBest: parseBest, normalize: normalize, verify: verify, compare: compare, selfCheck: selfCheck, rankModels: rankModels, num: num, rateNum: rateNum, fixVat: fixVat, isoDate: isoDate, extract: extract, version: '1.76.0' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FalconFaturaPdf = api;
})(typeof window !== 'undefined' ? window : globalThis);
