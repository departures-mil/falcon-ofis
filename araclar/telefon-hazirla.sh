#!/bin/sh
# Telefon www klasörünü en son yayınlanan telefon paketinden yeniden üretir (depo kökünden):
#   sh araclar/telefon-hazirla.sh <hedef-www> <yeni-sürüm>
# 1.58.5 fopk → patch-srv-159 + patch-ui-159 (Fatura, ödeme yöntemi) → sürüm dizeleri.
# Eklentiler (kullanim, fatura, duyuru-falcon.js) ve index.html etiketleri telefon-yayinla.js'te eklenir. Sonra:
#   OZEL_ANAHTAR=<ozel-anahtar.pem> node araclar/telefon-yayinla.js <yeni-sürüm> <hedef-www> "notlar"
set -e
W="$1"; V="$2"; ESKI=1.58.5  # 1.59.1 yayınlandı: sonraki sürümde taban telefon-1.59.1.fopk (yamalar ZATEN uygulanmış — patch-*159 adımlarını atla); 1.58.5 fopk git geçmişinde
[ -n "$W" ] && [ -n "$V" ] || { echo "kullanım: telefon-hazirla.sh <www> <sürüm>"; exit 1; }
rm -rf "$W"; mkdir -p "$W"
node -e "require('./electron/update-pack').extractPack(require('fs').readFileSync('guncelleme/telefon-$ESKI.fopk'),'$W')" >/dev/null
python3 araclar/patch-srv-159.py "$W"/assets/index-*.js
python3 araclar/patch-ui-159.py "$W"/assets/main-*.js
sed -i "s/\`$ESKI\`/\`$V\`/g" "$W"/assets/index-*.js
sed -i "s/$ESKI/$V/g" "$W"/assets/agent-baslat.js
echo "hazır: $W ($V)"
