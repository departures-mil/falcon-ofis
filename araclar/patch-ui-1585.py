# v1.58.5: Elektrik sayfasına Ajandam'daki "kalan süre tahmini" (dist/assets/index-*.js).
# - Sayaç yönü okumalardan anlaşılır: değerler çoğunlukla azalıyorsa ön ödemeli sayaç (kalan kWh), artıyorsa normal sayaç.
#   (Veri şeması değişmez; yeni sütun yok → Wi‑Fi / bulut eşitlemesi ve eski kayıtlar etkilenmez.)
# - Ön ödemeli sayaçta: harcama artı değer olarak gösterilir, değer artınca "yükleme" sayılır,
#   bütün aralıkların günlük ortalamasıyla "Bu hızla yaklaşık N gün yeter" (3 gün kala uyarı rengi, biterse kırmızı).
# - Okunan değerler listesinde fark: harcamada "−X", yüklemede "⬆ +X yüklendi".
# Görünüm: dist/assets/fc-falcon.css (.meter-left).
# kullanım: python3 araclar/patch-ui-1585.py dist/assets/index-*.js
import sys

HELPER = (
    'function FalconElec(t,u){let n=t.length,up=0,dn=0;'
    'for(let i=0;i<n-1;i++){let x=Number(t[i].reading)-Number(t[i+1].reading);x<0?dn++:x>0&&up++}'
    'let down=dn>0&&dn>=up,use=(o,w)=>Math.round((down?Number(o.reading)-Number(w.reading):Number(w.reading)-Number(o.reading))*100)/100,used=0,days=0;'
    'for(let i=0;i<n-1;i++){let x=use(t[i+1],t[i]),y=Tu(t[i].date,t[i+1].date);x>=0&&y>0&&(used+=x,days+=y)}'
    'let lastUsed=n>1?use(t[1],t[0]):null,lastDays=n>1?Math.max(1,Tu(t[0].date,t[1].date)):1,'
    'avg=days?used/days:lastUsed>0?lastUsed/lastDays:0,left=null;'
    'down&&avg>0&&n>1&&(left=Math.floor(Number(t[0].reading)/avg)-(u||0));'
    'let state=left===null?`ok`:left<=0?`late`:left<=3?`soon`:`ok`;'
    'return{down,use,lastUsed,avg,left,state}}'
)

TXT = {
    'tr': ('confirmDeleteReading:`Bu okunan değer silinsin mi?`}',
           'left:`Bu hızla yaklaşık {n} gün yeter`,leftOut:`Kalan elektrik bitmiş olabilir — yükleme yapın`,avg:`ortalama günde {n} kWh`,'
           'topupLine:`Son okumada {n} kWh yükleme görüldü`,resetLine:`Son okumada değer {n} kWh düştü (sayaç sıfırlanmış olabilir)`,'
           'topup:`yüklendi`,reset:`düştü`'),
    'en': ('confirmDeleteReading:`Delete this reading?`}',
           'left:`At this rate it lasts about {n} more days`,leftOut:`The remaining electricity may have run out — top up`,avg:`average {n} kWh a day`,'
           'topupLine:`A top-up of {n} kWh was seen in the last reading`,resetLine:`The value dropped by {n} kWh in the last reading (the meter may have been reset)`,'
           'topup:`topped up`,reset:`dropped`'),
    'ar': ('confirmDeleteReading:`حذف هذه القراءة؟`}',
           'left:`بهذا المعدل يكفي نحو {n} يوم`,leftOut:`ربما نفدت الكهرباء المتبقية — قم بالشحن`,avg:`المعدل {n} kWh يومياً`,'
           'topupLine:`ظهر شحن بمقدار {n} kWh في آخر قراءة`,resetLine:`انخفضت القيمة {n} kWh في آخر قراءة (ربما أُعيد ضبط العداد)`,'
           'topup:`شحن`,reset:`انخفاض`'),
}

USED_OLD = 'd!==null&&(0,R.jsxs)(`div`,{className:`small meter-used`,children:[s(`electricity.used`,{n:$(d),d:f}),` · `,s(`electricity.perDay`,{n:$(d/f)})]})'
USED_NEW = (
    'd!==null&&(d>=0?(0,R.jsxs)(`div`,{className:`small meter-used`,children:[s(`electricity.used`,{n:$(d),d:f}),` · `,s(`electricity.perDay`,{n:$(d/f)})]})'
    ':(0,R.jsx)(`div`,{className:`small meter-used meter-topup`,children:`⬆ `+s(EL.down?`electricity.topupLine`:`electricity.resetLine`,{n:$(-d)})})),'
    'EL.left!==null&&(0,R.jsxs)(`div`,{className:`small meter-left `+EL.state,children:[EL.state===`ok`?`🔋 `:`⚠️ `,'
    'EL.left<=0?s(`electricity.leftOut`):s(`electricity.left`,{n:EL.left}),` · `,s(`electricity.avg`,{n:$(EL.avg)})]})'
)

PAIRS = [
    ('function Hf({m:e,readings:t,onEdit:n,onDelete:r,onRead:i,onDeleteReading:a,onPhoto:o}){let{t:s}=z(),c=t[0],l=t[1],u=c?-Tu(c.date):null,d=c&&l?c.reading-l.reading:null,',
     HELPER + 'function Hf({m:e,readings:t,onEdit:n,onDelete:r,onRead:i,onDeleteReading:a,onPhoto:o}){let{t:s}=z(),c=t[0],l=t[1],u=c?-Tu(c.date):null,EL=FalconElec(t,u),d=c&&l?EL.lastUsed:null,'),
    (USED_OLD, USED_NEW),
    ('(0,R.jsx)(`span`,{className:`muted`,dir:`ltr`,children:r?`+${$(e.reading-r.reading)}`:``})',
     '(0,R.jsx)(`span`,{className:r&&EL.use(r,e)<0?`meter-diff up`:`muted meter-diff`,dir:`ltr`,children:r?(x=>x<0?`⬆ +${$(-x)} `+s(EL.down?`electricity.topup`:`electricity.reset`):(EL.down?`−`:`+`)+$(x))(EL.use(r,e)):``})'),
] + [(old, old[:-1] + ',' + add + '}') for old, add in TXT.values()]

for path in sys.argv[1:]:
    s = open(path, encoding='utf8').read()
    if 'function FalconElec(' in s:
        print(path, 'zaten yamalı'); continue
    for old, new in PAIRS:
        assert s.count(old) == 1, (path, old[:80], s.count(old))
        s = s.replace(old, new)
    open(path, 'w', encoding='utf8').write(s)
    print(path, 'yamalandı')
