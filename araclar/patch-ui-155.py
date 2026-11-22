# Falcon Ofis 1.55 — telefon üst çubuğu tek ekrana sığar, yana kaymaz.
# Kullanım: python3 patch-ui-155.py <www klasörü>
import sys, glob, os

www = sys.argv[1]
js = glob.glob(os.path.join(www, 'assets', 'main-*.js'))[0]
css = glob.glob(os.path.join(www, 'assets', 'main-*.css'))[0]

s = open(js, encoding='utf-8').read()
old = "function Po(){let{lang:e,setLang:t}=L();return(0,I.jsxs)(`div`,{className:`lang-switch`,children:[(0,I.jsx)(Ki,{size:16,className:`muted`}),Pn.map(n=>(0,I.jsx)(`button`,{className:`lang-btn${e===n.code?` active`:``}`,onClick:()=>t(n.code),children:n.code.toUpperCase()},n.code))]})}"
new = "function Po(){let{lang:e,setLang:t}=L();return(0,I.jsxs)(d.Fragment,{children:[(0,I.jsxs)(`div`,{className:`lang-switch`,children:[(0,I.jsx)(Ki,{size:16,className:`muted`}),Pn.map(n=>(0,I.jsx)(`button`,{className:`lang-btn${e===n.code?` active`:``}`,onClick:()=>t(n.code),children:n.code.toUpperCase()},n.code))]}),(0,I.jsxs)(`label`,{className:`lang-select`,children:[(0,I.jsx)(`span`,{children:e.toUpperCase()}),(0,I.jsx)(`select`,{value:e,title:`Dil / Language / اللغة`,\"aria-label\":`Dil / Language / اللغة`,onChange:n=>t(n.target.value),children:Pn.map(n=>(0,I.jsx)(`option`,{value:n.code,children:n.code.toUpperCase()+` · `+n.label},n.code))})]})]})}"
if 'lang-select' not in s:
    assert s.count(old) == 1, 'Po bulunamadı'
    s = s.replace(old, new)
    open(js, 'w', encoding='utf-8').write(s)

# sürüm metni (1.54 paketinde 1.53.1 kalmıştı → telefon sürekli güncelleme görüyordu)
V = sys.argv[2] if len(sys.argv) > 2 else '1.55.0'
ix = glob.glob(os.path.join(www, 'assets', 'index-*.js'))[0]
t = open(ix, encoding='utf-8').read()
import re
t2 = re.sub(r"currentVersion:\(\)=>`[0-9.]+`", "currentVersion:()=>`%s`" % V, t)
t2 = re.sub(r"appInfo:async\(\)=>\(\{version:`[0-9.]+`", "appInfo:async()=>({version:`%s`" % V, t2)
assert t2.count(V) >= 2, 'sürüm metni bulunamadı'
open(ix, 'w', encoding='utf-8').write(t2)

C = r"""
/* v1.55 telefon üst çubuğu: kaydırma yok, hepsi tek ekranda */
.lang-select{display:none}
.is-mobile .topbar{gap:6px;padding:8px max(8px,env(safe-area-inset-right)) 8px max(8px,env(safe-area-inset-left));overflow:visible}
.is-mobile .topbar-title{display:none}
.is-mobile .topbar-actions{flex:1 1 auto;min-width:0;overflow:visible!important;margin:0!important;padding:0!important;gap:5px!important;justify-content:space-between;flex-wrap:nowrap}
.is-mobile .menu-btn{flex:0 1 34px;min-width:26px;width:auto}
.is-mobile .topbar-actions>*{flex:0 1 34px!important;min-width:26px;width:auto}
.is-mobile .topbar-actions>.icon-btn,.is-mobile .topbar-actions .top-act,.is-mobile .topbar-actions>.lang-select{height:34px;width:100%;min-width:0;padding:0!important;gap:0;display:inline-grid;place-items:center;border-radius:9px}
.is-mobile .topbar-actions>.top-act-wrap{display:flex}
.is-mobile .topbar-actions .top-act-label,.is-mobile .topbar-actions .fx-kbd{display:none!important}
.is-mobile .topbar-actions .top-act svg{display:block!important}
.is-mobile .topbar-actions .lan-ico{font-size:15px;line-height:1}
.is-mobile .topbar-actions>.lang-switch,.is-mobile .topbar-actions>.theme-btn,.is-mobile .topbar-actions>.win-controls{display:none!important}
.is-mobile .topbar-actions>.lang-select{position:relative;background:#02060fcc;border:1px solid var(--border);color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;overflow:hidden}
.is-mobile .topbar-actions>.lang-select select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;-webkit-appearance:none;appearance:none;border:0;font-size:16px}
.is-mobile .topbar-actions>.lang-select option{color:#e6edf7;background:#0b1220}
html.theme-light .is-mobile .topbar-actions>.lang-select{background:#f0f4fdcc}
html.theme-light .is-mobile .topbar-actions>.lang-select option{color:#0b1220;background:#fff}
.is-mobile .topbar-actions .sync-badge{top:-7px;inset-inline-end:-6px;min-width:16px;height:16px;font-size:9.5px;padding:0 4px}
.is-mobile .topbar-actions .update-dot{top:-3px;inset-inline-end:-3px}
"""
c = open(css, encoding='utf-8').read()
if 'v1.55 telefon üst çubuğu' not in c:
    open(css, 'a', encoding='utf-8').write(C)
print('tamam', os.path.basename(js), os.path.basename(css))
