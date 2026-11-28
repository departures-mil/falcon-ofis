# v1.67 arayüz yaması: Sham Cash her yerde.
#  - Kasa formu: Sham Cash bölümü artık giriş kayıtlarında da (gönderen adı / hesabı / işlem no / not); bağlı kayıtlarda da (borç, satış, aktarım …).
#  - Her Sham Cash bölümünde «📎 Sham Cash dekontu ekle (PDF / resim)»: dekont okunur (FalconShamDekont.pick), tutar / tarih / yön / karşı taraf /
#    işlem no / kasa kendiliğinden dolar; orijinal dosya kayda olduğu gibi eklenir (sunucu: saveShamCash sc_doc + sc_doc_file).
#    Kasa formu, İnfak, düzenli ödeme / düzenli İnfak — FalconScSection'ı kullanan her form.
#  - Kasa otomatik: ödeme yöntemi Sham Cash seçilince aynı para biriminin Sham Cash kasası seçilir, nakde dönünce Sham Cash olmayan kasa;
#    kasa listesinden Sham Cash kasası seçilince ödeme yöntemi Sham Cash olur.
#  - Dekonttan gelen kayıtta form dekont bilgilerini değiştirilemez olarak gösterir (yalnız Notum).
#  - Banka / diğer ödeme etiketi girişlerde de görünür. Hata metni ERR_SC_DUPLICATE (tr/en/ar).
# Masaüstü (dist/assets/index-*.js) ve telefon (assets/main-*.js) bundle'larına aynı şekilde uygulanır.
# kullanım: python3 araclar/patch-ui-167.py <bundle.js>   (zaten yamalıysa atlar)
import re, sys

f = sys.argv[1]
s = open(f, encoding='utf-8').read()
if 'FalconScDocAttach' in s:
    print('atlandı (zaten yamalı):', f); sys.exit(0)


def one(rx, src=None):
    m = list(re.finditer(rx, s if src is None else src))
    if len(m) != 1:
        sys.exit('desen %d kez: %s' % (len(m), rx[:80]))
    return m[0]


def rep(a, b):
    global s
    if s.count(a) != 1:
        sys.exit('çapa %d kez: %s' % (s.count(a), a[:80]))
    s = s.replace(a, b)


m = one(r'function FalconScSection\(\{value:v,set:sv,tx:tx\}\)\{let\{t:tr\}=([\w$]+)\(\),\{toast:toast\}=([\w$]+)\(\)')
I18, CTX = m.group(1), m.group(2)
RX = one(r'function FalconScSection\(\{value:v,set:sv,tx:tx\}\)\{[^\n]{0,400}?\[busy,setBusy\]=\(0,([\w$]+)\.useState\)').group(1)
FLD = one(r'FalconE\(([\w$]+),\{label:tr\(`shamcash\.ref`\),hint:tr\(`shamcash\.refHint`\)\}').group(1)

# 1) Kasa formu: bölüm her iki yönde + kasa listesi; kasa seçimi ödeme yöntemini ayarlar
m = one(r'([\w$]+)\.direction===`out`&&\(0,([\w$]+)\.jsx\)\(FalconScSection,\{value:\1,set:([\w$]+),tx:([\w$]+)\}\)')
U, J, SETU, TX = m.group(1), m.group(2), m.group(3), m.group(4)
m2 = one(r'\(0,%s\.jsx\)\(`select`,\{value:%s\.account_id,onChange:([\w$]+)\(`account_id`\),disabled:([\w$]+),children:([\w$]+)' % (re.escape(J), re.escape(U)))
ACCS = m2.group(3)
s = s[:m.start()] + '(0,%s.jsx)(FalconScSection,{value:%s,set:%s,tx:%s,form:!0,accounts:%s})' % (J, U, SETU, TX, ACCS) + s[m.end():]
m2 = one(r'\(0,%s\.jsx\)\(`select`,\{value:%s\.account_id,onChange:([\w$]+)\(`account_id`\),disabled:([\w$]+),children:([\w$]+)' % (re.escape(J), re.escape(U)))
s = s[:m2.start()] + '(0,%s.jsx)(`select`,{value:%s.account_id,onChange:ev=>FalconScAccChange(%s,%s,ev.target.value),disabled:%s,children:%s' % (
    J, U, SETU, ACCS, m2.group(2), ACCS) + s[m2.end():]

# 2) FalconScSection: yeni imza, dekont bölümü, girişte gönderen etiketleri, alıcı listesi / kaydı yalnız çıkışta, kasa otomatiği
a = s.find('function FalconScSection({value:v,set:sv,tx:tx}){')
b = s.find('function FalconScChip(', a)
if a < 0 or b < 0:
    sys.exit('FalconScSection sınırı bulunamadı')
sec = s[a:b]
def srep(x, y, n=1):
    global sec
    if sec.count(x) != n:
        sys.exit('bölüm çapası %d kez: %s' % (sec.count(x), x[:80]))
    sec = sec.replace(x, y)
srep('function FalconScSection({value:v,set:sv,tx:tx}){', 'function FalconScSection({value:v,set:sv,tx:tx,form:fm0,accounts:acs0}){if(tx&&tx.sc_doc)return FalconE(FalconScDocLocked,{tx:tx});')
srep('FalconPayPick(v,up,tr)', 'FalconPayPick(v,FalconScPmUp(v,up,acs0||null),tr),FalconE(FalconScDocAttach,{v:v,sv:sv,form:!!fm0})')
srep('payees.length?', 'v.direction!==`in`&&payees.length?')
srep('v.sc_account||v.sc_name?FalconE(`label`', 'v.direction!==`in`&&(v.sc_account||v.sc_name)?FalconE(`label`')
for k in ['name', 'phone', 'qr']:
    srep('label:tr(`shamcash.%s`)' % k, 'label:FalconScLbl(v,`%s`,tr)' % k)
s = s[:a] + sec + s[b:]

# 3) banka / diğer etiketi girişlerde de
rep('function FalconPayPill(t,tr){let m=t&&t.direction===`out`?t.pay_method:null;', 'function FalconPayPill(t,tr){let m=t?t.pay_method:null;')

# 4) hata metni
ERR = {'tr': 'Bu Sham Cash dekontu (aynı işlem no) zaten kayıtlı.', 'en': 'This Sham Cash receipt (same transaction no) is already recorded.',
       'ar': 'إيصال شام كاش هذا (رقم العملية نفسه) مسجَّل مسبقاً.'}
hits = [mm for mm in re.finditer(r'ERR_SAME_ACCOUNT:`([^`]*)`', s)]
if len(hits) != 3:
    sys.exit('ERR_SAME_ACCOUNT %d kez' % len(hits))
for mm in reversed(hits):
    txt = mm.group(1)
    lg = 'ar' if re.search('[؀-ۿ]', txt) else 'tr' if re.search('[ğüşıöçİ]', txt) else 'en'
    s = s[:mm.start()] + 'ERR_SC_DUPLICATE:`%s`,' % ERR[lg] + s[mm.start():]

code = (
    # girişte etiketler (gönderen)
    "function FalconScLbl(v,k,tr){if(v&&v.direction===`in`){let lg=(document.documentElement.lang||`tr`).slice(0,2),"
    "T={tr:{name:`Gönderenin adı`,phone:`Gönderenin telefonu`,qr:`Gönderenin Sham Cash QR kodu`},en:{name:`Sender's name`,phone:`Sender's phone`,qr:`Sender's Sham Cash QR code`},"
    "ar:{name:`اسم المرسل`,phone:`هاتف المرسل`,qr:`رمز QR لشام كاش الخاص بالمرسل`}};return(T[lg]||T.en)[k]}return tr(`shamcash.`+k)}"
    "function FalconScIsAcc(a){return!!(a&&/sham|شام/i.test(a.name||``))}"
    # ödeme yöntemi → kasa
    "function FalconScPmUp(v,up,acs){return pt=>{let x=Object.assign({},pt);try{if(acs&&pt.pay_method&&v.account_id!=null){let cu=acs.find(a=>String(a.id)===String(v.account_id));"
    "if(cu){let ls=acs.filter(a=>a.currency_code===cu.currency_code&&(!a.hidden||String(a.id)===String(v.account_id))),tg=pt.pay_method===`shamcash`?(FalconScIsAcc(cu)?null:ls.find(FalconScIsAcc)):(FalconScIsAcc(cu)?ls.find(a=>!FalconScIsAcc(a)):null);"
    "if(tg)x.account_id=tg.id}}}catch(e){}up(x)}}"
    # kasa → ödeme yöntemi
    "function FalconScAccChange(sv,acs,id){sv(ob=>{let n=Object.assign({},ob,{account_id:id}),a=(acs||[]).find(x=>String(x.id)===String(id));"
    "if(FalconScIsAcc(a)&&n.pay_method!==`shamcash`){n.pay_method=`shamcash`;n.sc_on=!0}return n})}"
    # dekonttan gelen kayıt: değiştirilemez görünüm
    "function FalconScDocLocked({tx:t}){let{t:tr}=%(I)s(),D=window.FalconShamDekont;return FalconE(`div`,{className:`sc-box span-2 on`},"
    "FalconE(`div`,{className:`muted small`},D?D.t(`fLocked`):``),FalconE(FalconScDocRows,{tx:t,label:tr(`shamcash.note`)}))}"
    # dekont ekle
    "function FalconScDocAttach({v:v,sv:sv,form:fm}){let D=window.FalconShamDekont,{toast:toast}=%(C)s(),[bz,setBz]=(0,%(R)s.useState)(!1);if(!D||!D.pick)return null;"
    "let L=k=>D.t(k),go=async()=>{setBz(!0);let r=null;try{r=await D.pick({direction:v.direction})}catch(e){r=null}setBz(!1);if(!r)return;"
    "if(r.dup){toast&&toast(L(`fDup`),`error`);return}"
    "let pt={pay_method:`shamcash`,sc_on:!0,sc_doc:JSON.stringify(r.doc),sc_doc_file:r.file,sc_doc_ref:r.doc.ref||``};if(r.doc.ref)pt.sc_ref=r.doc.ref;"
    "if(r.other.name)pt.sc_name=r.other.name;if(r.other.account)pt.sc_account=r.other.account;if(`amount`in v&&r.amount)pt.amount=String(r.amount);"
    "if(`date`in v&&r.date)pt.date=r.date;if(fm&&r.dirKnown)pt.direction=r.direction;let msg=[];"
    "if(`account_id`in v&&r.account_id&&String(r.account_id)!==String(v.account_id)){pt.account_id=r.account_id;if(r.accountIsSham)msg.push(L(`fAcc`).replace(`{a}`,r.accountName))}"
    "if(`account_id`in v&&r.currency&&!r.accountIsSham)msg.push(L(`fCur`).split(`{c}`).join(r.currency));"
    "sv(ob=>Object.assign({},ob,pt));let bad=r.source===`none`||r.diffs&&r.diffs.length;"
    "msg.unshift(r.source===`none`?L(`fNone`):r.diffs&&r.diffs.length?L(`fReadDiff`).replace(`{f}`,r.diffs.map(L).join(`, `)):L(`fRead`));toast&&toast(msg.join(` · `),bad?`error`:void 0)},"
    "rm=()=>sv(ob=>{let n=Object.assign({},ob);delete n.sc_doc;delete n.sc_doc_file;delete n.sc_doc_ref;return n});"
    "if(v.sc_doc_file)return FalconE(`div`,{className:`sc-attach span-2`,style:{display:`flex`,gap:`8px`,alignItems:`center`,flexWrap:`wrap`,margin:`6px 0`}},"
    "FalconE(`span`,{className:`sc-logo`},`Sham Cash`),FalconE(`span`,{className:`muted`},L(`fAttached`),`:`),"
    "FalconE(`a`,{href:`#`,onClick:e=>{e.preventDefault();window.falcon&&window.falcon.files&&window.falcon.files.open(v.sc_doc_file.relPath)}},`📎 `,v.sc_doc_file.originalName||`dekont`),"
    "v.sc_doc_ref?FalconE(`span`,{dir:`ltr`,className:`muted`},`# `+v.sc_doc_ref):null,FalconE(`button`,{type:`button`,className:`btn small ghost`,onClick:rm},L(`fRemove`)));"
    "return FalconE(`div`,{className:`sc-attach span-2`,style:{margin:`6px 0`}},FalconE(`button`,{type:`button`,className:`btn small sc-attach-btn`,disabled:bz,title:L(`fAttachTip`),onClick:go},bz?L(`reading`):L(`fAttach`)))}"
) % {'I': I18, 'C': CTX, 'R': RX}
rep('function FalconScChip(', code + '\nfunction FalconScChip(')
open(f, 'w', encoding='utf-8').write(s)
print('yamalandı:', f, I18, CTX, RX, FLD, U, J, SETU, TX, ACCS)
