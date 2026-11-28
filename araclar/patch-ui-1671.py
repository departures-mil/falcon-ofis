# v1.67.1 arayüz yaması: Para Girişi / Çıkışı penceresinde Sham Cash dekontundan otomatik doldurma + onay.
#  - «📎 Sham Cash dekontu ekle» ya da dekontu pencereye SÜRÜKLE-BIRAK (PDF / JPEG / PNG; dosya bayt bayt saklanır).
#  - Okuma sırası: önce online (yapay zekâ), internet yoksa offline; online okunsa bile offline da okunur ve alan alan teyit edilir.
#    Pencerede okuma yöntemi ve her alanın durumu görünür (✓ teyitli / yalnız online / yalnız offline / farklı); farklı alanda
#    kullanıcı Online ya da Offline değeri seçer.
#  - Doldurulan alanlar: Tür (SEND → Çıkış, RECEIVE → Giriş; önce «benim adlarım»), Tutar, Kasa (aynı para biriminin Sham Cash kasası),
#    Tarih (saat dekont bilgisinde), Kişiler, Alıcı / gönderen adı (Arapça aynen) ve hesabı, İşlem no, Sham Cash notu, kayıtlı alıcı.
#    Doldurulan alanlar yeşil, farklı okunanlar turuncu çerçeveli. Kayıt kendiliğinden YAPILMAZ: «Kaydet» ile eklenir, «İptal» hiçbir şey yazmaz.
#  - «Fişten oku» düğmesi Sham Cash dekontunu tanır (PDF de seçilebilir) ve aynı yoldan doldurur.
# Masaüstü (dist/assets/index-*.js) ve telefon (assets/main-*.js) bundle'larına uygulanır; önce patch-ui-167.py uygulanmış olmalı.
# kullanım: python3 araclar/patch-ui-1671.py <bundle.js>   (zaten yamalıysa atlar)
import re, sys

f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'FalconScApply' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)
if 'function FalconScDocAttach(' not in s:
    sys.exit('önce patch-ui-167.py uygulanmalı: ' + f)


def one(rx, src=None):
    m = list(re.finditer(rx, s if src is None else src))
    if len(m) != 1:
        sys.exit('desen %d kez: %s' % (len(m), rx[:80]))
    return m[0]


m = one(r'function FalconScDocAttach\(\{v:v,sv:sv,form:fm\}\)\{let D=window\.FalconShamDekont,\{toast:toast\}=([\w$]+)\(\),\[bz,setBz\]=\(0,([\w$]+)\.useState\)')
CTX, RX = m.group(1), m.group(2)

# 1) FalconScDocAttach baştan (okuma özeti, seçim, sürükle-bırak, vurgu)
a = s.find('function FalconScDocAttach(')
b = s.find('\nfunction FalconScChip(', a)
if a < 0 or b < 0:
    sys.exit('FalconScDocAttach sınırı bulunamadı')
code = (
    "function FalconScApply(r,sv,fm,toast){let D=window.FalconShamDekont;if(!r||!D)return!1;if(r.dup){toast&&toast(D.t(`fDup`),`error`);return!0}"
    "r.form=!!fm;sv(ob=>Object.assign({},ob,D.formPatch(r,ob)));return!0}"
    "function FalconScDocAttach({v:v,sv:sv,form:fm}){let D=window.FalconShamDekont,{toast:toast}=%(C)s(),[bz,setBz]=(0,%(R)s.useState)(``),box=(0,%(R)s.useRef)(null),goR=(0,%(R)s.useRef)(null);"
    "let L=k=>D?D.t(k):k,go=async file=>{setBz(L(`fReading`));let r=null;try{r=await D.pick({direction:v.direction,file:file||void 0,"
    "onStep:k=>setBz(k===`online`?L(`fStepOn`):L(`fStepOn`)+` · `+L(`fStepOff`))})}catch(e){r=null}setBz(``);if(!r)return;FalconScApply(r,sv,fm,toast)};goR.current=go;"
    # sürükle-bırak: pencerenin her yerine
    "(0,%(R)s.useEffect)(()=>{let el=box.current&&(box.current.closest(`.modal`)||box.current.closest(`form`));if(!el||!D||!D.fromDrop)return;"
    "let has=e=>e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],`Files`)>=0,"
    "ov=e=>{if(has(e)){e.preventDefault();el.classList.add(`sc-drop-on`)}},lv=e=>{if(!e.relatedTarget||!el.contains(e.relatedTarget))el.classList.remove(`sc-drop-on`)},"
    "dp=async e=>{if(!has(e))return;e.preventDefault();e.stopPropagation();el.classList.remove(`sc-drop-on`);let x=e.dataTransfer.files&&e.dataTransfer.files[0];if(!x)return;"
    "let sf=null;try{sf=await D.fromDrop(x)}catch(er){toast&&toast(L(`pdfOnly`),`error`);return}goR.current&&goR.current(sf)};"
    "el.addEventListener(`dragover`,ov);el.addEventListener(`dragleave`,lv);el.addEventListener(`drop`,dp);"
    "return()=>{el.removeEventListener(`dragover`,ov);el.removeEventListener(`dragleave`,lv);el.removeEventListener(`drop`,dp);el.classList.remove(`sc-drop-on`)}},[]);"
    # Tür sonradan değişirse karşı taraf dekonttan yeniden alınır
    "(0,%(R)s.useEffect)(()=>{if(!D||!D.redirect||!v.sc_doc_info)return;let p=D.redirect(v);p&&sv(ob=>Object.assign({},ob,p))},[v.direction]);"
    # doldurulan alanları vurgula
    "(0,%(R)s.useEffect)(()=>{if(!D||!v.sc_doc_info||!box.current)return;let el=box.current.closest(`.modal`)||box.current.closest(`form`),tm=setTimeout(()=>D.markForm&&D.markForm(el,v),80);return()=>clearTimeout(tm)},"
    "[v.sc_doc,v.sc_doc_info,v.amount,v.date,v.account_id,v.direction]);"
    "if(!D||!D.pick)return null;"
    "let rm=()=>sv(ob=>{let n=Object.assign({},ob);delete n.sc_doc;delete n.sc_doc_file;delete n.sc_doc_ref;delete n.sc_doc_info;return n});"
    "if(v.sc_doc_file){let info=v.sc_doc_info,head=FalconE(`div`,{style:{display:`flex`,gap:`8px`,alignItems:`center`,flexWrap:`wrap`}},"
    "FalconE(`span`,{className:`sc-logo`},`Sham Cash`),FalconE(`span`,{className:`muted`},L(`fAttached`),`:`),"
    "FalconE(`a`,{href:`#`,onClick:e=>{e.preventDefault();window.falcon&&window.falcon.files&&window.falcon.files.open(v.sc_doc_file.relPath)}},`📎 `,v.sc_doc_file.originalName||`dekont`),"
    "v.sc_doc_ref?FalconE(`span`,{dir:`ltr`,className:`muted`},`# `+v.sc_doc_ref):null,FalconE(`button`,{type:`button`,className:`btn small ghost`,onClick:rm},L(`fRemove`)));"
    "if(!info)return FalconE(`div`,{ref:box,className:`sc-attach span-2`,style:{margin:`6px 0`}},head);"
    "let m=D.message(info),rows=D.rows(v),cf=D.conflictText(info);"
    "return FalconE(`div`,{ref:box,className:`sc-attach sc-read span-2`},head,FalconE(`div`,{className:`sc-msg `+(m.ok?`ok`:`warn`)},m.text),"
    "cf?FalconE(`div`,{className:`sc-msg warn`},cf):null,"
    "FalconE(`table`,{},FalconE(`tbody`,{},rows.map(x=>FalconE(`tr`,{key:x.k,className:`sc-row-`+x.k},FalconE(`td`,{className:`k`},x.label),FalconE(`td`,{dir:`auto`},x.value),"
    "FalconE(`td`,{className:`s st-`+x.st},x.choices?FalconE(`span`,{className:`chs`},x.choices.map(c=>FalconE(`button`,{key:c.which,type:`button`,className:`btn small ghost sc-ch-`+c.which+(c.on?` on`:``),"
    "onClick:()=>{let p=D.choose(v,x.key||x.k,c.which);p&&sv(ob=>Object.assign({},ob,p))}},c.label))):x.stText))))),"
    "FalconE(`div`,{className:`sc-hint`},L(`filled`)))}"
    "return FalconE(`div`,{ref:box,className:`sc-attach span-2`,style:{margin:`6px 0`,display:`flex`,gap:`8px`,alignItems:`center`,flexWrap:`wrap`}},"
    "FalconE(`button`,{type:`button`,className:`btn small sc-attach-btn`,disabled:!!bz,title:L(`fAttachTip`),onClick:()=>go()},bz||L(`fAttach`)),"
    "bz?null:FalconE(`span`,{className:`muted small sc-drop-hint`},L(`dropHere`)))}"
) % {'C': CTX, 'R': RX}
s = s[:a] + code + s[b:]

# 2) «Fişten oku»: PDF de seçilebilir; Sham Cash dekontuysa aynı yoldan doldurulur (form değeri cur ile yön bilinir)
m = one(r'\(0,([\w$]+)\.jsx\)\(FalconOcrBtn,\{set:([\w$]+),accounts:([\w$]+),')
s = s[:m.start()] + '(0,%s.jsx)(FalconOcrBtn,{cur:%s,set:%s,accounts:%s,' % (m.group(1), '__CUR__', m.group(2), m.group(3)) + s[m.end():]
# cur: aynı formun durum değişkeni (FalconScSection,{value:X,set:<set>,...form:!0)
setv = m.group(2)
mm = one(r'FalconScSection,\{value:([\w$]+),set:%s,tx:[\w$]+,form:!0' % re.escape(setv))
s = s.replace('cur:__CUR__,', 'cur:%s,' % mm.group(1), 1)

A = 'await window.falcon.files.import(`image`,!1);'
if s.count(A) != 1:
    sys.exit('Fişten oku import çapası %d kez' % s.count(A))
s = s.replace(A, 'await window.falcon.files.import(window.FalconShamDekont&&window.FalconShamDekont.detect?`receipt`:`image`,!1);')
A = 'if(!files.length)return;var f=files[0];o.addReceipt('
if s.count(A) != 1:
    sys.exit('Fişten oku dosya çapası %d kez' % s.count(A))
s = s.replace(A, 'if(!files.length)return;var f=files[0];'
              'var SD=window.FalconShamDekont;if(SD&&SD.detect&&o.cur){setBusy(!0);setMsg(null);var isSc=!1;try{isSc=await SD.detect(f)}catch(e){isSc=!1}'
              'if(isSc){setMsg({cls:`ok`,text:SD.t(`ocrSham`)+` — `+SD.t(`fReading`)});var sr=null;try{sr=await SD.pick({direction:o.cur.direction,file:f})}catch(e){sr=null}setBusy(!1);'
              'if(sr){FalconScApply(sr,o.set,!0,app.toast);var mm=SD.message(SD.formPatch(Object.assign({},sr,{form:!0}),{}).sc_doc_info);setMsg({cls:mm.ok?`ok`:`warn`,text:mm.text})}else setMsg(null);return}'
              'setBusy(!1);if(/pdf/i.test(f.mime||``)||/\\.pdf$/i.test(f.originalName||``)){o.addReceipt({relPath:f.relPath,originalName:f.originalName,mime:f.mime||`application/pdf`});setMsg({cls:`warn`,text:FX.t(`ocrNothing`)});return}}'
              'o.addReceipt(')

open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f, CTX, RX, setv, mm.group(1))
