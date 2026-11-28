// Falcon Ofis çevrimdışı teknik çeviri motoru (Türkçe → İngilizce / Arapça). Derleyici (araclar/sozluk-derle.js) bu dosyayı sözlükle
// birlikte dist/assets/sozluk-falcon.js içine gömer: window.FalconSozluk = { translate(text, lg) → { text, hit, left }, size, version }.
// Yöntem: en uzun çok kelimeli eşleşme → Türkçe ek çözümleme (çoğul, iyelik, hâl, -lı/-sız, ünsüz yumuşaması) → şapkasız / büyük harf
// yazım → «-lı» türevlerinin İngilizce sıralaması («Kapaklı Kutu» → «Box with Cover», «24 Portlu» → «24-Port») → sayı + birim.
/* global LEX_DATA */
(function () {
  'use strict';
  var LEX = Object.create(null), FOLD = Object.create(null), MAXW = 1;
  var TRCH = /[çğıöşüÇĞİÖŞÜâîûÂÎÛ]/;
  var fold = function (s) { return s.replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[âà]/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u'); };
  var lower = function (s) { var l = s.toLocaleLowerCase('tr'); return l.length === s.length ? l : s.toLowerCase(); };
  // v1.77: İngilizce → Arapça ters dizin (İngilizce yazılmış ürün adlarının Arapçası için; «with …» kalıpları hariç)
  var ENLEX = Object.create(null), MAXE = 1;
  var enKey = function (s) { return String(s).toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim(); };
  LEX_DATA.forEach(function (r) {
    var k = r[0]; LEX[k] = [r[1], r[2]];
    if (!/^(with|without|for|and|or)\b/i.test(r[1]) && /[a-z]/i.test(r[1]) && r[1] !== r[2]) { var ek = enKey(r[1]); ENLEX[ek] = r[2]; var ne = ek.split(' ').length; if (ne > MAXE) MAXE = ne; }
    var n = k.split(' ').length; if (n > MAXW) MAXW = n;
    var f = fold(k); if (f !== k) { if (FOLD[f] == null) FOLD[f] = k; else if (FOLD[f] !== k) FOLD[f] = ''; }
  });
  // İngilizcede de anlamı olan kısa Türkçe anahtarlar: yalnız adda başka kesin Türkçe kelime varsa çevrilir («Solder Tip» değişmez).
  var AMB = {}; 'top ray far boy sol alt tip mil te pens mat ek ara pres kat pul sap hat no cam tel tek fare sac bant lama ince pasta set kit fan panel port model pin test mesafe distans sinyal bara mike ayak star starter kaplin orta uç uc as an on bu ay'.split(' ').forEach(function (w) { AMB[w] = 1; });
  // Ek listesi (uzundan kısaya); tür: p = çoğul, w = -lı (ile), o = -sız (olmadan), '' = anlamı çeviriye girmeyen hâl / iyelik eki.
  var SUF = [
    ['larının', 'p'], ['lerinin', 'p'], ['larına', 'p'], ['lerine', 'p'], ['larında', 'p'], ['lerinde', 'p'], ['larından', 'p'], ['lerinden', 'p'],
    ['ları', 'p'], ['leri', 'p'], ['lara', 'p'], ['lere', 'p'], ['larda', 'p'], ['lerde', 'p'], ['lardan', 'p'], ['lerden', 'p'], ['lar', 'p'], ['ler', 'p'],
    ['sının', ''], ['sinin', ''], ['sunun', ''], ['sünün', ''], ['ının', ''], ['inin', ''], ['unun', ''], ['ünün', ''], ['nın', ''], ['nin', ''], ['nun', ''], ['nün', ''],
    ['ıyla', ''], ['iyle', ''], ['uyla', ''], ['üyle', ''], ['yla', ''], ['yle', ''],
    ['lık', ''], ['lik', ''], ['luk', ''], ['lük', ''],
    ['sız', 'o'], ['siz', 'o'], ['suz', 'o'], ['süz', 'o'],
    ['lı', 'w'], ['li', 'w'], ['lu', 'w'], ['lü', 'w'],
    ['dan', ''], ['den', ''], ['tan', ''], ['ten', ''], ['da', ''], ['de', ''], ['ta', ''], ['te', ''],
    ['sı', ''], ['si', ''], ['su', ''], ['sü', ''], ['yı', ''], ['yi', ''], ['yu', ''], ['yü', ''], ['ya', ''], ['ye', ''],
    ['ı', ''], ['i', ''], ['u', ''], ['ü', ''], ['a', ''], ['e', '']
  ];
  var BACK = 'aıouâû', FRONT = 'eiöüî';
  // Türkçe ünlü uyumu: ekin ilk ünlüsü gövdenin son ünlüsüne uymalı (yabancı kelimelerde yanlış ek ayırmayı önler: «Nema» ≠ nem + a)
  function harmony(stem, sf, loose) {
    var v = (/[aeıioöuüâîû]/.exec(sf) || [])[0]; if (!v) return true;
    var lv = (stem.match(/[aeıioöuüâîû]/g) || []).pop(); if (!lv) return true;
    var back = BACK.indexOf(lv) >= 0, round = 'oöuüû'.indexOf(lv) >= 0;
    var want = 'ae'.indexOf(v) >= 0 ? (back ? 'a' : 'e') : (back ? (round ? 'u' : 'ı') : (round ? 'ü' : 'i'));
    if (v === want) return true;
    if (loose) { var f2 = function (c) { return c === 'ı' ? 'i' : c === 'ü' ? 'u' : c === 'ö' ? 'o' : c; }; if (f2(v) === f2(want)) return true; if ('ae'.indexOf(v) < 0 && 'iı'.indexOf(f2(v)) >= 0) return true; }
    // yerleşik yabancı kelimeler (saat-i, kontrol-ü, modül-ü, alkol-ü) için: son hece «l» ile biten ince ünlü eki
    return /l$/.test(stem) && FRONT.indexOf(v) >= 0;
  }
  var SOFT = { 'ğ': 'k', 'b': 'p', 'c': 'ç', 'd': 't', 'g': 'k' };
  var one = function (k) { return LEX[k] && k.indexOf(' ') < 0 ? k : null; };
  function lookup1(k) {
    if (LEX[k]) return k;
    var f = FOLD[k]; return f ? f : null;
  }
  // Tek kelime: tam → ek çözümleme (en çok 3 ek) → yumuşama geri alma. Dönüş: { key, kind } (kind: p / w / o / '').
  function analyze(w, raw) {
    var k = lookup1(w); if (k) return { key: k, kind: '' };
    var useFold = !TRCH.test(w) && !!raw && raw === raw.toUpperCase();
    var look = function (x) { if (LEX[x]) return x; if (useFold && FOLD[x]) return FOLD[x];
      // edilgen fiilden isim: düzenlenme → düzenleme, yapılandırılma → yapılandırma
      var m1 = /^(.+?)(ıl|il|ul|ül)(ma|me|mak|mek)$/.exec(x); if (m1 && LEX[m1[1] + m1[3]]) return m1[1] + m1[3];
      var m2 = /^(.+[aeıioöuü])n(ma|me)$/.exec(x); if (m2 && LEX[m2[1] + m2[2]]) return m2[1] + m2[2];
      // ikiz ünsüz: hatt(ı) → hat
      if (/([bcçdfgğhjklmnprsştvyz])\1$/.test(x) && LEX[x.slice(0, -1)]) return x.slice(0, -1);
      return null; };
    var best = null;
    (function walk(stem, kinds, depth) {
      if (best || depth > 3) return;
      for (var i = 0; i < SUF.length && !best; i++) {
        var sf = SUF[i][0]; if (stem.length - sf.length < 2 || stem.slice(-sf.length) !== sf) continue;
        var st = stem.slice(0, -sf.length); if (!harmony(st, sf, !TRCH.test(w))) continue;
        var ks = kinds.concat(SUF[i][1] ? [SUF[i][1]] : []);
        var cand = [st]; if (SOFT[st.slice(-1)]) cand.push(st.slice(0, -1) + SOFT[st.slice(-1)]);
        if (/[^aeıioöuü]$/.test(st) && /^[ıiuü]/.test(sf)) { /* düşen ünlü: ağız → ağzı */ }
        for (var j = 0; j < cand.length && !best; j++) { var kk = look(cand[j]); if (kk && st.length >= 2) best = { key: kk, kind: ks[0] || '' }; }
        if (!best) walk(st, ks, depth + 1);
      }
    })(w, [], 1);
    return best;
  }
  var plural = function (en) {
    var m = /^(.*?)(\S+)$/.exec(en); if (!m) return en; var w = m[2];
    if (/[A-Z]{2,}$/.test(w) || /s$/i.test(w)) return en;
    if (/(x|ch|sh)$/i.test(w)) return m[1] + w + 'es';
    if (/[^aeiou]y$/i.test(w)) return m[1] + w.slice(0, -1) + 'ies';
    return m[1] + w + 's';
  };
  // iyelik eki: kapak → kapağı, cihaz → cihazı, kutu → kutusu (ünlü uyumu + yumuşama)
  function POSS(k) {
    var lv = (k.match(/[aeıioöuü]/g) || []).pop() || 'e', v = 'aı'.indexOf(lv) >= 0 ? 'ı' : 'ei'.indexOf(lv) >= 0 ? 'i' : 'ou'.indexOf(lv) >= 0 ? 'u' : 'ü';
    var last = k.slice(-1), r = [];
    if (/[aeıioöuü]/.test(last)) r.push(k + 's' + v);
    else { r.push(k + v); var sf = { 'k': 'ğ', 'p': 'b', 'ç': 'c', 't': 'd' }[last]; if (sf) r.push(k.slice(0, -1) + sf + v); }
    return r;
  }
  var isAl = function (c) { return !!c && /[0-9A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]/.test(c); };
  var isWordChAt = function (s, i) { var c = s[i]; return isAl(c) || (c === '+' && isAl(s[i - 1]) && !isAl(s[i + 1])); };
  // «24PortSC» → «24 Port SC», «1Metre» → «1 Metre»: bitişik yazılmış sözlük kelimelerini ayır.
  // v1.76: takım tezgâhı / fatura kısaltmaları — önce Türkçe açık yazıma çevrilir, sonra sözlükten geçer.
  // sure:false → anlamı kesin değil, arayüz «yorumlanan kısaltma» olarak kullanıcıya gösterir (düzeltmesi öğrenilir).
  var ABBR = [
    { re: /\bTAK(?:MA)?\.?\s*U[CÇ](?:LU|LÜ)?\b\.?\s*-?/gi, k: 'TAK.UC', tr: 'takma uçlu', sure: true },
    { re: /\bANHT\b\.?/gi, k: 'ANHT.', tr: 'sıkma anahtarı', sure: true },
    { re: /\bDKT\b/g, k: 'DKT', tr: 'delik kater tutucu', sure: false },
    { re: /\bUDT\b/g, k: 'UDT', tr: 'u-matkap tutucu', sure: false },
    { re: /\bDÇT\b/g, k: 'DÇT', tr: 'dış çap tutucu', sure: false },
    { re: /\bKLV\b\.?/g, k: 'KLV', tr: 'kılavuz', sure: false },
    { re: /\bMNDR\b\.?/g, k: 'MNDR', tr: 'mandren', sure: false }
  ];
  // Mors konik: Türkçe «MK5» → uluslararası «MT5» (yalnız takım bağlama bağlamında; ayar «orijinal kodu koru» kapatır)
  var MORSE_CTX = /punta|mors|morse|konik|mandren|matkap|redüksiyon|reduksiyon|kovan|pinole|tutucu|sap\b/i;
  function stdCodes(src, out, keep) {
    if (keep || !MORSE_CTX.test(String(src || ''))) return out;
    return String(out).replace(/\bMK\s?([0-6])(?![0-9])/g, 'MT$1');
  }
  function abbrs(s) {
    var r = [];
    ABBR.forEach(function (a) { a.re.lastIndex = 0; if (a.re.test(String(s || ''))) r.push({ k: a.k, tr: a.tr, sure: a.sure }); a.re.lastIndex = 0; });
    return r;
  }
  function expand(s) {
    s = String(s); var s0 = s;
    ABBR.forEach(function (a) { a.re.lastIndex = 0; s = s.replace(a.re, function (m) { var up = m === m.toLocaleUpperCase('tr'); return ' ' + (up ? a.tr.toLocaleUpperCase('tr') : a.tr) + ' '; }); });
    // döner punta bağlamında «UÇ» = punta ucu (tornada aksi hâlde kesici uç / insert)
    if (/punta/i.test(s)) s = s.replace(/(\d)\s*(U[CÇ]|uç|uc)(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, function (m, d, u) { return d + ' ' + (u === u.toUpperCase() ? 'PUNTA UÇLARI' : 'punta uçları'); });
    if (/punta/i.test(s)) s = s.replace(/(^|[^A-Za-zÇĞİÖŞÜçğıöşü])(U[CÇ]|uç|uc)(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, function (m, b, u) { return b + (u === u.toUpperCase() ? 'PUNTA UCU' : 'punta ucu'); });
    s = s.replace(/\s*\bSET\s*-\s+/g, ' - SET: ').replace(/\s*\bset\s*-\s+/gi, ' - Set: ');
    if (s === s0) return s;
    return s.replace(/\s{2,}/g, ' ').replace(/\s+:/g, ':').replace(/\s*\+\s*/g, ' + ').trim();
  }
  function presplit(s) {
    s = expand(s);
    s = s.replace(/(\d)\s*(mt|metre)\b/gi, '$1 metre').replace(/\b(dev|devir)\s*\/\s*(dk|dak|dakika)\b/gi, 'rpm').replace(/\bd\/dk\b/gi, 'rpm');
    s = s.replace(/(\d+)\s*[’']?(?:lı|li|lu|lü)(?![A-Za-zçğıöşü])/gi, function (a, n, off, all) { var rest = all.slice(off + a.length); return n + (/^\s*$/.test(rest) || /^\s+(paket|kutu|adet|koli)/i.test(rest) ? '-Pack' : '-Way'); });
    s = s.replace(/([0-9A-Za-zÇĞİÖŞÜçğıöşü])[’'](?:dan|den|tan|ten|da|de|ta|te|ya|ye|yı|yi|yu|yü|nın|nin|nun|nün|ın|in|un|ün|a|e|ı|i|u|ü|lar|ler|ları|leri|lı|li|lu|lü)(?![A-Za-zçğıöşü])/g, '$1');
    s = s.replace(/(\d)([A-Za-zÇĞİÖŞÜçğıöşü]{2,})/g, function (a, d, w) { var l = lower(w); return (analyze(l) || /^(metre|mt|adet|port|pin|kanal|li|lı|lu|lü)/.test(l)) && !/^(mm|cm|km|gb|tb|mb|kb|mhz|ghz|khz|hz|kva|kw|mw|mah|ah|vac|vdc|nm|kg|gr|lt|ml|ms|ns|us|ma|kv|va|dbi|db|ohm|bit|bps|gbps|mbps|pin|pf|nf|uf|mh|uh|ft|in|ip|nit|lm|rpm|bar|psi|awg|dtex|th|st|nd|rd|ch|cat|base)$/.test(l) ? d + ' ' + w : a; });
    s = s.replace(/([A-Za-zÇĞİÖŞÜçğıöşü]{3,}?)([A-ZÇĞİÖŞÜ]{2,}[a-z]*)\b/g, function (a, l1, u) { return /[a-zçğıöşü]$/.test(l1) && analyze(lower(l1)) ? l1 + ' ' + u : a; });
    return s;
  }
  function caseLike(src, en) {
    if (!en) return en;
    var letters = src.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
    if (letters.length > 1 && letters === letters.toLocaleUpperCase('tr') && /^[A-Z]/.test(en)) return en.toUpperCase();
    return en;
  }
  function translate(text, lg, opts) {
    var r0 = translate0(text, lg); r0.text = stdCodes(text, r0.text, opts && opts.keepCodes); r0.abbr = abbrs(text); return r0;
  }
  var TFW = { 've': 1, 'veya': 1, 'ile': 1, 'ya da': 1 };
  var LABEL = /^(seviye|seviyesi|tip|tipi|sınıf|sınıfı|kategori|kademe|numara|beden|boyut|ebat|seri|serisi|grup|grubu)$/;
  var EFW = { 'with': 'مع', 'without': 'بدون', 'for': 'لـ', 'and': 'و', 'incl.': 'شامل', 'including': 'شامل' };
  var ADJW = /^(rutile|nitrile|toolmaker's|conventional|optical|black|white|red|blue|green|yellow|gr[ae]y|orange|purple|brown|silver|gold|transparent|clear|stainless|stainless steel|galvani[sz]ed|brass|copper|alumini?um|plastic|steel|digital|analog|adjustable|portable|waterproof|single-phase|three-phase|double|single|dual|manual|automatic|electric|hydraulic|pneumatic|magnetic|flexible|original|compatible|new|front|rear|left|right|upper|lower|inner|outer|short|long|large|small|mini|heavy-duty|industrial)$/i;
  function isAdj(g) {
    if (!g || g.kind === 'x') return false;
    var en = g.enSrc || (g.key && LEX[g.key] ? LEX[g.key][0] : ''); if (!en) return false;
    // Türkçe niteleme ekleri (-lı / -sız / -lık değil): «Çelik Burunlu», «Pudrasız» → sıfat
    if (g.key && /(l[ıiuü]|s[ıiuü]z)$/.test(g.key) && !/^with /i.test(en)) return true;
    if (/^[A-Za-z-]+$/.test(en) && /(al|ic|ive|ous)$/i.test(en) && !/^(metal|terminal|signal|pedal|panel|crystal|interval|manual|material|rental|dial|seal|steel|tool|wheel|coal|goal|disc|logic|plastic|fabric|ceramic|cable|valve|drive|olive|relative|explosive|adhesive|abrasive)$/i.test(en)) return true;
    return ADJW.test(en) || (/^[A-Za-z-]+$/.test(en) && /(ed|able|ible|proof)$/i.test(en) && !/(shed|bed|seed|speed|feed|head|thread)$/i.test(en));
  }
  function lookupEn(parts) {
    var k = parts.join(' ');
    if (ENLEX[k]) return ENLEX[k];
    var last = parts[parts.length - 1], sg = null;
    if (/ies$/.test(last)) sg = last.slice(0, -3) + 'y'; else if (/(ches|shes|xes|sses)$/.test(last)) sg = last.slice(0, -2); else if (/[^s]s$/.test(last) && last.length > 3) sg = last.slice(0, -1);
    if (sg) { var k2 = parts.slice(0, -1).concat([sg]).join(' '); if (ENLEX[k2]) return ENLEX[k2]; }
    return null;
  }
  function translate0(text, lg) {
    var ar = lg === 'ar', src = presplit(String(text == null ? '' : text));
    if (ar) src = src.replace(/(\d+)-Pack\b/g, '$1 قطع').replace(/(\d+)-Way\b/g, '$1 مخارج');
    // belirteçler: sözcük / ayraç
    var tok = [], i = 0;
    while (i < src.length) {
      var j = i, w = isWordChAt(src, i);
      while (j < src.length && isWordChAt(src, j) === w) j++;
      tok.push({ t: src.slice(i, j), w: w }); i = j;
    }
    var words = []; tok.forEach(function (x, ix) { if (x.w) words.push(ix); });
    var lw = words.map(function (ix) { return lower(tok[ix].t); });
    // adda kesin Türkçe kelime var mı (belirsiz kısa kelimeler için)
    var trName = lw.some(function (l, li) { if (TRCH.test(l)) return true; var a = analyze(l, tok[words[li]].t); return !!(a && !AMB[a.key] && !AMB[l] && lower(LEX[a.key][0]) !== a.key); });
    var seg = [], hit = 0, left = [], p = 0, terms = [];
    while (p < words.length) {
      var m = null;
      for (var n = Math.min(MAXW, words.length - p); n >= 1 && !m; n--) {
        // yalnız boşluk / tire ile ayrılmış kelimeler bir öbek olabilir
        var ok = true; for (var q = p; q < p + n - 1; q++) { var between = tok.slice(words[q] + 1, words[q + 1]).map(function (x) { return x.t; }).join(''); if (!/^[\s-]+$/.test(between)) { ok = false; break; } }
        if (!ok) continue;
        var parts = lw.slice(p, p + n), key = parts.join(' '), hitk = lookup1(key), kind = '';
        if (!hitk && n > 1) { var a2 = analyze(parts[n - 1], tok[words[p + n - 1]].t); if (a2) { var pre2 = parts.slice(0, n - 1), k2 = pre2.concat([a2.key]).join(' '); var h2 = lookup1(k2);
          // v1.77: tamlama sözlükte iyelikli («şarj kontrol cihazı»), addaki kelime başka ek almış («… cihazlı») → iyelikli biçimi de dene
          if (!h2) { var pk = POSS(a2.key); for (var pq = 0; pq < pk.length && !h2; pq++) h2 = lookup1(pre2.concat([pk[pq]]).join(' ')); }
          if (h2) { hitk = h2; kind = a2.kind; } } }
        if (!hitk && n === 1) { var a1 = analyze(parts[0], tok[words[p]].t); if (a1) { hitk = a1.key; kind = a1.kind; } }
        var trOk = !!hitk && !(n === 1 && (AMB[parts[0]] || AMB[hitk]) && (!trName || (tok[words[p]].t.length <= 3 && tok[words[p]].t === tok[words[p]].t.toUpperCase() && /[A-Z]/.test(tok[words[p]].t)))) && !(n === 1 && !TRCH.test(parts[0]) && !LEX[parts[0]] && FOLD[parts[0]] === hitk && !trName && tok[words[p]].t !== tok[words[p]].t.toUpperCase());
        // v1.77: Türkçe değilse ve Arapçaya çevriliyorsa İngilizce terim (adı İngilizce yazılmış ürünler: «Boring Bar Sleeve» → «جلبة قضيب التجويف»)
        var eparts = ar && n <= MAXE ? words.slice(p, p + n).map(function (ix) { return tok[ix].t.toLowerCase(); }) : null;
        if (eparts && n === 1 && EFW[eparts[0]]) { m = { n: 1, en: EFW[eparts[0]], fw: true }; break; }
        if (eparts && !eparts.some(function (x) { return TRCH.test(x); }) && !(trOk && (n > 1 || trName || !lookupEn(eparts)))) {
          var ea = lookupEn(eparts);
          var rw0 = tok[words[p]].t;
          // v1.79: işlemci / ürün seviyesi + model no («Gold 6152», «Silver 4214R», «Platinum 8380») kod gibi aynen kalır
          var tier = n === 1 && /^(gold|silver|platinum|bronze)$/.test(parts[0]) && p + 1 < words.length && /^\d{3,5}[a-z]{0,2}$/.test(lw[p + 1]);
          if (ea && !tier && !(n === 1 && (/^\d/.test(parts[0]) || (rw0.length <= 3 && rw0 === rw0.toUpperCase())))) { m = { n: n, en: ea }; break; }
        }
        if (!trOk) continue;
        m = { n: n, key: hitk, kind: kind };
      }
      if (m && m.en) {
        var e0 = words[p], e1 = words[p + m.n - 1];
        terms.push({ src: tok.slice(e0, e1 + 1).map(function (x) { return x.t; }).join(''), out: m.en });
        seg.push({ a: e0, b: e1, out: m.en, kind: m.fw ? 'f' : '', key: '', word: true, enSrc: tok.slice(e0, e1 + 1).map(function (x) { return x.t; }).join('') }); hit++; p += m.n; continue;
      }
      if (m) {
        var s0 = words[p], s1 = words[p + m.n - 1], raw = tok.slice(s0, s1 + 1).map(function (x) { return x.t; }).join('');
        if (!NOGL[m.key]) terms.push({ src: raw, out: LEX[m.key][ar ? 1 : 0] });
        var tr = LEX[m.key][ar ? 1 : 0];
        if (m.kind === 'p' && !ar) tr = plural(tr);
        if (!m.kind && /^with /i.test(LEX[m.key][0]) && (m.n === 1 || /l[ıiuü]$/.test(m.key))) m.kind = 'W';
        if (ar && TFW[m.key]) m.kind = 'f';
        seg.push({ a: s0, b: s1, out: caseLike(raw, tr), kind: m.kind, key: m.key, word: true }); hit++; p += m.n;
      } else {
        var ix = words[p], t = tok[ix].t; if (TRCH.test(t)) left.push(t);
        seg.push({ a: ix, b: ix, out: t, kind: 'x', word: true, code: /\d/.test(t) }); p++;
      }
    }
    // sayı + birim: «1 Metre» / «2 Mt» → «1 m»; «10 Adet» → «10 pcs»; «24 Portlu» → «24-Port»
    for (var s = 0; s < seg.length; s++) {
      var g = seg[s], prev = s > 0 ? seg[s - 1] : null, prevNum = prev && /^\d+([.,]\d+)?$/.test(tok[prev.a].t) && /^\s*$/.test(tok.slice(prev.b + 1, g.a).map(function (x) { return x.t; }).join(''));
      // v1.77: «24 Portlu» → «24-Port» yalnız küçük sayılarda; «1605 Somunlu» gibi kodlardan sonra «with Nut»
      if (prevNum && (parseFloat(tok[prev.a].t) >= 1000 || (prev.a > 0 && !/^\s+$/.test(tok[prev.a - 1].t)))) prevNum = false;
      if ((g.key === 'parça' || g.key === 'parçalı') && prevNum && !ar) { g.out = 'Piece'; g.join = '-'; continue; }
      if (g.key === 'metre' || g.key === 'mt' || g.key === 'metrelik') { if (prevNum) { g.out = ar ? 'م' : 'm'; if (ar) g.kind = 'x'; } }
      // Arapça: sayıya bağlı sözcük («16 Kanal», «Seviye 5») kendi başına kalır, öbeğe katılmaz
      if (ar && g.kind !== 'x' && g.kind !== 'f' && (prevNum || (LABEL.test(g.key || '') && s + 1 <= seg.length && /^\s*\d/.test(tok.slice(g.b + 1).map(function (x) { return x.t; }).join(''))))) g.kind = 'x';
      if (g.kind === 'W') { if (prevNum && !ar) { g.out = LEX[g.key][0].replace(/^with /i, ''); g.join = '-'; } else if (!ar) { var wb = LEX[g.key][0].replace(/^with /i, ''), wo = caseLike(tok.slice(g.a, g.b + 1).map(function (x) { return x.t; }).join(''), 'With ' + wb); g.out = wo === wo.toUpperCase() ? wo : 'with ' + wb; g.move = true; } continue; }
      if (!g.kind && g.key && /l[ıiuü]$/.test(g.key) && !/^with /i.test(LEX[g.key][0]) && prevNum && !ar) { var stm = g.key.slice(0, -2), sa = analyze(stm) || analyze(stm.replace(/ğ$/, 'k')); if (sa && LEX[sa.key]) g.out = caseLike(tok[g.a].t, LEX[sa.key][0]); if (/^[A-Z]/.test(g.out)) g.join = '-'; continue; }
      if (g.kind === 'w' && prevNum && ar) { g.out = LEX[g.key][1]; g.kind = 'x'; continue; }
      if (g.kind === 'w' && prevNum && !ar) { g.out = LEX[g.key][0]; g.join = '-'; }
      else if ((g.kind === 'w' || g.kind === 'o') && g.key) {
        var base = LEX[g.key][ar ? 1 : 0];
        g.out = ar ? (g.kind === 'w' ? 'مع ' : 'بدون ') + base : (g.kind === 'w' ? 'with ' : 'without ') + caseLike(tok.slice(g.a, g.b + 1).map(function (x) { return x.t; }).join(''), base);
        g.move = true;
      }
    }
    // «A için B» → «B for A» (A ve B: boşlukla ayrılmış sözcük dizileri)
    if (!ar) {
      var runOf = function (k, dir) { var e2 = k; while (true) { var nb = e2 + dir; if (nb < 0 || nb >= seg.length) break; var lo = Math.min(e2, nb), hi = Math.max(e2, nb), gp2 = tok.slice(seg[lo].b + 1, seg[hi].a).map(function (x) { return x.t; }).join(''); if (!/^\s+$/.test(gp2) || seg[nb].code || seg[nb].key === 'için') break; e2 = nb; } return e2; };
      for (var c = 0; c < seg.length; c++) if (seg[c].key === 'için' && c > 0) {
        if (c === seg.length - 1 || !/^\s+$/.test(tok.slice(seg[c].b + 1, seg[c + 1].a).map(function (x) { return x.t; }).join(''))) { seg[c].reorder = { A: [c - 1, c - 1], B: null }; continue; }
        var a0 = c - 1, b1 = runOf(c + 1, 1);
        seg[c].reorder = { A: [a0, c - 1], B: [c + 1, b1] };
      }
    }
    // «with X» öbeğini ardından gelen kelime dizisinin sonuna taşı (rakam / noktalama kesene kadar)
    var order = seg.map(function (_x, k) { return k; });
    seg.forEach(function (sg4, k) { if (!sg4.reorder) return; var A = sg4.reorder.A, B = sg4.reorder.B;
      if (!B) { var ja = order.indexOf(A[0]), jk = order.indexOf(k); if (ja >= 0 && jk > ja) { order.splice(jk, 1); order.splice(ja, 0, k); } return; }
      var ia = order.indexOf(A[0]), ib = order.indexOf(B[1]); if (ia < 0 || ib < 0) return;
      var a = order.slice(ia, order.indexOf(k)), b = order.slice(order.indexOf(k) + 1, ib + 1); order.splice.apply(order, [ia, ib - ia + 1].concat(b, [k], a)); });
    if (!ar) {
      for (var u = 0; u < order.length; u++) {
        var sg = seg[order[u]]; if (!sg.move || sg.moved) continue;
        var e = u;
        while (e + 1 < order.length) {
          var nx = seg[order[e + 1]], gap = tok.slice(seg[order[e]].b + 1, nx.a).map(function (x) { return x.t; }).join('');
          if (!/^\s+$/.test(gap) || nx.code || nx.move) break; e++;
        }
        if (e > u) { var mv = order.splice(u, 1)[0]; order.splice(e, 0, mv); sg.moved = true; u--; }
      }
    } else {
      // Arapça: niteleyen önde (Türkçe) → nitelenen önde; boşlukla ayrılmış sözcük dizileri ters çevrilir
      var runs = [], cur = [];
      for (var r = 0; r < seg.length; r++) {
        var gp = r > 0 ? tok.slice(seg[r - 1].b + 1, seg[r].a).map(function (x) { return x.t; }).join('') : '';
        if (r > 0 && (!/^\s+$/.test(gp) || seg[r].code || seg[r - 1].code || seg[r].kind === 'x' || seg[r - 1].kind === 'x' || seg[r].kind === 'f' || seg[r - 1].kind === 'f')) { runs.push(cur); cur = []; }
        cur.push(r);
      }
      if (cur.length) runs.push(cur);
      order = []; runs.forEach(function (rn) {
        if (!(rn.length > 1 && rn.every(function (k) { return seg[k].kind !== 'x'; }))) { order = order.concat(rn); return; }
        // v1.77: «مع …» / «بدون …» öbekleri dizinin sonuna; baş isimden SONRA gelen sıfatlar (renk, malzeme, -li/-ed) yerinde kalır
        var tipK = function (k) { return / tipi$|^tipi$|^tip$/.test(seg[k].key || ''); };
        var withK = function (k) { return seg[k].kind === 'w' || seg[k].kind === 'o' || seg[k].kind === 'W'; };
        var body = rn.filter(function (k) { return !tipK(k) && !withK(k); });
        var h = body.length - 1; while (h > 0 && isAdj(seg[body[h]])) h--;
        var head = body.slice(0, h + 1), tail = body.slice(h + 1);
        order = order.concat(head.reverse(), tail, rn.filter(tipK), rn.filter(withK));
      });
    }
    // yeniden birleştir: sözcük olmayan belirteçler kendi yerinde kalır; taşınan öbekler kelime aralıklarına yerleşir
    var out = '', last = -1;
    var gapOf = function (k) { var sg2 = seg[k]; return sg2; };
    var positions = seg.map(function (sg3) { return [sg3.a, sg3.b]; });
    for (var o = 0; o < order.length; o++) {
      var pos = positions[o], sgo = seg[order[o]];
      var pre = tok.slice(last + 1, pos[0]).map(function (x) { return x.t; }).join('');
      if (sgo.join === '-' && /^\s+$/.test(pre)) pre = '-';
      out += pre + sgo.out; last = pos[1];
    }
    out += tok.slice(last + 1).map(function (x) { return x.t; }).join('');
    void gapOf;
    out = out.replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').trim();
    out = out.replace(/\b((?:[A-Za-z][\w+-]*\s+){0,2}[A-Za-z][\w+-]*)\s+\1\b/gi, '$1');
    if (!ar) out = out.replace(/^(with|without|for|and|or)\b/, function (w) { return w[0].toUpperCase() + w.slice(1); });
    else out = out.replace(/لـ\s+ال/g, 'لل').replace(/لـ\s+/g, 'ل').replace(/(^|\s)و\s+(?=\S)/g, '$1و').replace(/(\d+)-(?:عبوة|Pack)/g, '$1 قطع').replace(/(\d+)-Way/g, '$1 اتجاهات');
    return { text: out, hit: hit, left: left, terms: terms };
  }
  // zorunlu terim listesine girmeyen bağlaç / genel kelimeler
  var NOGL = {}; 've ile için veya ya da adet set seti takım takımı kit yeni orijinal muadil'.split(' ').forEach(function (w) { NOGL[w] = 1; });
  // v1.77: yapay zekâya verilecek zorunlu terim listesi — adlarda sözlükte bulunan teknik terimler (kaynak → sözlükteki karşılık)
  function glossary(list, lg) {
    var seen = Object.create(null), out = [];
    (list || []).forEach(function (x) {
      var r; try { r = translate0(expandOnly(x), lg); } catch (e) { return; }
      (r.terms || []).forEach(function (t) { var k = t.src.toLocaleLowerCase('tr'); if (!seen[k] && t.src.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length >= 3) { seen[k] = 1; out.push([t.src, t.out]); } });
    });
    return out;
  }
  function expandOnly(x) { return String(x == null ? '' : x); }
  var api = { translate: translate, glossary: glossary, stdCodes: stdCodes, abbrs: abbrs, expand: expand, size: LEX_DATA.length, has: function (w) { return !!analyze(lower(String(w))); }, version: 3 };
  if (typeof window !== 'undefined') window.FalconSozluk = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
