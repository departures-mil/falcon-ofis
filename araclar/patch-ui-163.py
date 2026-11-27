# v1.63: ürün / malzeme PDF dökümü önce ortak çıktı penceresinden geçer (cikti-falcon.js): dil seçimi → önizle ve düzelt → PDF.
# Dil değişince döküm seçilen dilin metinleriyle yeniden üretilir (Gn = dil sözlükleri, Yn = anahtar okuyucu; paketin üst kapsamında).
# kullanım: python3 araclar/patch-ui-163.py <index-*.js>   (zaten yamalıysa atlar; döküm yoksa — telefon — atlar)
import sys

f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'FalconCikti' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)
A = ("async function Vd({kind:e,category:t,categoryLabel:n,format:r,photos:i,qr:a=!1,i18n:o}){",
     "let m=Bd({title:d,subtitle:f,...u,photos:i,qr:a,dir:l,lang:c});return window.falcon.report.savePdf(m,`${p}.pdf`)}")
if s.count(A[0]) != 1 or s.count(A[1]) != 1:
    print('atlandı (döküm yok):', f); sys.exit(0)
s = s.replace(A[0], "async function Vd({kind:e,category:t,categoryLabel:n,format:r,photos:i,qr:a=!1,i18n:o,htmlOnly:hh=!1}){")
s = s.replace(A[1],
    "let m=Bd({title:d,subtitle:f,...u,photos:i,qr:a,dir:l,lang:c});if(hh)return m;"
    "if(window.FalconCikti)return window.FalconCikti.open({html:m,name:`${p}.pdf`,lang:c,regen:L=>{let T2=(k,v)=>{let x=Yn(Gn[L],k)??Yn(Gn.tr,k)??(k.startsWith(`units.`)?k.slice(6):k);if(v)for(let[y,z2]of Object.entries(v))x=x.replace(`{${y}}`,z2);return x};"
    "return Vd({kind:e,category:t,categoryLabel:t===``?T2(`export.all`):t===`-`?T2(e===`products`?`products.noCategory`:`materials.noCategory`):n,format:r,photos:i,qr:a,htmlOnly:!0,"
    "i18n:{...o,lang:L,dir:L===`ar`?`rtl`:`ltr`,t:T2,baseT:T2,formatMoney:(x,y)=>new Intl.NumberFormat(Jn[L],{minimumFractionDigits:2,maximumFractionDigits:Zn[y]??2}).format(x??0)+(y?` ${y}`:``)}})},"
    "names:(u.items||[]).map(x=>x&&x.values&&x.values.name).filter(Boolean)});"
    "return window.falcon.report.savePdf(m,`${p}.pdf`)}")
# bilinmeyen birim anahtarı ekranda "units.Adet" yerine "Adet" görünsün (faturadan açılan ürünlerin birimi)
B = "let r=Yn(Gn[t],e)??Yn(Gn.tr,e)??e;"
if s.count(B) == 1: s = s.replace(B, "let r=Yn(Gn[t],e)??Yn(Gn.tr,e)??(e.startsWith(`units.`)?e.slice(6):e);")
open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f)
