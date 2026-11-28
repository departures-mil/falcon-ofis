# v1.67.2 arayüz yaması: Sham Cash dekont okuma hızı.
#  - Okuma sırasında iki ayrı saniyeli durum: «🌐 Online: 7 sn… · 📴 Offline teyit: 3 sn…» (biten taraf ✓).
#  - «⏭ Beklemeden doldur»: hazır olan okumayla alanlar hemen dolar; diğer okuma arkada sürer, bitince sonucu okuma
#    özeti tablosuna eklenir (alanlara dokunulmaz; farklıysa uyarı + Online/Offline seçimi).
#  - Form açılınca offline OCR motorları önceden hazırlanır (FalconShamDekont.warm).
#  - «Fişten oku» Sham Cash yolunda da aynı durum yazısı ve arkadan gelen sonuç.
# Masaüstü (dist/assets/index-*.js) ve telefon (assets/main-*.js) bundle'larına; önce patch-ui-1671.py uygulanmış olmalı.
# kullanım: python3 araclar/patch-ui-1672.py <bundle.js>   (zaten yamalıysa atlar)
import re, sys

f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'D.canSkip' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)
if 'function FalconScApply(' not in s:
    sys.exit('önce patch-ui-1671.py uygulanmalı: ' + f)


def rep(a, b):
    global s
    n = s.count(a)
    if n != 1:
        sys.exit('desen %d kez: %s' % (n, a[:90]))
    s = s.replace(a, b)


m = re.search(r'function FalconScDocAttach\(\{v:v,sv:sv,form:fm\}\)\{let D=window\.FalconShamDekont,\{toast:toast\}=[\w$]+\(\),\[bz,setBz\]=\(0,([\w$]+)\.useState\)', s)
if not m:
    sys.exit('FalconScDocAttach bulunamadı')
RX = m.group(1)

# 1) saniyeli durum yazısı
rep("onStep:k=>setBz(k===`online`?L(`fStepOn`):L(`fStepOn`)+` · `+L(`fStepOff`))",
    "onStep:(k,x)=>setBz(typeof x===`string`&&x?x:k===`online`?L(`fStepOn`):L(`fStepOn`)+` · `+L(`fStepOff`))")
# 2) arkadan gelen okuma → okuma özeti
rep("r.form=!!fm;sv(ob=>Object.assign({},ob,D.formPatch(r,ob)));return!0}",
    "r.form=!!fm;sv(ob=>Object.assign({},ob,D.formPatch(r,ob)));"
    "r.late&&D.late&&r.late.then(x=>{if(!x)return;let hit=!1;sv(ob=>{let p=D.late(ob,x);if(!p)return ob;hit=!0;return Object.assign({},ob,p)});"
    "setTimeout(()=>{if(hit&&!x.offFailed&&toast)x.diffs&&x.diffs.length?toast(D.t(`fLateDiff`),`error`):toast(D.t(`fLateOk`))},0)}).catch(()=>{});return!0}")
# 3) OCR motorlarını önceden hazırla
rep("goR.current=go;", "goR.current=go;(0,%s.useEffect)(()=>{try{D&&D.warm&&D.warm()}catch(e){}},[]);" % RX)
# 4) «Beklemeden doldur» düğmesi
rep("bz?null:FalconE(`span`,{className:`muted small sc-drop-hint`},L(`dropHere`))",
    "bz?(D.canSkip&&D.canSkip()?FalconE(`button`,{type:`button`,className:`btn small ghost sc-skip`,title:L(`fSkipTip`),onClick:()=>D.skipWait()},L(`fSkip`)):null)"
    ":FalconE(`span`,{className:`muted small sc-drop-hint`},L(`dropHere`))")
# 5) «Fişten oku» Sham Cash yolu: durum yazısı
rep("sr=await SD.pick({direction:o.cur.direction,file:f})",
    "sr=await SD.pick({direction:o.cur.direction,file:f,onStep:(k,x)=>{typeof x===`string`&&x&&setMsg({cls:`ok`,text:x})}})")

open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f)
