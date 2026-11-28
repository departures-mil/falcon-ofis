# v1.65 arayüz yaması: Kasa'da "Sham Cash dekontu" düğmesi (dist/assets/shamcash-falcon.js açar), Sham Cash süzgeci girişleri de
# kapsar, aramada dekont alanları (sc_doc: Arapça adlar, hesaplar, işlem no), Sham Cash ayrıntı penceresinde dekont bilgileri +
# kullanıcının serbest notu (düzenlenebilir).
# Masaüstü (dist/assets/index-*.js) ve telefon (assets/main-*.js) bundle'larına aynı şekilde uygulanır.
# kullanım: python3 araclar/patch-ui-165.py <bundle.js>   (zaten yamalıysa atlar)
import re, sys

f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'FalconScDekontBtn' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)


def one(rx):
    m = list(re.finditer(rx, s))
    if len(m) != 1:
        sys.exit('desen %d kez: %s' % (len(m), rx[:70]))
    return m[0]


def rep(a, b):
    global s
    if s.count(a) != 1:
        sys.exit('çapa %d kez: %s' % (s.count(a), a[:70]))
    s = s.replace(a, b)


m = one(r'function FalconScPayeesBtn\(\)\{let\{t:tr\}=([\w$]+)\(\),\[op,setOp\]=\(0,([\w$]+)\.useState\)')
I18, RX = m.group(1), m.group(2)
CTX = one(r'function FalconScPayees\(\{onClose:onClose\}\)\{let\{t:tr\}=[\w$]+\(\),\{run:run,confirm:confirm,toast:toast\}=([\w$]+)\(\)').group(1)

# 1) "Sham Cash ile" süzgeci: çıkışlar + dekonttan gelen girişler
rep("(? = 'sc' AND t.direction = 'out' AND (t.pay_method = 'shamcash'", "(? = 'sc' AND (t.pay_method = 'shamcash'")
# 2) arama: dekonttaki gönderen / alıcı adları ve hesaplar, işlem türü, dekont notu
rep("COALESCE(t.sc_note,'')) LIKE", "COALESCE(t.sc_note,'') || ' ' || COALESCE(t.sc_doc,'')) LIKE")
# 3) Kasa araç çubuğu: dekont düğmesi
rep("FalconE(FalconScPayeesBtn,{})", "FalconE(FalconScPayeesBtn,{}),FalconE(FalconScDekontBtn,{})")
# 4) ayrıntı penceresi: dekont bilgileri + not
rep("FalconE(FalconScRow,{label:tr(`shamcash.note`),value:t.sc_note})", "FalconE(FalconScDocRows,{tx:t,label:tr(`shamcash.note`)})")

# 5) dekonttan gelen (QR'sız) harekette boş QR kutusu gösterilmez
rep("FalconE(`div`,{className:`sc-view-qr`},", "t.sc_doc&&!t.sc_qr_path?null:FalconE(`div`,{className:`sc-view-qr`},")

code = (
    "function FalconScDekontBtn(){let{refresh:rf}=%(C)s(),D=window.FalconShamDekont;window.__falconScRefresh=rf;"
    "return D?FalconE(`button`,{type:`button`,className:`btn sc-dk-btn`,title:D.t(`btnTip`),onClick:()=>D.open({refresh:rf})},FalconE(`span`,{className:`sc-logo`},`SC`),` `,D.t(`btn`)):null}"
    "function FalconScDocRows({tx:t,label:lb}){let{t:tr}=%(I)s(),{refresh:rf}=%(C)s(),D=window.FalconShamDekont,L=k=>D?D.t(k):k,"
    "[ed,setEd]=(0,%(R)s.useState)(!1),[nv,setNv]=(0,%(R)s.useState)(t.sc_note||``),[bz,setBz]=(0,%(R)s.useState)(!1),d=null;"
    "try{d=t.sc_doc?JSON.parse(t.sc_doc):null}catch(e){d=null}"
    "let row=(k,v,lt)=>v?FalconE(FalconScRow,{label:L(k),value:v,copy:k===`ref`||/account/.test(k)?v:void 0,ltr:lt}):null,"
    "save=()=>{setBz(!0);Promise.resolve(window.falcon.call(`setShamCashNote`,{id:t.id,note:nv})).then(r=>{setBz(!1);if(r&&r.ok===!1)return;t.sc_note=nv;setEd(!1);rf&&rf()},()=>setBz(!1))};"
    "return FalconE(`div`,{className:`sc-doc-wrap`},"
    "d?FalconE(`div`,{className:`sc-doc`},FalconE(`div`,{className:`sc-doc-h`},FalconE(`span`,{className:`sc-logo`},`Sham Cash`),` `,L(`docTitle`),"
    "D?FalconE(`button`,{type:`button`,className:`btn small ghost`,onClick:()=>D.openOriginal(t.id)},L(`openOriginal`)):null),"
    "row(`kind`,d.kind,!0),row(`ref`,d.ref,!0),row(`dateTime`,[d.date,d.time].filter(Boolean).join(` - `),!0),"
    "row(`from_name`,d.from_name),row(`from_account`,d.from_account,!0),row(`to_name`,d.to_name),row(`to_account`,d.to_account,!0),"
    "row(`amountCur`,[d.amount,d.currency].filter(Boolean).join(` `),!0),row(`docNote`,d.note&&d.note!==`-`?d.note:null)):null,"
    "FalconE(`div`,{className:`sc-row sc-note-row`},FalconE(`span`,{className:`muted`},d?L(`myNote`):lb),"
    "ed?FalconE(`span`,{className:`sc-note-ed`},FalconE(`input`,{value:nv,dir:`auto`,autoFocus:!0,placeholder:L(`myNotePh`),onChange:e=>setNv(e.target.value),onKeyDown:e=>{if(e.key===`Enter`)save()}}),"
    "FalconE(`button`,{type:`button`,className:`btn small primary`,disabled:bz,onClick:save},L(`save`)),FalconE(`button`,{type:`button`,className:`btn small`,onClick:()=>{setNv(t.sc_note||``);setEd(!1)}},L(`cancel`)))"
    ":FalconE(`span`,{className:`sc-val`,dir:`auto`},t.sc_note||`—`),ed?null:FalconE(`button`,{type:`button`,className:`btn small ghost`,onClick:()=>setEd(!0)},L(`editNote`))))}"
) % {'C': CTX, 'I': I18, 'R': RX}
rep('function FalconScPayeesBtn(){', code + 'function FalconScPayeesBtn(){')
open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f, I18, RX, CTX)
