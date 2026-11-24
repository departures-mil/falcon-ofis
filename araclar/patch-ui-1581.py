# v1.58.1: masaüstü arayüz paketi (dist/assets/index-*.js) — kur kartlarında "Kur girilmedi" metni değer boyutunda (22px)
# görünüyordu (Arapçada üç satıra bölünen dev harfler). Değer yokken kartın değer kutusuna `rate-empty` sınıfı eklenir;
# görünümü dist/assets/fc-falcon.css verir (küçük, soluk metin).
# kullanım: python3 araclar/patch-ui-1581.py dist/assets/index-*.js
import sys

PAIRS = [
    ('(0,R.jsx)(`div`,{className:`rate-value`,children:r?t(r.rate,n):e(`dashboard.noRate`)})',
     '(0,R.jsx)(`div`,{className:r?`rate-value`:`rate-value rate-empty`,children:r?t(r.rate,n):e(`dashboard.noRate`)})'),
    ('(0,R.jsx)(`div`,{className:`rate-value`,children:r?.rate?',
     '(0,R.jsx)(`div`,{className:r?.rate?`rate-value`:`rate-value rate-empty`,children:r?.rate?'),
]

for path in sys.argv[1:]:
    s = open(path, encoding='utf8').read()
    for old, new in PAIRS:
        if new in s and old not in s:
            print(path, 'zaten yamalı'); continue
        assert s.count(old) == 1, (path, old, s.count(old))
        s = s.replace(old, new)
        print(path, 'yamalandı')
    open(path, 'w', encoding='utf8').write(s)
