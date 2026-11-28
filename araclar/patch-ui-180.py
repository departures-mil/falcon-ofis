# v1.80.0: indirme penceresi — hız son birkaç saniyeden (indirici `speed` verirse o), ve indirme şekli satırı:
# «Yalnızca değişen kısımlar» / «Tam paket» · «Wi‑Fi (bilgisayardan)» / «İnternet · N bağlantı». Masaüstü index + telefon main.
import re, sys
p = sys.argv[1]; s = open(p, encoding='utf8').read()
if 'FalconDlMode' in s:
    print('ui180 zaten var', p); sys.exit(0)
if 'function FalconDlStat' not in s:
    print('ui180 FalconDlStat yok, atlandı', p); sys.exit(0)
J = re.search(r'function FalconDlText\(tr,p\)\{.*?\(0,(\w+)\.jsx\)', s).group(1)
old = re.search(r'function FalconDlStat\(p\)\{.*?\}(?=function FalconNum)', s).group(0)
new = ('function FalconDlStat(p){if(!p||p.phase!==`download`)return null;let now=Date.now(),d=Number(p.done)||0;'
       'if(!__fdl.t0||d<__fdl.last)__fdl={t0:now,last:d,sp:0,h:[[now,d]]};else if(d!==__fdl.last){__fdl.h.push([now,d]);'
       'while(__fdl.h.length>2&&now-__fdl.h[0][0]>4e3)__fdl.h.shift();let span=(now-__fdl.h[0][0])/1e3;'
       '__fdl.sp=span>=.5?(d-__fdl.h[0][1])/span:0;__fdl.last=d}'
       'let sp=typeof p.speed==`number`&&p.speed>0?p.speed:__fdl.sp,tot=Number(p.total)||0;'
       'return{pct:tot?Math.min(100,Math.round(d/tot*100)):0,done:d,total:tot,left:Math.max(0,tot-d),speed:sp}}'
       'function FalconDlMode(p){if(!p||!p.mode&&!p.src)return ``;let l=(document.documentElement.lang||`tr`).slice(0,2),'
       'T={tr:{patch:`Yalnızca değişen kısımlar`,full:`Tam paket`,lan:`Wi‑Fi (bilgisayardan)`,net:`İnternet`,conn:`bağlantı`},'
       'en:{patch:`Only the changed parts`,full:`Full package`,lan:`Wi‑Fi (from the computer)`,net:`Internet`,conn:`connections`},'
       'ar:{patch:`الأجزاء المتغيرة فقط`,full:`الحزمة كاملة`,lan:`Wi‑Fi (من الحاسوب)`,net:`الإنترنت`,conn:`اتصالات`}}[l]||{};'
       'let a=[];if(p.mode)a.push(T[p.mode]||``);if(p.src==`lan`)a.push(T.lan);else if(p.src==`net`)a.push(T.net+(p.conns>1?` · `+p.conns+` `+T.conn:``));'
       'return a.filter(Boolean).join(` · `)}')
assert s.count(old) == 1
s = s.replace(old, new)
a = 'return (0,%s.jsxs)(`span`,{className:`fdl-lines`,children:[' % J
assert s.count(a) == 1, a
s = s.replace(a, a + 'FalconDlMode(p)?(0,%s.jsx)(`span`,{className:`fdl-line`,children:(0,%s.jsx)(`span`,{className:`fdl-seg`,children:FalconDlMode(p)})}):null,' % (J, J))
open(p, 'w', encoding='utf8').write(s)
print('ui180 tamam', p)
