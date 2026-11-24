#!/usr/bin/env node
// Ortak çekirdeğin core.css'ini Falcon Ofis için KAPSAMLI hale getirir: dist/cekirdek/css/core.css → core-falcon.css.
// Falcon'un kendi (React) görünümü değişmesin diye her seçicinin önüne .fc-scope eklenir; yalnız çekirdeğin çizdiği
// parçalar (Ayarlar kartları, şema satırı, Güncelle düğmesi + ilerleme, ✦ düğmesi, pencereler / bildirimler katmanı) bu sınıfı taşır.
// html / body / * gibi genel kurallar atlanır ya da kapsam içine alınır; @keyframes olduğu gibi kalır.
// Çekirdek güncellenince: node araclar/cekirdek-css.js
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'dist', 'cekirdek', 'css', 'core.css');
const OUT = path.join(__dirname, '..', 'dist', 'cekirdek', 'css', 'core-falcon.css');
const S = '.fc-scope';

function splitSel(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++; else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function scopeOne(p) {
  if (/^(html|body)$/.test(p) || /^html\S*\s+body$/.test(p)) return [];
  if (p === '*') return [`${S}`, `${S} *`];
  const m = /^(html\S*)\s+(.+)$/.exec(p);
  if (m) return scopeOne(m[2]).map((x) => `${m[1]} ${x}`);
  const out = [`${S} ${p}`];
  if (/^[.[:]/.test(p) && !/^::/.test(p)) out.push(`${S}${p}`);
  return out;
}
function scopeSel(sel) { return [...new Set(splitSel(sel).flatMap(scopeOne))].join(','); }

function transform(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0, out = '';
  function block(scope) {
    let res = '';
    while (i < css.length) {
      const open = css.indexOf('{', i), close = css.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) { i = close + 1; return res; }
      if (open === -1) { i = css.length; break; }
      const head = css.slice(i, open).trim();
      i = open + 1;
      if (/^@keyframes/.test(head)) {
        let depth = 1, j = i;
        while (depth && j < css.length) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
        res += `${head}{${css.slice(i, j - 1)}}\n`; i = j; continue;
      }
      if (/^@media|^@supports/.test(head)) { const inner = block(true); if (inner.trim()) res += `${head}{\n${inner}}\n`; continue; }
      const end = css.indexOf('}', i);
      const body = css.slice(i, end).trim();
      i = end + 1;
      const sel = scope ? scopeSel(head) : head;
      if (sel && body) res += `${sel}{${body}}\n`;
    }
    return res;
  }
  out = block(true);
  return out;
}

// Falcon'da <html> yazı boyutu 16px; çekirdek rem'i 14px tabanına göre yazar → rem, 14px × --font-scale ile çözülür
const src = fs.readFileSync(SRC, 'utf8').replace(/(\d*\.?\d+)rem\b/g, (m, n) => `calc(${n} * 14px * var(--font-scale))`);
const res = `/* OTOMATİK ÜRETİLDİ (araclar/cekirdek-css.js) — kaynak: dist/cekirdek/css/core.css (ortak-cekirdek, bkz. ../VERSION).
   Her seçici .fc-scope ile kapsanır: Falcon'un kendi görünümü değişmez, yalnız çekirdeğin çizdiği parçalar etkilenir. */\n.fc-scope{line-height:1.45}\n${transform(src)}`;
fs.writeFileSync(OUT, res);
console.log('yazıldı', path.relative(process.cwd(), OUT), res.length, 'bayt');
