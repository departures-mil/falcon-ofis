#!/usr/bin/env python3
# v1.78.0: Kişi formu «Ulaşım»: her program (WhatsApp, Telegram, Conversations, Signal, normal arama) için açık/kapalı simgesi +
# alt alta «Numara» ve «@kullanıcı adı» alanları (programa özel numara; boşsa kişinin genel Telefonu geçerli). Listede simge ipucunda
# numara / @kullanıcı adı görünür; kişi aramasında da aranır. Masaüstü index-*.js ve telefon main-*.js (adlar paketten yakalanır).
#   python3 araclar/patch-ui-178.py <bundle.js>
import re, sys

p = sys.argv[1]
s = open(p, encoding='utf8').read()
if 'FalconReachEd' in s:
    print('atlandı (zaten yamalı):', p); sys.exit(0)

form = re.search(r"\(0,(\w+)\.jsx\)\((\w+),\{size:18,value:i\.contacts,onToggle:e=>a\(t=>\(\{\.\.\.t,contacts:\{\.\.\.t\.contacts,\[e\]:!t\.contacts\[e\]\}\}\)\)\}\)", s)
if not form: sys.exit('kişi formu bulunamadı: ' + p)
X, C = form.group(1), form.group(2)
dm = re.search(r"function " + re.escape(C) + r"\(\{value:e,onToggle:t,size:n=15\}\)\{let\{t:r\}=(\w+)\(\);return\(0,\w+\.jsx\)\(`div`,\{className:`contact-icons`,children:(\w+)\.map\(", s)
if not dm: sys.exit('ulaşım simgeleri bulunamadı: ' + p)
H, L = dm.group(1), dm.group(2)

comp = r"""function FalconReachTip(e,k){let x=e&&e._d&&e._d[k];return x?[x.no,x.user].filter(Boolean).map(v=>`
`+v).join(``):``}
function FalconReachEd({value:e,onChange:t}){let{t:r}=H();e=e||{};let d=e._d||{},lg=(document.documentElement.lang||`tr`).slice(0,2),
T={tr:[`Numara`,`@kullanıcı adı`,`Boşsa yukarıdaki telefon`],en:[`Number`,`@username`,`If empty, the phone above`],ar:[`الرقم`,`@اسم المستخدم`,`إذا كان فارغاً فالهاتف أعلاه`]}[lg]||[`Numara`,`@kullanıcı adı`,`Boşsa yukarıdaki telefon`],
up=(k,f,v)=>{let o={...(d[k]||{}),[f]:v},n={...e,_d:{...d,[k]:o}};if(v&&!e[k])n[k]=1;t(n)},
fix=k=>{let u=String((d[k]||{}).user||``).trim().replace(/\s+/g,``);if(u&&u[0]!==`@`)up(k,`user`,`@`+u)},
inp={width:`100%`,minWidth:0};
return(0,X.jsx)(`div`,{className:`fo-reach`,style:{display:`grid`,gridTemplateColumns:`repeat(auto-fill,minmax(210px,1fr))`,gap:`10px`},children:L.map(({key:k,label:a,color:o,Icon:s})=>{let c=!!e[k],l=a??r(`people.phoneCall`),x=d[k]||{};
return(0,X.jsxs)(`div`,{className:`fo-reach-row${c?` on`:``}`,style:{display:`flex`,gap:`8px`,alignItems:`flex-start`,padding:`8px`,borderRadius:`10px`,border:`1px solid ${c?o:`var(--border,#ffffff22)`}`,opacity:c?1:.75},children:[
(0,X.jsx)(`button`,{type:`button`,className:`contact-icon${c?` on`:``}`,style:{"--c":o,flex:`none`},title:`${l}: ${r(c?`people.contactOn`:`people.contactOff`)}`,"aria-pressed":c,onClick:()=>t({...e,[k]:c?0:1}),children:(0,X.jsx)(s,{size:18})}),
(0,X.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`5px`,flex:1,minWidth:0},children:[
(0,X.jsx)(`span`,{style:{fontSize:`12px`,fontWeight:600,color:o},children:l}),
(0,X.jsx)(`input`,{className:`fo-reach-no`,style:inp,value:x.no||``,dir:`ltr`,inputMode:`tel`,placeholder:T[0],title:T[2],onChange:v=>up(k,`no`,v.target.value)}),
k!==`phone`&&(0,X.jsx)(`input`,{className:`fo-reach-user`,style:inp,value:x.user||``,dir:`ltr`,autoCapitalize:`off`,spellCheck:!1,placeholder:T[1],onChange:v=>up(k,`user`,v.target.value),onBlur:()=>fix(k)})]})]},k)})})}
""".replace('X.', X + '.').replace('=H()', '=' + H + '()').replace('L.map', L + '.map')

# simge ipucunda programa özel numara / kullanıcı adı
tip_old = "title:`${l}: ${r(c?`people.contactOn`:`people.contactOff`)}`,\"aria-pressed\":c,onClick:t?()=>t(i):void 0"
i0 = dm.start()
seg = s[i0:i0 + 1200]
if tip_old not in seg: sys.exit('ipucu bulunamadı: ' + p)
seg = seg.replace(tip_old, "title:`${l}: ${r(c?`people.contactOn`:`people.contactOff`)}`+FalconReachTip(e,i),\"aria-pressed\":c,onClick:t?()=>t(i):void 0", 1)
s = s[:i0] + seg + s[i0 + 1200:]
s = s[:i0] + comp + s[i0:]

s = s.replace(form.group(0), "(0,%s.jsx)(FalconReachEd,{value:i.contacts,onChange:v=>a(t=>({...t,contacts:v}))})" % X, 1)
# kişi aramasında programa özel numara / @kullanıcı adı da aranır
s = s.replace("lower(name || ' ' || COALESCE(phone,'')) LIKE", "lower(name || ' ' || COALESCE(phone,'') || ' ' || COALESCE(contacts,'')) LIKE", 1)
for a, b in [("Simgeye tıklayınca açılır / kapanır.`", "Simgeye tıklayınca açılır / kapanır. Her program için ayrı numara ve @kullanıcı adı yazabilirsiniz; numara boşsa yukarıdaki telefon geçerlidir.`"),
             ("Click an icon to turn it on or off.`", "Click an icon to turn it on or off. Each app can have its own number and @username; if the number is empty, the phone above is used.`"),
             ("انقر على الأيقونة لتفعيلها أو إيقافها.`", "انقر على الأيقونة لتفعيلها أو إيقافها. يمكن كتابة رقم و@اسم مستخدم خاص بكل تطبيق؛ إذا كان الرقم فارغاً يُستخدم الهاتف أعلاه.`")]:
    s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('tamam', p, X, C, H, L)
