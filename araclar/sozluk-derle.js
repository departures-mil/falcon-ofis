// Sözlük derleyici: araclar/sozluk/*.tsv|*.txt + araclar/sozluk-motor.js → dist/assets/sozluk-falcon.js
//   node araclar/sozluk-derle.js
// Satır biçimi: «türkçe | english | العربية» (.txt) ya da sekmeyle (.tsv). # ile başlayan satırlar yorum. Sonra gelen dosya / satır öncekini ezer.
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'sozluk');
const lower = (s) => { const l = s.toLocaleLowerCase('tr'); return l.length === s.length ? l : s.toLowerCase(); };
const map = new Map();
for (const f of fs.readdirSync(dir).filter((x) => /\.(tsv|txt)$/.test(x)).sort()) {
  fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).forEach((ln, i) => {
    if (!ln.trim() || /^\s*#/.test(ln)) return;
    const c = (f.endsWith('.tsv') ? ln.split('\t') : ln.split('|')).map((x) => x.trim());
    if (c.length < 3 || !c[0] || !c[1] || !c[2]) throw new Error(f + ':' + (i + 1) + ' eksik sütun: ' + ln);
    map.set(lower(c[0]).replace(/\s+/g, ' '), [c[1], c[2]]);
  });
}
const data = [...map.entries()].map(([k, v]) => [k, v[0], v[1]]);
const motor = fs.readFileSync(path.join(__dirname, 'sozluk-motor.js'), 'utf8').replace(/^\/\* global LEX_DATA \*\/\n/m, '');
const out = '// OTOMATİK ÜRETİLDİ — araclar/sozluk-derle.js (kaynak: araclar/sozluk/*, araclar/sozluk-motor.js). Elle düzenlemeyin.\n' +
  '(function () {\n  var LEX_DATA = ' + JSON.stringify(data) + ';\n' + motor + '})();\n';
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'assets', 'sozluk-falcon.js'), out);
console.log('sözlük:', data.length, 'terim,', (out.length / 1024).toFixed(0), 'KB');
