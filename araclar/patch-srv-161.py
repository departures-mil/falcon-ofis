# v1.61: Fatura döviz çevirisi — kalemin orijinal fiyatı (fx: {p, c}) korunur; çevrilmiş kalem ürün kaydının fiyatını DEĞİŞTİRMEZ,
# yeni ürün açılırsa orijinal fiyat / para birimiyle açılır. Masaüstü: electron/services.js. Telefon: index-*.js (gömülü services).
# kullanım: python3 araclar/patch-srv-161.py <services.js|index-*.js>   (zaten yamalıysa atlar)
import sys

f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'v1.61 fx' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)

R = [
    ("      if (it.x && typeof it.x === 'object' && !Array.isArray(it.x)) {",
     "      // v1.61 fx: döviz çevrilmiş kalemin orijinal fiyatı ve para birimi\n"
     "      if (it.fx && typeof it.fx === 'object' && Number.isFinite(Number(it.fx.p)) && Number(it.fx.p) >= 0 && /^[A-Z]{3,5}$/.test(String(it.fx.c || ''))) row.fx = { p: Number(it.fx.p), c: String(it.fx.c) };\n"
     "      if (it.x && typeof it.x === 'object' && !Array.isArray(it.x)) {"),
    ("pid = saveProduct({ name: first || it.name, code, unit: it.unit || 'pcs', description: rest || null, sale_price: it.price, cost_currency: cur }).id;",
     "pid = saveProduct({ name: first || it.name, code, unit: it.unit || 'pcs', description: rest || null, sale_price: it.fx && it.fx.c !== cur && db.get('SELECT code FROM currencies WHERE code = ?', [it.fx.c]) ? it.fx.p : it.price, cost_currency: it.fx && it.fx.c !== cur && db.get('SELECT code FROM currencies WHERE code = ?', [it.fx.c]) ? it.fx.c : cur }).id;"),
    ("if (!newer) setProductPrice(it.product_id, it.price, cur);",
     "if (!newer && !(it.fx && it.fx.c !== cur)) setProductPrice(it.product_id, it.price, cur);"),
]
for a, b in R:
    if s.count(a) != 1:
        sys.exit('çapa bulunamadı / birden çok: ' + a[:60])
    s = s.replace(a, b)
open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f)
