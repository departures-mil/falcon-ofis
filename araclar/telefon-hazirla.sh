#!/bin/sh
# Telefon www klasörünü en son yayınlanan telefon paketinden yeniden üretir (depo kökünden):
#   sh araclar/telefon-hazirla.sh <hedef-www> <yeni-sürüm>
# son telefon fopk → sürüm dizeleri (1.59.0'ın patch-srv/ui-159 yamaları 1.59.1'den beri tabanda) → patch-srv-160 (1.60).
# Eklentiler (kullanim, fatura, duyuru-falcon.js) ve index.html etiketleri telefon-yayinla.js'te eklenir. Sonra:
#   OZEL_ANAHTAR=<ozel-anahtar.pem> node araclar/telefon-yayinla.js <yeni-sürüm> <hedef-www> "notlar"
set -e
W="$1"; V="$2"; ESKI=1.67.1  # taban: son yayınlanan telefon fopk (159 yamaları içinde; eklentiler telefon-yayinla.js'te güncel kopyadan gelir)
[ -n "$W" ] && [ -n "$V" ] || { echo "kullanım: telefon-hazirla.sh <www> <sürüm>"; exit 1; }
rm -rf "$W"; mkdir -p "$W"
node -e "require('./electron/update-pack').extractPack(require('fs').readFileSync('guncelleme/telefon-$ESKI.fopk'),'$W')" >/dev/null
sed -i "s/\`$ESKI\`/\`$V\`/g" "$W"/assets/index-*.js
sed -i "s/$ESKI/$V/g" "$W"/assets/agent-baslat.js
# v1.60: müşteriler / ürün kartı / fiyat geçmişi / satır KDV (gömülü services + schema). Taban 1.60.0 olunca yama zaten içindedir (betik atlar).
for f in "$W"/assets/index-*.js; do python3 araclar/patch-srv-160.py "$f"; python3 araclar/patch-srv-161.py "$f"; python3 araclar/patch-srv-162.py "$f"; done
# v1.65: Sham Cash dekontu (gömülü services + schema; arayüz: Kasa düğmesi, süzgeç, arama, ayrıntı penceresi)
for f in "$W"/assets/index-*.js; do python3 araclar/patch-srv-165.py "$f"; done
# v1.66: fatura tahsilatı Sham Cash dekontundan (addInvoicePayment sc → sc_ref / sc_doc; aynı işlem no iki kez yazılmaz)
for f in "$W"/assets/index-*.js; do python3 araclar/patch-srv-166.py "$f"; done
for f in "$W"/assets/main-*.js; do python3 araclar/patch-ui-165.py "$f"; done
# v1.65.1: Kasa tablosunda TUTAR başlığına tıklayınca tutara göre sıralama
for f in "$W"/assets/main-*.js; do python3 araclar/patch-ui-1651.py "$f"; done
# v1.67: Sham Cash her yerde (servis: girişlerde de, elle kayda dekont, aktarımda Sham Cash kasası; arayüz: dekont ekle, kasa otomatiği)
for f in "$W"/assets/index-*.js; do python3 araclar/patch-srv-167.py "$f"; done
for f in "$W"/assets/main-*.js; do python3 araclar/patch-ui-167.py "$f"; done
# v1.67.1: Para girişi / çıkışı — dekonttan doldurma + onay (online → offline teyit, alan seçimi, sürükle-bırak, Fişten oku)
for f in "$W"/assets/main-*.js; do python3 araclar/patch-ui-1671.py "$f"; done
for f in "$W"/assets/main-*.js; do python3 araclar/patch-ui-1672.py "$f"; done
# v1.68: files.saveReceipt (Telegram dekontu bayt bayt receipts/ altına)
for f in "$W"/assets/index-*.js; do python3 araclar/patch-srv-168.py "$f"; done
echo "hazır: $W ($V)"
