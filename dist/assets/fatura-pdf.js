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
    it.vat = num(o.vat); it.disc_rate = num(o.disc_rate); it.disc_amount = num(o.disc_amount);
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
    'You read a Turkish e-Fatura / e-Arşiv (or any) invoice PDF and return ONLY JSON, no prose.',
    'Keep every text exactly as printed (Turkish letters, upper/lower case). Numbers as plain JSON numbers with "." decimals (1.785,00 → 1785).',
    'Dates as YYYY-MM-DD. Leave unknown fields as empty string or null. Do not invent values.',
    'Schema:',
    '{"seller":{"name":"","address":"","district":"","city":"","postal_code":"","phone":"","fax":"","email":"","web":"","tax_office":"","tax_no":"","mersis":"","trade_reg":""},',
    ' "buyer":{ same keys as seller } (buyer = the "SAYIN" / bill-to party),',
    ' "meta":{"date":"","number":"","ettn":"","scenario":"","inv_type":"","customization":"","issue_time":"","campaign":"","cargo":"","order_no":"","order_date":"","waybill_no":"","waybill_date":"","due_date":""},',
    ' "currency":"TRY|USD|EUR|SYP",',
    ' "items":[{"no":1,"depot":"","code":"","name":"","qty":0,"unit":"","price":0,"disc_rate":null,"disc_amount":null,"amount":0,"vat":20,"vat_amount":0}],',
    ' "totals":{"subtotal":0,"discount":0,"vat":0,"total":0,"payable":0}}',
    'items: one entry per invoice line in order. name = the full "Mal Hizmet" text joined into one line. code = "Stok Kodu". depot = "Depo".',
    'qty = number only, unit = the unit word (Adet, Kg, Metre…). price = unit price excluding VAT. vat = VAT percent (20 for %20,00).',
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
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'application/pdf', data: b64(buf) } }, { text: PROMPT }] }],
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
  // Yapay zeka çıktısı da çevrimdışı çıktı da aynı biçime getirilir
  function normalize(o) {
    o = o || {};
    var P = function (p) {
      p = p || {}; var r = {};
      ['name', 'address', 'district', 'city', 'postal_code', 'country', 'phone', 'fax', 'email', 'web', 'tax_office', 'tax_no', 'mersis', 'trade_reg'].forEach(function (k) { r[k] = clean(p[k] == null ? '' : p[k]); });
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
      return { name: clean(it.name), code: clean(it.code || ''), depot: clean(it.depot || ''), qty: n(it.qty), unit: clean(it.unit || ''), price: n(it.price),
        amount: n(it.amount), vat: n(it.vat), vat_amount: n(it.vat_amount), disc_rate: n(it.disc_rate), disc_amount: n(it.disc_amount) };
    }).filter(function (it) { return it.name; });
    var t = o.totals || {};
    var cur = String(o.currency || '').toUpperCase(); cur = cur === 'TL' ? 'TRY' : curOf(cur) || cur;
    return { source: o.source || 'offline', model: o.model || '', seller: P(o.seller), buyer: P(o.buyer), meta: meta, items: items,
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
  // opts: { ai: true|false, onStep(step, model), ctl: {} → ctl.skipAi() yapay zekayı beklemeden çevrimdışı sonucu verir }
  // Çevrimdışı okuma her zaman yapılır (yapay zeka ile aynı anda): yapay zeka okursa onu teyit eder, okuyamazsa sonuç odur.
  function read(file, opts) {
    opts = opts || {};
    var step = function (s, m) { if (opts.onStep) try { opts.onStep(s, m); } catch (e) {} };
    return toBuf(file).then(function (buf) {
      var pagesP = extract(buf).catch(function () { return null; });
      var offP = pagesP.then(function (pages) {
        if (!pages) return null;
        var r = normalize(parseLayout(pages));
        if (!r.items.length && !r.buyer.name) {
          var txt = pages.reduce(function (n, p) { return n + p.items.length; }, 0);
          r.warnings.push(txt ? 'unreadable' : 'scanned');
        }
        return r;
      }).catch(function () { return null; });
      var offline = function (why) {
        step('offline');
        return offP.then(function (r) {
          if (!r) throw new Error('pdf-unreadable');
          r.aiError = reason(why);
          if (why && why.message && !/^(no-ai|offline|ai-key)$/.test(why.message)) r.aiDetail = String(why.message).slice(0, 120);
          return r;
        });
      };
      if (opts.ai === false) return offline(null);
      step('ai');
      var aiP = viaAi(buf, { onModel: function (m) { step('ai', m); } });
      if (opts.ctl) aiP = Promise.race([aiP, new Promise(function (_ok, no) { opts.ctl.skipAi = function () { var e = new Error('cancel'); e.cancel = true; no(e); }; })]);
      return aiP.then(function (o) {
        var r = normalize(o);
        if (!r.items.length && !r.buyer.name) { var e = new Error('ai-empty'); e.empty = true; return offline(e); }
        step('verify');
        return offP.then(function (off) { return verify(r, off); });
      }, offline);
    });
  }

  var api = { read: read, parseLayout: parseLayout, normalize: normalize, verify: verify, compare: compare, selfCheck: selfCheck, rankModels: rankModels, num: num, extract: extract, version: '1.61.5' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FalconFaturaPdf = api;
})(typeof window !== 'undefined' ? window : globalThis);
