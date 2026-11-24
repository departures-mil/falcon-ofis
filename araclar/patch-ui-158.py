# v1.58: masaüstü arayüz paketi (dist/assets/index-*.js) — ortak çekirdek kuralı "ekranda tam sürüm":
# sol üstteki sürüm rozeti 1.58 yerine 1.58.0 yazar. Diğer çekirdek parçaları paketi değiştirmez (dist/assets/fc-falcon.js).
# kullanım: python3 araclar/patch-ui-158.py dist/assets/index-*.js
import sys

OLD = 'window.falcon?.appInfo().then(e=>o(e.version.replace(/\\.0$/,``)))'
NEW = 'window.falcon?.appInfo().then(e=>o(e.version))'

for path in sys.argv[1:]:
    s = open(path, encoding='utf8').read()
    if NEW in s and OLD not in s:
        print(path, 'zaten yamalı'); continue
    assert s.count(OLD) == 1, (path, s.count(OLD))
    s = s.replace(OLD, NEW)
    open(path, 'w', encoding='utf8').write(s)
    print(path, 'yamalandı')
