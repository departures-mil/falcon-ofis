/* Falcon Ofis — "Sor" asistanının çevrimdışı (yapay zekâsız) ek cevapları (v1.60.1).
   Paket FA.local'in başında window.FalconAskLocal(text, ctx, range)'i çağırır (araclar/patch-ui-1601.py); bu eklenti bir cevap
   döndürürse o gösterilir, null dönerse paketin kendi hareket motoru çalışır. İnternet ya da anahtar gerekmez; hesabı SQL yapar.
   Ele aldığı sorular (tr / en / ar):
     1) Kasa bakiyesi: "kasada ne kadar para var", "bakiye", "how much money do we have", "كم المال في الصندوق"
     2) Azalan / biten stok: "stokta azalan", "biten malzeme", "low stock", "المخزون المنخفض"
   Tarih aralığı seçiliyse ya da soru bir dönem / harcama sorusuysa karışmaz (paketin motoru cevaplar). */
(function () {
  'use strict';
  var T = {
    tr: { bal: 'Kasa bakiyeleri', boxes: 'Kasalar', cash: 'Nakit', total: 'Toplam (≈ USD)', noRate: '(kuru girilmemiş birimler toplama katılmadı)',
      none: 'Kayıtlı kasa yok.', low: 'Azalan / biten stok', mat: 'Malzemeler (en az miktarın altında)', prod: 'Ürünler (stokta yok)',
      allOk: 'Azalan malzeme ya da stoğu biten ürün yok.', min: 'en az', more: 'daha', empty: 'Bakiyesi sıfır olan', foot: 'çevrimdışı hesap · gizli kasalar hariç', footS: 'çevrimdışı hesap' },
    en: { bal: 'Cash balances', boxes: 'Cash boxes', cash: 'Cash', total: 'Total (≈ USD)', noRate: '(currencies without a rate are left out)',
      none: 'No cash boxes yet.', low: 'Low / out of stock', mat: 'Materials (below minimum)', prod: 'Products (out of stock)',
      allOk: 'No material is below its minimum and no product is out of stock.', min: 'min', more: 'more', empty: 'Zero balance', foot: 'offline calculation · hidden boxes excluded', footS: 'offline calculation' },
    ar: { bal: 'أرصدة الصناديق', boxes: 'الصناديق', cash: 'النقد', total: 'المجموع (≈ دولار)', noRate: '(العملات بلا سعر صرف غير محسوبة)',
      none: 'لا توجد صناديق بعد.', low: 'المخزون المنخفض / النافد', mat: 'المواد (أقل من الحد الأدنى)', prod: 'المنتجات (نفدت من المخزون)',
      allOk: 'لا توجد مادة تحت الحد الأدنى ولا منتج نافد.', min: 'الحد الأدنى', more: 'أخرى', empty: 'رصيدها صفر', foot: 'حساب دون اتصال · دون الصناديق المخفية', footS: 'حساب دون اتصال' },
  };
  // Soru tanıma: küçük harf + Türkçe/Arapça harf sadeleştirme
  function norm(s) {
    return String(s || '').toLocaleLowerCase('tr').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '');
  }
  var RX = {
    balance: /(kasa(da|lar)?\b.*(ne kadar|kaç|bakiye|para|durum)|ne kadar para(mız)? var|bakiye|elimizde(ki)? (para|nakit)|cash on hand|balance|how much (money|cash)|money do we have|رصيد|في الصندوق|كم (المال|النقود|الفلوس)|الاموال المتوفره|كم لدينا)/,
    period: /(bu ay|geçen ay|bu hafta|bugün|dün|yıl|harca|gider|gelir|giriş|çıkış|this month|last month|today|yesterday|week|year|spent|spend|expense|income|هذا الشهر|الشهر الماضي|اليوم|امس|الاسبوع|السنه|صرف|مصروف|دخل|ايراد)/,
    stockWord: /(stok|malzeme|ürün|stock|material|product|item|مخزون|مواد|ماده|منتج|بضاع)/,
    stockLow: /(azal|biten|bitti|bitmek|bitiyor|tüken|kritik|eksik|az kal|low|out of|running|نفد|نفاد|ينفد|منخفض|ناقص|قليل)/,
  };
  function lang() { var l = (document.documentElement.getAttribute('lang') || 'tr').slice(0, 2); return T[l] ? l : 'tr'; }
  function num(n, l) {
    var loc = l === 'tr' ? 'tr-TR' : l === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US';
    try { return new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); } catch (e) { return (Math.round(n * 100) / 100).toFixed(2); }
  }
  function qty(n, l) {
    var loc = l === 'tr' ? 'tr-TR' : l === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US';
    try { return new Intl.NumberFormat(loc, { maximumFractionDigits: 3 }).format(n); } catch (e) { return String(n); }
  }
  function name(n) { return window.FalconAdlar ? window.FalconAdlar.translate(n) : n; }
  function q(sql, p) { return window.falcon.db.all(sql, p || []); }

  async function balances(ctx, l) {
    var t = T[l];
    var rows = await q(
      "SELECT a.id, a.name, a.currency_code AS cur, COALESCE(a.kind,'box') AS kind, COALESCE(a.opening_balance,0)" +
      " + COALESCE((SELECT SUM(amount) FROM cash_transactions WHERE account_id = a.id AND direction = 'in' AND info_only = 0), 0)" +
      " - COALESCE((SELECT SUM(amount) FROM cash_transactions WHERE account_id = a.id AND direction = 'out' AND info_only = 0), 0) AS bal" +
      ' FROM cash_accounts a WHERE COALESCE(a.hidden,0) = 0 ORDER BY a.id');
    var L = ['**' + t.bal + '**'];
    if (!rows.length) { L.push('- ' + t.none); return L; }
    var rates = (ctx && ctx.rates) || { USD: 1 }, usd = 0, missing = false;
    [['box', t.boxes], ['cash', t.cash]].forEach(function (g) {
      var part = rows.filter(function (r) { return (r.kind === 'cash' ? 'cash' : 'box') === g[0]; });
      if (!part.length) return;
      L.push(''); L.push('**' + g[1] + '**');
      var zero = part.filter(function (r) { return Math.abs(r.bal || 0) < 0.005; });
      part.filter(function (r) { return zero.indexOf(r) < 0; }).forEach(function (r) {
        L.push('- ' + name(r.name) + ': **' + num(r.bal || 0, l) + ' ' + r.cur + '**');
        var rate = rates[r.cur];
        if (r.bal) { if (rate > 0) usd += r.bal / rate; else missing = true; }
      });
      if (zero.length) L.push('- ' + t.empty + ': ' + zero.map(function (r) { return name(r.name); }).join(', '));
    });
    L.push(''); L.push('- ' + t.total + ': **' + num(usd, l) + ' USD**' + (missing ? ' ' + t.noRate : ''));
    return L;
  }

  async function lowStock(l) {
    var t = T[l];
    var mats = await q('SELECT name, unit, quantity, min_quantity FROM materials WHERE min_quantity > 0 AND quantity <= min_quantity ORDER BY (quantity / min_quantity), name COLLATE NOCASE LIMIT 40');
    var prods = await q('SELECT p.name FROM products p WHERE COALESCE((SELECT SUM(quantity) FROM product_stock s WHERE s.product_id = p.id), 0) <= 0 ORDER BY p.name COLLATE NOCASE LIMIT 40');
    var L = ['**' + t.low + '**'];
    if (!mats.length && !prods.length) { L.push('- ' + t.allOk); return L; }
    if (mats.length) {
      L.push(''); L.push('**' + t.mat + '**');
      mats.slice(0, 25).forEach(function (m) { L.push('- ' + m.name + ': **' + qty(m.quantity, l) + '** ' + (m.unit || '') + ' (' + t.min + ' ' + qty(m.min_quantity, l) + ')'); });
      if (mats.length > 25) L.push('  · … +' + (mats.length - 25) + ' ' + t.more);
    }
    if (prods.length) {
      L.push(''); L.push('**' + t.prod + '**');
      prods.slice(0, 25).forEach(function (p) { L.push('- ' + p.name); });
      if (prods.length > 25) L.push('  · … +' + (prods.length - 25) + ' ' + t.more);
    }
    return L;
  }

  /** Paketin FA.local'i çağırır. Cevap: {text, local:true} ya da null (paketin motoru devam eder). */
  async function ask(text, ctx, range) {
    if (!window.falcon || !window.falcon.db || range) return null;
    var s = norm(text), l = lang(), L = null, foot = 'foot';
    if (RX.balance.test(s) && !RX.period.test(s)) L = await balances(ctx, l);
    else if (RX.stockWord.test(s) && RX.stockLow.test(s) && !RX.period.test(s)) { L = await lowStock(l); foot = 'footS'; }
    if (!L) return null;
    L.push(''); L.push('_' + T[l][foot] + '_');
    return { text: L.join('\n'), local: true };
  }
  window.FalconAskLocal = ask;
  window.FalconAskLocal._test = { RX: RX, norm: norm };
})();
