# v1.59: arayüz paketine (masaüstü dist/assets/index-*.js, telefon www/assets/main-*.js)
#  - "Fatura" sekmesi (Finans grubunda Not Defteri'nin altı): sayfa düz JS eklentisi dist/assets/fatura-falcon.js'tir,
#    paket yalnız boş kutuyu açar (FalconInvoicesPage) ve window.FalconFatura.mount(kutu, app) çağırır.
#  - Para çıkışlarında ödeme yöntemi: Nakit / Sham Cash / Havale-Banka / Diğer (Sham Cash onay kutusunun yerine).
#    Aynı bölüm İnfak (hediye) formuna ve Düzenli İnfak / Aidat ödeme formuna da eklenir (kasaya yazılınca).
#  - Kasa sayfasında yönteme göre süzgeç + "ödeme yöntemine göre" toplam kartı; tabloda havale / diğer etiketi.
# kullanım: python3 araclar/patch-ui-159.py <bundle.js> [...]
import re, sys

TXT = {
    'tr': dict(
        pay=dict(method='Ödeme yöntemi', m_cash='Nakit', m_shamcash='Sham Cash', m_bank='Havale / Banka', m_other='Diğer',
                 bankRef='Havale / dekont no', otherRef='İşlem / referans no', totals='Para çıkışları — ödeme yöntemine göre',
                 f_cash='Çıkış · Nakit', f_bank='Çıkış · Havale / Banka', f_other='Çıkış · Diğer'),
        nav='Fatura', page='Ürün ve hizmet satış faturaları: PDF çıktısı, imza, tahsilat ve gelir kaydı.',
        errors=dict(ERR_INVOICE_ITEMS='En az bir kalem girin (ürün / hizmet adı).', ERR_CUSTOMER_REQUIRED='Müşteri adını yazın.',
                    ERR_INVOICE_OVERPAY='Tahsilat, faturanın kalan tutarından büyük olamaz.', ERR_INVOICE_NUMBER_TAKEN='Bu fatura numarası zaten kullanılıyor.',
                    ERR_INVOICE_HAS_PAYMENTS='Tahsilatı olan faturada bu yapılamaz — önce tahsilatları silin.',
                    ERR_INVOICE_BELOW_PAID='Yeni toplam, tahsil edilen tutardan küçük olamaz.', ERR_INVOICE_CANCELLED='İptal edilmiş faturaya tahsilat girilemez.')),
    'en': dict(
        pay=dict(method='Payment method', m_cash='Cash', m_shamcash='Sham Cash', m_bank='Bank transfer', m_other='Other',
                 bankRef='Transfer / receipt no', otherRef='Transaction / reference no', totals='Money out — by payment method',
                 f_cash='Out · Cash', f_bank='Out · Bank transfer', f_other='Out · Other'),
        nav='Invoices', page='Sales invoices for products and services: PDF output, signature, payments and income records.',
        errors=dict(ERR_INVOICE_ITEMS='Enter at least one line (product / service name).', ERR_CUSTOMER_REQUIRED='Enter the customer name.',
                    ERR_INVOICE_OVERPAY='The payment cannot exceed the invoice balance.', ERR_INVOICE_NUMBER_TAKEN='This invoice number is already in use.',
                    ERR_INVOICE_HAS_PAYMENTS='Not possible on an invoice with payments — delete the payments first.',
                    ERR_INVOICE_BELOW_PAID='The new total cannot be lower than the amount collected.', ERR_INVOICE_CANCELLED='A cancelled invoice cannot take payments.')),
    'ar': dict(
        pay=dict(method='طريقة الدفع', m_cash='نقداً', m_shamcash='شام كاش', m_bank='حوالة / بنك', m_other='أخرى',
                 bankRef='رقم الحوالة / الإيصال', otherRef='رقم العملية / المرجع', totals='المصروفات — حسب طريقة الدفع',
                 f_cash='صادر · نقداً', f_bank='صادر · حوالة / بنك', f_other='صادر · أخرى'),
        nav='الفواتير', page='فواتير مبيعات المنتجات والخدمات: ملف PDF، التوقيع، التحصيل وتسجيل الإيراد.',
        errors=dict(ERR_INVOICE_ITEMS='أدخل بنداً واحداً على الأقل (اسم المنتج / الخدمة).', ERR_CUSTOMER_REQUIRED='اكتب اسم العميل.',
                    ERR_INVOICE_OVERPAY='لا يمكن أن يتجاوز التحصيل المبلغ المتبقي من الفاتورة.', ERR_INVOICE_NUMBER_TAKEN='رقم الفاتورة هذا مستخدم من قبل.',
                    ERR_INVOICE_HAS_PAYMENTS='غير ممكن في فاتورة لها تحصيلات — احذف التحصيلات أولاً.',
                    ERR_INVOICE_BELOW_PAID='لا يمكن أن يكون الإجمالي الجديد أقل من المبلغ المحصّل.', ERR_INVOICE_CANCELLED='لا يمكن تسجيل تحصيل لفاتورة ملغاة.')),
}

HELPERS = r'''
var FALCON_PM=[`cash`,`shamcash`,`bank`,`other`];
function FalconPayPick(v,up,tr){let m=v.pay_method||(v.sc_on?`shamcash`:`cash`);return FalconE(`div`,{className:`pm-pick span-2`},FalconE(`span`,{className:`field-label`},tr(`pay.method`)),FalconE(`div`,{className:`segmented pm-seg`},...FALCON_PM.map(k=>FalconE(`button`,{type:`button`,key:k,className:(m===k?`active `:``)+`pm-`+k,onClick:()=>up({pay_method:k,sc_on:k===`shamcash`})},k===`shamcash`?FalconE(`span`,{className:`sc-logo`},`Sham Cash`):tr(`pay.m_`+k)))))}
function FalconPayExtra(v,up,tr){let m=v.pay_method;if(m!==`bank`&&m!==`other`)return null;let ch=k=>ev=>{let x=ev.target.value;up({[k]:x})};return FalconE(`div`,{className:`sc-fields form`},FalconE(__FIELD__,{label:tr(m===`bank`?`pay.bankRef`:`pay.otherRef`)},FalconE(`input`,{value:v.sc_ref||``,onChange:ch(`sc_ref`),dir:`ltr`})),FalconE(__FIELD__,{label:tr(`shamcash.note`)},FalconE(`input`,{value:v.sc_note||``,onChange:ch(`sc_note`)})))}
function FalconPayPill(t,tr){let m=t&&t.direction===`out`?t.pay_method:null;if(m!==`bank`&&m!==`other`)return null;return FalconE(`span`,{className:`pm-pill pm-`+m,title:t.sc_note||``},tr(`pay.m_`+m)+(t.sc_ref?` · `+t.sc_ref:``))}
function FalconPayFmt(n,c){let lg=document.documentElement.lang,d=c===`SYP`?0:2;try{return new Intl.NumberFormat(lg===`ar`?`ar-SY-u-nu-latn`:lg===`en`?`en-US`:`tr-TR`,{minimumFractionDigits:d,maximumFractionDigits:d}).format(n)}catch(e){return String(n)}}
function FalconPayTotals({rows:rows}){let{t:tr}=__I18N__(),by={};(rows||[]).forEach(x=>{if(x.direction!==`out`||x.info_only)return;let m=x.pay_method||(FalconScHas(x)?`shamcash`:`cash`),k=x.currency_code;(by[k]=by[k]||{})[m]=(by[k][m]||0)+x.amount});let cs=Object.keys(by);if(!cs.length)return null;return FalconE(`div`,{className:`card pm-totals`},FalconE(`div`,{className:`pm-totals-h`,key:`h`},tr(`pay.totals`)),...cs.map(c=>FalconE(`div`,{className:`pm-row`,key:c},FalconE(`b`,{key:`c`},c),...FALCON_PM.filter(m=>by[c][m]).map(m=>FalconE(`span`,{className:`pm-chip pm-`+m,key:m},tr(`pay.m_`+m)+`: `,FalconE(`span`,{dir:`ltr`},FalconPayFmt(by[c][m],c)))))))}
function FalconScFor({value:v,set:sv,txId:id,plan:pl}){let rows=__LIVE__(()=>id?__Q__(`SELECT * FROM cash_transactions WHERE id = ?`,[id]):Promise.resolve([]),[id]),ready=Array.isArray(rows);(0,__REACT__.useEffect)(()=>{if(!ready||v.sc_ready)return;let b=rows[0]||{},ini=Object.assign(FalconScInit(b),{sc_ready:!0,sc_tx:b,direction:`out`});if(!b.id&&pl&&(pl.account_no||pl.qr_path)){ini.pay_method=`shamcash`;ini.sc_account=pl.account_no||``;ini.sc_name=pl.recipient||``;ini.sc_save_payee=!1}ini.sc_on=ini.pay_method===`shamcash`;sv(ob=>Object.assign({},ob,ini));if(!b.id&&pl&&pl.qr_path)FalconScCopy(pl.qr_path).then(cp=>{if(cp)sv(ob=>Object.assign({},ob,{sc_qr:cp}))})},[ready]);if(!v.sc_ready)return null;return FalconE(FalconScSection,{value:v,set:sv,tx:v.sc_tx||{}})}
async function FalconScOut(pl){if(!pl.sc_ready)return pl;let r=Object.assign({},await FalconScPrep(pl,pl.sc_tx||{}));delete r.sc_tx;delete r.sc_ready;return r}
function FalconInvoicesPage(){let rf=(0,__REACT__.useRef)(null),app=__APP__(),ar=(0,__REACT__.useRef)(app);ar.current=app;(0,__REACT__.useEffect)(()=>{let h=null,on=!0,go=()=>{if(!on)return;if(window.FalconFatura&&rf.current)h=window.FalconFatura.mount(rf.current,{run:(a,b,c)=>ar.current.run(a,b,c),confirm:m=>ar.current.confirm(m),toast:(m,t)=>ar.current.toast(m,t)});else setTimeout(go,120)};go();return()=>{on=!1;try{h&&h()}catch(er){}}},[]);return FalconE(`div`,{ref:rf,className:`fatura-root`})}
'''

ICON = ('var FalconInvoiceIcon=__ICONF__({name:`receipt-text`,size:24,node:[[`path`,{d:`M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z`,key:`a`}],'
        '[`path`,{d:`M14 8H8`,key:`b`}],[`path`,{d:`M16 12H8`,key:`c`}],[`path`,{d:`M13 16H8`,key:`d`}]]});')


def js_obj(d):
    return '{' + ','.join('%s:`%s`' % (k, v.replace('`', '\\`')) for k, v in d.items()) + '}'


def one(s, old, new, path, what):
    n = s.count(old)
    assert n == 1, (path, what, n)
    return s.replace(old, new)


def patch(path):
    s = open(path, encoding='utf8').read()
    if 'function FalconInvoicesPage(' in s:
        print(path, 'zaten yamalı'); return
    m = re.search(r'function FalconScSection\(\{value:v,set:sv,tx:tx\}\)\{let\{t:tr\}=(\w+)\(\),\{toast:toast\}=(\w+)\(\),payees=(\w+)\(\(\)=>(\w+)\(', s)
    assert m, (path, 'names')
    I18N, APP, LIVE, Q = m.groups()
    FIELD = re.search(r'FalconE\((\w+),\{label:tr\(`shamcash\.name`\)\}', s).group(1)
    REACT = re.search(r'function FalconScChip\(\{tx:t\}\)\{let\{t:tr\}=\w+\(\),\[op,setOp\]=\(0,(\w+)\.useState\)', s).group(1)
    ICONF = re.search(r'var FalconNotesIcon=(\w+)\(\{name:', s).group(1)
    names = dict(__I18N__=I18N, __APP__=APP, __LIVE__=LIVE, __Q__=Q, __FIELD__=FIELD, __REACT__=REACT, __ICONF__=ICONF)
    helpers = HELPERS
    icon = ICON
    for k, v in names.items():
        helpers = helpers.replace(k, v); icon = icon.replace(k, v)
    print(path, names)

    # 1) çeviriler (tr / en / ar nesneleri: shamcash bloğunun önüne eklenir)
    for lg, start in (('tr', 'Sham Cash ile'), ('en', 'Sent with Sh'), ('ar', 'أُرسل عبر شا')):
        mm = re.search(r'([,;( ])(\w{1,3})\.shamcash=\{"toggle": "' + re.escape(start), s)
        assert mm, (path, lg)
        L = mm.group(2)
        T = TXT[lg]
        add = ('%s.pay=%s,%s.nav.invoices=`%s`,%s.pages.invoices=`%s`,Object.assign(%s.errors||(%s.errors={}),%s),'
               % (L, js_obj(T['pay']), L, T['nav'], L, T['page'], L, L, js_obj(T['errors'])))
        s = s[:mm.start(2)] + add + s[mm.start(2):]

    # 2) yardımcılar + simge: FalconScSection'ın hemen önüne
    s = one(s, 'function FalconScSection({value:v,set:sv,tx:tx}){', helpers + 'function FalconScSection({value:v,set:sv,tx:tx}){', path, 'helpers')
    mi = re.search(r'var FalconNotesIcon=\w+\(\{name:', s)
    s = s[:mi.start()] + icon + s[mi.start():]

    # 3) Sham Cash bölümü: onay kutusu → ödeme yöntemi seçimi; havale / diğer için işlem no + not
    s = one(s, 'FalconE(`label`,{className:`check sc-toggle`},FalconE(`input`,{type:`checkbox`,checked:!!v.sc_on,onChange:ev=>{let vv=ev.target.checked;up({sc_on:vv})}}),FalconE(`span`,{className:`sc-logo`},`Sham Cash`),FalconE(`span`,null,tr(`shamcash.toggle`))),',
            'FalconPayPick(v,up,tr),', path, 'toggle')
    s = one(s, 'tr(known?`shamcash.updatePayee`:`shamcash.savePayee`)):null):null)}function FalconScChip',
            'tr(known?`shamcash.updatePayee`:`shamcash.savePayee`)):null):FalconPayExtra(v,up,tr))}function FalconScChip', path, 'extra')
    s = one(s, 'sc_save_payee:!tx.id}}', 'sc_save_payee:!tx.id,pay_method:tx.pay_method||(FalconScHas(tx)?`shamcash`:`cash`)}}', path, 'init')
    s = one(s, 'function FalconScHas(t){return!!(t&&(', 'function FalconScHas(t){return!!(t&&(!t.pay_method||t.pay_method===`shamcash`)&&(', path, 'has')
    s = one(s, 'if(!FalconScHas(t))return null;', 'if(!FalconScHas(t))return FalconPayPill(t,tr);', path, 'chip')

    # 4) Kasa süzgeci: Sham Cash + Nakit / Havale / Diğer; parametre listesi iki öğe uzar
    s = one(s, "OR (? = 'sc' AND t.direction = 'out' AND COALESCE(t.sc_account, t.sc_name, t.sc_qr_path, t.sc_ref, t.sc_phone) IS NOT NULL))",
            "OR (? = 'sc' AND t.direction = 'out' AND (t.pay_method = 'shamcash' OR (t.pay_method IS NULL AND COALESCE(t.sc_account, t.sc_name, t.sc_qr_path, t.sc_ref, t.sc_phone) IS NOT NULL)))"
            " OR (substr(?, 1, 3) = 'pm:' AND t.direction = 'out' AND COALESCE(t.pay_method, CASE WHEN COALESCE(t.sc_account, t.sc_name, t.sc_qr_path, t.sc_ref, t.sc_phone) IS NOT NULL THEN 'shamcash' ELSE 'cash' END) = substr(?, 4)))",
            path, 'sql')
    mp = re.search(r'\[(\w)\.account,\1\.account,\1\.direction,\1\.direction,\1\.direction,', s)
    assert mp and s.count(mp.group(0)) == 1, (path, 'params')
    o = mp.group(1)
    s = s.replace(mp.group(0), mp.group(0) + '%s.direction,%s.direction,' % (o, o))
    mo = re.search(r'FalconE\(`option`,\{value:`sc`\},(\w)\(`shamcash\.filter`\)\)', s)
    assert mo, (path, 'option')
    e = mo.group(1)
    s = s[:mo.end()] + ''.join(',FalconE(`option`,{value:`pm:%s`},%s(`pay.f_%s`))' % (k, e, k) for k in ('cash', 'bank', 'other')) + s[mo.end():]
    # yönteme göre toplam kartı: Kasa tablosunun üstüne
    seg_start = mo.end()
    mt = re.compile(r'\(0,(\w+)\.jsx\)\(`div`,\{className:`card table-card`,children:(\w)(?:\?\.length|!=null&&\2\.length)').search(s, seg_start)
    assert mt and mt.start() - seg_start < 4000, (path, 'table')
    s = s[:mt.start()] + 'FalconE(FalconPayTotals,{rows:%s}),' % mt.group(2) + s[mt.start():]

    # 5) İnfak (hediye) formu
    mg = re.search(r'\[(\w),(\w)\]=\(0,\w+\.useState\)\(\{person:(\w)\.person_name\?\?``,amount:', s)
    assert mg, (path, 'gift state')
    gv, gs, ge = mg.groups()
    mgs = re.search(r'(\w)\(`saveGift`,\{id:' + ge + r'\.id,\.\.\.' + gv + r',person:\{name:' + gv + r'\.person\},newReceipts:(\w)\}', s)
    assert mgs, (path, 'gift submit')
    s = s[:mgs.start()] + '%s(`saveGift`,await FalconScOut({id:%s.id,...%s,person:{name:%s.person},newReceipts:%s})' % (mgs.group(1), ge, gv, gv, mgs.group(2)) + s[mgs.end():]
    mgc = re.search(r'(\w)\(`gifts\.recordCash`\)\]\}\),', s)
    assert mgc, (path, 'gift check')
    s = s[:mgc.end()] + '%s.record_cash&&FalconE(FalconScFor,{value:%s,set:%s,txId:%s.cash_transaction_id}),' % (gv, gv, gs, ge) + s[mgc.end():]

    # 6) Düzenli İnfak / Aidat ödeme formu
    s = one(s, 'FalconE(`input`,{type:`checkbox`,checked:fm.record_cash,onChange:flag(`record_cash`)}),` `,tr(`recurring.recordCash`)),',
            'FalconE(`input`,{type:`checkbox`,checked:fm.record_cash,onChange:flag(`record_cash`)}),` `,tr(`recurring.recordCash`)),fm.record_cash?FalconE(FalconScFor,{value:fm,set:setFm,txId:px.cash_transaction_id,plan:pl}):null,',
            path, 'rec form')
    s = one(s, 'return run(`saveRecurringPayment`,Object.assign({id:px.id,plan_id:pl.id},fm,{newFiles:added,removeFileIds:removed}))',
            'return FalconScOut(Object.assign({id:px.id,plan_id:pl.id},fm,{newFiles:added,removeFileIds:removed})).then(pp=>run(`saveRecurringPayment`,pp))',
            path, 'rec submit')

    # 7) Fatura sekmesi: menü + sayfa eşlemesi
    s = one(s, '{id:`notes`,path:`/notes`,icon:FalconNotesIcon,after:`electricity`}',
            '{id:`notes`,path:`/notes`,icon:FalconNotesIcon,after:`electricity`},{id:`invoices`,path:`/invoices`,icon:FalconInvoiceIcon,after:`notes`}', path, 'menu')
    s = one(s, 'notes:FalconNotesPage,', 'notes:FalconNotesPage,invoices:FalconInvoicesPage,', path, 'pages')

    open(path, 'w', encoding='utf8').write(s)
    print(path, 'yamalandı')


for p in sys.argv[1:]:
    patch(p)
