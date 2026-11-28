# v1.65.1 arayüz yaması: Kasa ve Para Trafiği tablosunda TUTAR başlığına tıklayınca tutara göre sıralama.
# 1. tık: büyükten küçüğe (en büyük giriş en üstte), 2. tık: küçükten büyüğe (en büyük çıkış en üstte), 3. tık: tarih sırasına dönüş.
# Farklı para birimleri güncel kurla USD karşılığına çevrilerek karşılaştırılır (kur yoksa tutarın kendisi). Kayıtlar değişmez.
# Masaüstü (dist/assets/index-*.js) ve telefon (assets/main-*.js) bundle'larına aynı şekilde uygulanır.
# kullanım: python3 araclar/patch-ui-1651.py <bundle.js>   (zaten yamalıysa atlar)
import re, sys

f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'FalconAmtSortTh' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)


def one(rx):
    m = list(re.finditer(rx, s))
    if len(m) != 1:
        sys.exit('desen %d kez: %s' % (len(m), rx[:70]))
    return m[0]


# 1) Kasa bileşeni: kurlar + sıralama durumu
m = one(r'\{accounts:t,run:n,confirm:r,catLabel:i,cashCategories:a\}=([\w$]+)\(\),\[o,s\]=\(0,([\w$]+)\.useState\)\(\{account:``,direction:``')
CTXF, RX = m.group(1), m.group(2)
new = ('{accounts:t,run:n,confirm:r,catLabel:i,cashCategories:a,rates:falconRt}=%s(),[falconSrt,falconSetSrt]=(0,%s.useState)(0),'
       '[o,s]=(0,%s.useState)({account:``,direction:``' % (CTXF, RX, RX))
s = s[:m.start()] + new + s[m.end():]

# 2) TUTAR başlığı tıklanabilir + tbody sıralı liste
m = one(r'\(0,([\w$]+)\.jsx\)\(`th`,\{className:`num`,children:e\(`common\.amount`\)\}\),\(0,\1\.jsx\)\(`th`,\{\}\)\]\}\)\}\),'
        r'\(0,\1\.jsx\)\(`tbody`,\{children:v\.map\(t=>')
J = m.group(1)
new = ('FalconE(FalconAmtSortTh,{s:falconSrt,set:falconSetSrt,label:e(`common.amount`)}),(0,%s.jsx)(`th`,{})]})}),'
       '(0,%s.jsx)(`tbody`,{children:FalconSortAmt(v,falconSrt,falconRt).map(t=>' % (J, J))
s = s[:m.start()] + new + s[m.end():]

code = (
    "function FalconSortAmt(v,k,rt){if(!k||!v||v.length<2)return v;let u=x=>{let a=+x.amount||0,r=x.currency_code===`USD`?1:rt&&+rt[x.currency_code];"
    "a=r>0?a/r:a;return x.direction===`in`?a:-a};return v.map((x,i)=>[u(x),i,x]).sort((p,q)=>k===1?q[0]-p[0]||p[1]-q[1]:p[0]-q[0]||p[1]-q[1]).map(p=>p[2])}"
    "function FalconAmtSortTh({s:k,set:st,label:lb}){let lg=(document.documentElement.lang||`tr`).slice(0,2),"
    "T={tr:[`Tutara göre sırala (büyükten küçüğe)`,`Tutara göre sırala (küçükten büyüğe)`,`Tarih sırasına dön`],"
    "en:[`Sort by amount (high to low)`,`Sort by amount (low to high)`,`Back to date order`],"
    "ar:[`ترتيب حسب المبلغ (من الأكبر إلى الأصغر)`,`ترتيب حسب المبلغ (من الأصغر إلى الأكبر)`,`العودة إلى الترتيب حسب التاريخ`]}[lg]||null;"
    "T=T||[`Sort by amount (high to low)`,`Sort by amount (low to high)`,`Back to date order`];"
    "let go=()=>st((k+1)%3);"
    "return FalconE(`th`,{className:`num falcon-sort-th${k?` on`:``}`,role:`button`,tabIndex:0,title:T[k],\"aria-sort\":k===1?`descending`:k===2?`ascending`:`none`,style:{cursor:`pointer`,userSelect:`none`},"
    "onClick:go,onKeyDown:e=>{if(e.key===`Enter`||e.key===` `){e.preventDefault();go()}}},"
    "FalconE(`span`,{className:`falcon-sort-ar`,style:k?{color:`var(--accent, #3aa0ff)`}:{opacity:.45}},k===1?`▼`:k===2?`▲`:`⇅`),` `,lb)}"
)
a = 'function FalconScPayeesBtn(){'
if s.count(a) != 1:
    sys.exit('çapa %d kez: %s' % (s.count(a), a))
s = s.replace(a, code + a)
open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f, CTXF, RX, J)
