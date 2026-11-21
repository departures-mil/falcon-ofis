// İnternetten güncel kur çekme (v1.11): Suriye piyasası (Şam serbest piyasa kuru, sp-today.com).
// Türkiye / resmi kur kaynakları kullanılmaz; TL kuru da Suriye piyasasındaki TL fiyatından hesaplanır:
//   1 USD = (USD'nin SYP fiyatı / TL'nin SYP fiyatı) TL
// Sayfa "yeni" (2026 sonrası) ve "eski" Suriye lirası değerlerini yan yana gösterir (eski = yeni x 100).
const SOURCES = [
  { url: 'https://sp-today.com/en/currencies', name: 'sp-today.com' },
  { url: 'https://sp.today/en/currencies', name: 'sp.today' },
];

const SLUGS = { USD: 'us-dollar', TRY: 'turkish-lira' };

const decode = (s) => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&');

// Bir para biriminin bağlantısının geçtiği her yerdeki metin (menüde de geçebilir): bağlantıdan bir sonraki
// farklı para birimi bağlantısına ya da satır sonuna kadar
function rowTexts(html, slug) {
  const out = [];
  const re = new RegExp(`/currency/${slug}(?![\\w-])`, 'g');
  let hit;
  while ((hit = re.exec(html)) && out.length < 40) {
    let start = html.lastIndexOf('<tr', hit.index);
    if (start < 0 || hit.index - start > 3000) start = hit.index;
    const rest = html.slice(hit.index);
    const next = /\/currency\/([a-z-]+)/g;
    let end = Math.min(rest.length, 4000);
    let m;
    while ((m = next.exec(rest)) && m.index < end) {
      if (m[1] !== slug) {
        end = m.index;
        break;
      }
    }
    const trEnd = rest.indexOf('</tr>');
    if (trEnd >= 0 && trEnd < end) end = trEnd;
    const chunk = html.slice(start, hit.index + end);
    out.push(decode(chunk.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' '));
  }
  return out;
}

// İlk anlamlı satır: yeni / eski çifti bulunan satır tercih edilir
function findRow(html, slug) {
  const rows = rowTexts(html, slug).map(parseRow).filter(Boolean);
  return rows.find((r) => r.scale === 'new') || rows[0] || null;
}

// Satırdaki alış / satış (yeni Suriye lirası). Yüzde değişim değerleri atlanır.
function parseRow(text) {
  if (!text) return null;
  const nums = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(%)?/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[2]) continue;
    const v = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0) nums.push(v);
  }
  // "137.50 13,750 old" gibi yeni / eski çiftleri
  const pairs = [];
  for (let i = 0; i < nums.length - 1; i++) {
    const a = nums[i];
    const b = nums[i + 1];
    if (Math.abs(b - a * 100) <= a * 100 * 0.015 + 1) {
      pairs.push(a);
      i++;
    }
  }
  if (pairs.length >= 2) return { buy: pairs[0], sell: pairs[1], scale: 'new' };
  if (pairs.length === 1) return { buy: pairs[0], sell: pairs[0], scale: 'new' };
  if (nums.length >= 2) return { buy: nums[0], sell: nums[1], scale: 'unknown' };
  if (nums.length === 1) return { buy: nums[0], sell: nums[0], scale: 'unknown' };
  return null;
}

// HTML -> { usd: {buy, sell}, try: {buy, sell} } (yeni Suriye lirası cinsinden)
function parseMarket(html) {
  const usd = findRow(html, SLUGS.USD);
  const tl = findRow(html, SLUGS.TRY);
  if (!usd || !tl) return null;
  // Ölçek belli değilse: dolar 1000'den büyükse eski liradır
  const norm = (r, big) => (r.scale === 'unknown' && r.buy > big ? { buy: r.buy / 100, sell: r.sell / 100 } : { buy: r.buy, sell: r.sell });
  const u = norm(usd, 2000);
  const t = norm(tl, u.buy / 5);
  // Akla yatkınlık: 1 USD 20-2000 yeni SYP, 1 USD 10-200 TL
  if (!(u.buy >= 20 && u.buy <= 2000 && u.sell >= u.buy * 0.9 && u.sell <= u.buy * 1.2)) return null;
  const usdTry = u.sell / t.sell;
  if (!(usdTry >= 10 && usdTry <= 200)) return null;
  return { usd: u, try: t };
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// Piyasa fiyatlarından programın kurları: 1 USD = ? SYP ve 1 USD = ? TL.
// prevSyp: kayıtlı son SYP kuru; eski lira (ör. 14.000) kullanılıyorsa değerler x100 yazılır.
function toAppRates(market, prevSyp) {
  const k = prevSyp && prevSyp > 2000 ? 100 : 1;
  return {
    SYP: { buy: round(market.usd.buy * k, 2), sell: round(market.usd.sell * k, 2) },
    // Çapraz kur: alış = USD alış / TL satış, satış = USD satış / TL alış (alış hiçbir zaman satıştan büyük olmaz)
    TRY: { buy: round(market.usd.buy / market.try.sell, 2), sell: round(market.usd.sell / market.try.buy, 2) },
  };
}

// fetchFn(url, opts) -> { ok, status, text() }
async function fetchOnlineRates(fetchFn, { prevSyp } = {}) {
  const errors = [];
  for (const src of SOURCES) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller && setTimeout(() => controller.abort(), 15000);
      const res = await fetchFn(src.url, { signal: controller?.signal, headers: { Accept: 'text/html', 'Accept-Language': 'en' } });
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const market = parseMarket(await res.text());
      if (!market) throw new Error('invalid data');
      return { rates: toAppRates(market, prevSyp), market, source: src.name };
    } catch (err) {
      errors.push(`${src.name}: ${err.message}`);
    }
  }
  const e = new Error('ERR_RATES_OFFLINE');
  e.detail = errors.join('; ');
  throw e;
}

// v1.12: kripto para piyasa fiyatı (1 birim = ? USD). Birinci kaynak çalışmazsa sıradakini dener.
// v1.43: cüzdan listesindeki diğer coinler de (LTC, USDC, TRX, XRP, TON, DOGE, POL, AVAX, DASH). Zorunlu olan yalnızca
// USDT / BTC / ETH; diğerleri kaynakta varsa eklenir (yalnızca kullanılan para birimleri kaydedilir, bkz. saveRates).
const CRYPTO = ['USDT', 'BTC', 'ETH'];
const CRYPTO_EXTRA = ['USDC', 'LTC', 'TRX', 'XRP', 'TON', 'DOGE', 'POL', 'AVAX', 'DASH'];
const GECKO_IDS = {
  USDT: 'tether', BTC: 'bitcoin', ETH: 'ethereum', USDC: 'usd-coin', LTC: 'litecoin', TRX: 'tron', XRP: 'ripple',
  TON: 'the-open-network', DOGE: 'dogecoin', POL: 'polygon-ecosystem-token', AVAX: 'avalanche-2', DASH: 'dash',
};
const CRYPTO_SOURCES = [
  {
    name: 'coingecko.com',
    url: `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(GECKO_IDS).join(',')}&vs_currencies=usd`,
    parse: (j) => Object.fromEntries(Object.entries(GECKO_IDS).map(([c, id]) => [c, j?.[id]?.usd])),
  },
  {
    name: 'binance.com',
    url: 'https://api.binance.com/api/v3/ticker/price?symbols=%5B%22BTCUSDT%22,%22ETHUSDT%22%5D',
    parse: (j) => {
      const m = Object.fromEntries((Array.isArray(j) ? j : []).map((x) => [x.symbol, Number(x.price)]));
      // Binance fiyatları USDT cinsindendir; bu kaynakta USDT = 1 USD kabul edilir
      return { USDT: 1, BTC: m.BTCUSDT, ETH: m.ETHUSDT };
    },
  },
  {
    name: 'coinbase.com',
    url: 'https://api.coinbase.com/v2/exchange-rates?currency=USD',
    parse: (j) => {
      const r = j?.data?.rates || {};
      const inv = (v) => (Number(v) > 0 ? 1 / Number(v) : undefined);
      return Object.fromEntries([...CRYPTO, ...CRYPTO_EXTRA].map((c) => [c, inv(r[c])]));
    },
  },
];

// Akla yatkınlık: USDT 0,8-1,2 USD; BTC 1.000-10.000.000 USD; ETH 10-1.000.000 USD
function validCrypto(p) {
  return p && p.USDT > 0.8 && p.USDT < 1.2 && p.BTC > 1000 && p.BTC < 1e7 && p.ETH > 10 && p.ETH < 1e6;
}
// Ek coinler: pozitif ve makul aralıkta olanlar alınır (USDC 0,8-1,2)
const validExtra = (c, v) => Number.isFinite(v) && v > 0 && v < 1e7 && (c !== 'USDC' || (v > 0.8 && v < 1.2));

// fetchFn(url, opts) -> { ok, status, text() } ; dönüş: { prices: {USDT, BTC, ETH} (USD), rates: 1 USD kaç birim, source }
async function fetchCryptoPrices(fetchFn) {
  const errors = [];
  for (const src of CRYPTO_SOURCES) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller && setTimeout(() => controller.abort(), 15000);
      const res = await fetchFn(src.url, { signal: controller?.signal, headers: { Accept: 'application/json' } });
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const prices = src.parse(JSON.parse(await res.text()));
      if (!validCrypto(prices)) throw new Error('invalid data');
      for (const c of CRYPTO_EXTRA) if (!validExtra(c, Number(prices[c]))) delete prices[c];
      const rates = Object.fromEntries([...CRYPTO, ...CRYPTO_EXTRA].filter((c) => prices[c] > 0).map((c) => [c, 1 / prices[c]]));
      return { prices, rates, source: src.name };
    } catch (err) {
      errors.push(`${src.name}: ${err.message}`);
    }
  }
  const e = new Error('ERR_RATES_OFFLINE');
  e.detail = errors.join('; ');
  throw e;
}

const CRYPTO_HOSTS = CRYPTO_SOURCES.map((s) => new URL(s.url).hostname);

module.exports = { fetchOnlineRates, parseMarket, toAppRates, SOURCES, fetchCryptoPrices, CRYPTO, CRYPTO_SOURCES, CRYPTO_HOSTS };
