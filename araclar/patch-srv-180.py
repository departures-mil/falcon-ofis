# v1.80.0 telefon index-*.js: hızlı güncelleme (dist/assets/hizli-guncelleme.js) — yama, paralel + çok kaynak, Wi‑Fi.
# __fgU telefon.json'u (m) da taşır; __fgD hizli-guncelleme.js varsa onu çağırır (yoksa eski tek akış); kurulu sürüm + APK bayrağı geçer;
# "güncelleme var" boyutu yama varsa yamanın boyutu. Zaten uygulanmışsa dokunmaz.
import sys
p = sys.argv[1]; s = open(p, encoding='utf8').read()
if 'FalconHizli' in s:
    print('180 zaten var', p); sys.exit(0)
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:90]
    s = s.replace(a, b)
rep('web:{size:Number(j.size)||0,sha256:j.sha256,sig:j.sig,parts:1,file:j.file}', 'web:{size:Number(j.size)||0,sha256:j.sha256,sig:j.sig,parts:1,file:j.file,m:j}')
rep('parts:j.apkFile?1:0,file:j.apkFile}', 'parts:j.apkFile?1:0,file:j.apkFile,m:j}')
rep('async function __fgD(o,u,c){', 'async function __fgD(o,u,c,cur,apk){if(window.FalconHizli&&window.FalconHizli.download)return window.FalconHizli.download(o,u,c,cur,apk);return __fgD0(o,u,c)}async function __fgD0(o,u,c){')
rep('if(i.gh)await __fgD(o,u,c);', 'if(i.gh)await __fgD(o,u,c,n(),r);')
rep('size:d?i.apk.size:i.web.size,', 'size:d?i.apk.size:(i.web.m&&i.web.m.patches&&i.web.m.patches[c]&&i.web.m.raw?Number(i.web.m.patches[c].size)||i.web.size:i.web.size),patch:!d&&!!(i.web.m&&i.web.m.patches&&i.web.m.patches[c]),')
open(p, 'w', encoding='utf8').write(s)
print('180 tamam', p)
