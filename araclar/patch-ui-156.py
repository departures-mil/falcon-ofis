# v1.56: Borç / Alacak sayfasına "Kişi bazlı toplam" kartı (masaüstü index-*.js + telefon main-*.js, ilgili css)
# kullanım: python3 araclar/patch-ui-156.py <bundle.js> [<bundle.js> ...]   ve   python3 araclar/patch-ui-156.py --css <a.css> [...]
import re, sys

TXT = {
    'tr': dict(byPerson='Kişi bazlı toplam', byPersonHint='Seçili filtreye göre her kişinin açık kalan borç ve alacak toplamı.',
               records='Kayıt', net='Net', people='kişi'),
    'en': dict(byPerson='Totals by person', byPersonHint='Each person’s remaining debt and receivable for the selected filter.',
               records='Records', net='Net', people='people'),
    'ar': dict(byPerson='الإجمالي حسب الشخص', byPersonHint='إجمالي الديون والمستحقات المتبقية لكل شخص حسب التصفية المحددة.',
               records='السجلات', net='الصافي', people='شخص'),
}

HELPER = (
    'function FalconDebtByPerson(J,t,rows,dir,Y,Ts,Es){var map={},i,d,k,g;'
    'for(i=0;i<rows.length;i++){d=rows[i];k=d.person_name||`—`;g=map[k]||(map[k]={name:k,n:0,lent:[],borrowed:[]});g.n++;'
    'g[d.direction===`borrowed`?`borrowed`:`lent`].push(d)}'
    'var list=Object.keys(map).map(function(k){return map[k]});if(!list.length)return null;'
    'var rem=function(d){return d.amount-d.paid};'
    'list.forEach(function(g){g.L=Es(g.lent,rem);g.B=Es(g.borrowed,rem);g.N={};'
    'Object.keys(g.L).forEach(function(c){g.N[c]=(g.N[c]||0)+g.L[c]});Object.keys(g.B).forEach(function(c){g.N[c]=(g.N[c]||0)-g.B[c]});'
    'g.abs=Object.keys(g.N).reduce(function(a,c){return a+Math.abs(g.N[c])},0)});'
    'list.sort(function(a,b){return b.abs-a.abs||a.name.localeCompare(b.name)});'
    'var showL=dir!==`borrowed`,showB=dir!==`lent`,showN=showL&&showB;'
    'return J.jsxs(`div`,{className:`card table-card debt-by-person`,children:['
    'J.jsxs(`div`,{className:`debt-by-person-head`,children:['
    'J.jsxs(`div`,{children:[J.jsx(`strong`,{children:t(`debts.byPerson`)}),J.jsx(`div`,{className:`muted small`,children:t(`debts.byPersonHint`)})]}),'
    'J.jsx(`span`,{className:`pill`,children:list.length+` `+t(`debts.people`)})]}),'
    'J.jsxs(`table`,{className:`table`,children:['
    'J.jsx(`thead`,{children:J.jsxs(`tr`,{children:[J.jsx(`th`,{children:t(`common.person`)}),J.jsx(`th`,{className:`num`,children:t(`debts.records`)}),'
    'showL&&J.jsx(`th`,{className:`num`,children:t(`debts.lent`)}),showB&&J.jsx(`th`,{className:`num`,children:t(`debts.borrowed`)}),'
    'showN&&J.jsx(`th`,{className:`num`,children:t(`debts.net`)})]})}),'
    'J.jsx(`tbody`,{children:list.map(function(g){return J.jsxs(`tr`,{children:[J.jsx(`td`,{children:J.jsx(`strong`,{children:g.name})}),'
    'J.jsx(`td`,{className:`num`,children:g.n}),'
    'showL&&J.jsx(`td`,{className:`num`,children:J.jsx(Ts,{totals:g.L})}),showB&&J.jsx(`td`,{className:`num`,children:J.jsx(Ts,{totals:g.B})}),'
    'showN&&J.jsx(`td`,{className:`num`,children:J.jsx(`strong`,{children:J.jsx(Ts,{totals:g.N,colored:!0})})})]},g.name)})})]})]})}\n'
)

CSS = ('\n/* v1.56 kişi bazlı borç toplamı */\n'
       '.debt-by-person-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 14px 6px}'
       '.debt-by-person-head .small{font-size:12px;margin-top:2px}'
       '.debt-by-person .table td{padding:9px 14px}'
       '.debt-by-person .cur-totals{gap:2px 12px;justify-content:flex-end}\n')


def patch_js(path):
    s = open(path, encoding='utf8').read()
    if 'FalconDebtByPerson' in s:
        print(path, 'zaten yamalı'); return
    # 1) çeviriler: üç dil bloğu
    blocks = list(re.finditer(r'debts:\{new:`([^`]*)`', s))
    assert len(blocks) == 3, (path, len(blocks))
    for m in reversed(blocks):
        v = m.group(1)
        lg = 'tr' if 'Yeni' in v else 'en' if 'New' in v else 'ar'
        ins = ''.join(f'{k}:`{t}`,' for k, t in TXT[lg].items())
        s = s[:m.start()] + 'debts:{' + ins + s[m.start() + len('debts:{'):]
    # 2) bileşen
    m = re.search(
        r'function (\w+)\(\)\{let\{t:e\}=\w+\(\),\{run:t,confirm:n\}=\w+\(\),\[r,i\]=\(0,\w+\.useState\)\(`all`\),\[a,o\]=\(0,\w+\.useState\)\(`open`\)'
        r'.{0,400}?,(\w+)=\(0,\w+\.useMemo\)\(\(\)=>\(\w+\|\|\[\]\)\.filter\(e=>\(r===`all`\|\|e\.direction===r\)&&\(a===`all`\|\|e\.status===a\)\)', s, re.S)
    assert m, path
    comp, flist = m.group(1), m.group(2)
    start = m.start()
    seg_end = s.find('function ', m.end())
    seg = s[start:seg_end]
    mm = re.search(r'summary-card red`,children:\[\(0,(\w+)\.jsx\)\(`div`,\{className:`muted`,children:e\(`debts\.weOwe`\)\}\),'
                   r'\(0,\w+\.jsx\)\(`div`,\{className:`summary-value`,children:\(0,\w+\.jsx\)\((\w+),\{totals:(\w+)\}\)', seg)
    assert mm, path
    J, Ts, mvar = mm.group(1), mm.group(2), mm.group(3)
    me = re.search(r'[,;]' + re.escape(mvar) + r'=(\w+)\(\w+\.filter\(e=>e\.direction===`borrowed`\)', seg)
    assert me, path
    Es = me.group(1)
    my = re.search(r'\(0,' + J + r'\.jsx\)\((\w+),\{value:t\.amount,code:t\.currency_code\}\)', seg)
    assert my, path
    Y = my.group(1)
    anchor = '(0,' + J + '.jsx)(`div`,{className:`card table-card`,children:' + flist + '.length?'
    assert seg.count(anchor) == 1, (path, 'anchor')
    seg = seg.replace(anchor, 'FalconDebtByPerson(' + J + ',e,' + flist + ',r,' + Y + ',' + Ts + ',' + Es + '),' + anchor)
    s = s[:start] + HELPER + seg + s[seg_end:]
    open(path, 'w', encoding='utf8').write(s)
    print(path, 'yamalandı', comp, J, Y, Ts, Es, flist)


def patch_css(path):
    s = open(path, encoding='utf8').read()
    if 'debt-by-person' in s:
        print(path, 'css zaten yamalı'); return
    open(path, 'a', encoding='utf8').write(CSS)
    print(path, 'css eklendi')


args = sys.argv[1:]
if args and args[0] == '--css':
    for p in args[1:]: patch_css(p)
else:
    for p in args: patch_js(p)
