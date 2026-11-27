# v1.60: "Sor" asistanının çevrimdışı motoruna kanca (masaüstü dist/assets/index-*.js, telefon www/assets/main-*.js).
#  FA.local'in başında window.FalconAskLocal(text, ctx, range) çağrılır (dist/assets/sor-yerel-falcon.js):
#  kasa bakiyesi ve azalan / biten stok soruları tr/en/ar çevrimdışı cevaplanır; null dönerse paketin hareket motoru çalışır.
#  Eklenti yoksa ya da hata verirse hiçbir şey değişmez. İkinci kez çalıştırılırsa paket değişmez.
# kullanım: python3 araclar/patch-ui-160.py <bundle.js> [...]
import sys

OLD = 'FA.local=async function(text,ctx,range,tr){\n  var P=FA.parse(text,ctx,range)'
NEW = ('FA.local=async function(text,ctx,range,tr){\n'
       '  if(window.FalconAskLocal){try{var pre=await window.FalconAskLocal(text,ctx,range);if(pre)return pre}catch(e){}}\n'
       '  var P=FA.parse(text,ctx,range)')

for f in sys.argv[1:]:
    s = open(f, encoding='utf-8').read()
    if 'window.FalconAskLocal' in s:
        print(f, 'zaten yamalı'); continue
    assert s.count(OLD) == 1, (f, 'FA.local başı bulunamadı')
    s = s.replace(OLD, NEW)
    open(f, 'w', encoding='utf-8').write(s)
    print(f, 'yamalandı')
