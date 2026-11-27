# v1.62: Fatura kâr ekleme — kalemin kârsız fiyatı ve oranı (mk: {b, r}) korunur; kârlı kalem ürün kaydının satış fiyatını
# DEĞİŞTİRMEZ (kâr bir sonraki faturada üst üste binmesin), yeni ürün açılırsa kârsız fiyatla açılır.
# Masaüstü: electron/services.js. Telefon: index-*.js (gömülü services).
# kullanım: python3 araclar/patch-srv-162.py <services.js|index-*.js>   (zaten yamalıysa atlar)
import sys

f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'v1.62 mk' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)
if 'v1.61 fx' not in s:
    sys.exit('önce patch-srv-161.py uygulanmalı: ' + f)

R = [
    ("      if (it.x && typeof it.x === 'object' && !Array.isArray(it.x)) {",
     "      // v1.62 mk: kâr eklenmiş kalemin kârsız fiyatı ve kâr oranı\n"
     "      if (it.mk && typeof it.mk === 'object' && Number.isFinite(Number(it.mk.b)) && Number(it.mk.b) >= 0 && Number.isFinite(Number(it.mk.r)) && Number(it.mk.r) > -100 && Number(it.mk.r) !== 0) row.mk = { b: Number(it.mk.b), r: Number(it.mk.r) };\n"
     "      if (it.x && typeof it.x === 'object' && !Array.isArray(it.x)) {"),
    ("? it.fx.p : it.price, cost_currency:",
     "? it.fx.p : it.mk ? it.mk.b : it.price, cost_currency:"),
    ("if (!newer && !(it.fx && it.fx.c !== cur)) setProductPrice(it.product_id, it.price, cur);",
     "if (!newer && !(it.fx && it.fx.c !== cur) && !it.mk) setProductPrice(it.product_id, it.price, cur);"),
]
for a, b in R:
    if s.count(a) != 1:
        sys.exit('çapa bulunamadı / birden çok: ' + a[:60])
    s = s.replace(a, b)
open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f)
