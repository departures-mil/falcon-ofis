#!/bin/sh
# Telefon www klasörünü en son yayınlanan telefon paketinden yeniden üretir (depo kökünden):
#   sh araclar/telefon-hazirla.sh <hedef-www> <yeni-sürüm>
# son telefon fopk → sürüm dizeleri (1.59.0'ın patch-srv/ui-159 yamaları 1.59.1'den beri tabanda) → patch-srv-160 (1.60).
# Eklentiler (kullanim, fatura, duyuru-falcon.js) ve index.html etiketleri telefon-yayinla.js'te eklenir. Sonra:
#   OZEL_ANAHTAR=<ozel-anahtar.pem> node araclar/telefon-yayinla.js <yeni-sürüm> <hedef-www> "notlar"
set -e
W="$1"; V="$2"; ESKI=1.60.2  # taban: son yayınlanan telefon fopk (159 yamaları içinde; eklentiler telefon-yayinla.js'te güncel kopyadan gelir)
[ -n "$W" ] && [ -n "$V" ] || { echo "kullanım: telefon-hazirla.sh <www> <sürüm>"; exit 1; }
rm -rf "$W"; mkdir -p "$W"
node -e "require('./electron/update-pack').extractPack(require('fs').readFileSync('guncelleme/telefon-$ESKI.fopk'),'$W')" >/dev/null
sed -i "s/\`$ESKI\`/\`$V\`/g" "$W"/assets/index-*.js
sed -i "s/$ESKI/$V/g" "$W"/assets/agent-baslat.js
# v1.60: müşteriler / ürün kartı / fiyat geçmişi / satır KDV (gömülü services + schema). Taban 1.60.0 olunca yama zaten içindedir (betik atlar).
for f in "$W"/assets/index-*.js; do python3 araclar/patch-srv-160.py "$f"; python3 araclar/patch-srv-161.py "$f"; done
echo "hazır: $W ($V)"
