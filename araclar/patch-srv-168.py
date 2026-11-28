# v1.68 telefon servis yaması: window.falcon.files.saveReceipt (masaüstündeki gibi) — dışarıdan gelen dekont (Telegram) baytları
# değiştirilmeden receipts/ altına yazılır (PDF / JPEG / PNG, en çok 20 MB). Telefon index-*.js bundle'ına uygulanır.
# kullanım: python3 araclar/patch-srv-168.py <index.js>   (zaten yamalıysa atlar)
import re, sys
f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'saveReceipt:' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)
m = list(re.finditer(r'files:\{import:([\w$]+)\(\(e,t\)=>([\w$]+)\(e,t\)\),', s))
if len(m) != 1: sys.exit('files çapası %d kez' % len(m))
J = m[0].group(1)
w = list(re.finditer(r'saveImage:[\w$]+\(async e=>\{.{0,300}?return ([\w$]+)\.write\(n,t\)', s))
if len(w) != 1: sys.exit('saveImage çapası %d kez' % len(w))
PE = w[0].group(1)
code = ('saveReceipt:%(J)s(async(b,nm)=>{let u=b instanceof Uint8Array?b:new Uint8Array(b),n=String(nm||``),'
        'pdf=u.length>4&&u[0]===37&&u[1]===80&&u[2]===68&&u[3]===70,jpg=u.length>3&&u[0]===255&&u[1]===216,png=u.length>3&&u[0]===137&&u[1]===80&&u[2]===78&&u[3]===71;'
        'if(!(pdf||jpg||png)||u.length>20971520)throw Error(`ERR_FILE_TYPE`);let x=pdf?`pdf`:jpg?`jpg`:`png`,mt=pdf?`application/pdf`:jpg?`image/jpeg`:`image/png`,'
        'r=`receipts/${Date.now()}-${Math.random().toString(16).slice(2,10)}.${x}`;%(PE)s.write(r,u);return{relPath:r,originalName:n||(`dekont.`+x),mime:mt}}),') % {'J': J, 'PE': PE}
s = s[:m[0].end()] + code + s[m[0].end():]
open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f, J, PE)
