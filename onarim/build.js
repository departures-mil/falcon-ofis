#!/usr/bin/env node
// Onarım aracını üretir (CI: .github/workflows/onarim.yml). Gizli anahtar GEREKMEZ: köprü paketinin imzası programın
// açık anahtarıyla doğrulanır, içeriği zip'lenir, zip'in SHA-256'sı onarım betiğine gömülür.
// Çıktı (out/): falcon-ofis-<sürüm>-onarim.zip, FalconOfis-Onarim.cmd, FalconOfis-Onarim.zip (cmd tek başına, zip içinde)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const pack = require('../electron/update-pack');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const REPO = 'departures-mil/falcon-ofis';
const TAG = 'onarim';

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'guncelleme', 'masaustu.json'), 'utf8'));
const gz = fs.readFileSync(path.join(ROOT, 'guncelleme', meta.file));
if (pack.sha256(gz) !== meta.sha256) throw new Error('köprü paketi sha256 uyuşmuyor');
if (!pack.verify('masaustu', meta.version, meta.sha256, meta.sig)) throw new Error('köprü paketinin imzası geçersiz');

const ps = fs.readFileSync(path.join(__dirname, 'onarim.ps1'), 'utf8').replace(/^﻿/, '');
const want = /\$VERSION = '([\d.]+)'/.exec(ps)[1];
if (want !== meta.version) throw new Error(`onarim.ps1 sürümü ${want} ≠ köprü ${meta.version}`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onarim-'));
pack.extractPack(gz, tmp);
if (JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8')).version !== meta.version) throw new Error('paket sürümü');
if (!fs.existsSync(path.join(tmp, 'electron', 'takas.js'))) throw new Error('takas.js yok');

const zipName = `falcon-ofis-${meta.version}-onarim.zip`;
const zipFile = path.join(OUT, zipName);
// Belirlenimci zip (aynı paket → aynı SHA-256): sabit tarih, sıralı dosya listesi
const all = [];
(function walk(rel) { for (const n of fs.readdirSync(path.join(tmp, rel)).sort()) { const r = rel ? `${rel}/${n}` : n; if (fs.statSync(path.join(tmp, r)).isDirectory()) walk(r); else all.push(r); } })('');
const fixed = new Date('2026-11-24T00:00:00Z');
for (const r of all) fs.utimesSync(path.join(tmp, r), fixed, fixed);
execFileSync('zip', ['-qX', '-D', zipFile, '-@'], { cwd: tmp, input: all.join('\n'), env: { ...process.env, TZ: 'UTC' } });
const sha = crypto.createHash('sha256').update(fs.readFileSync(zipFile)).digest('hex');

const url = `https://github.com/${REPO}/releases/download/${TAG}/${zipName}`;
const body = ps.replace('__ZIP_URL__', url).replace('__ZIP_SHA256__', sha);
const head = [
  '@echo off',
  'set "FCO_SELF=%~f0"',
  'start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$t=[IO.File]::ReadAllText($env:FCO_SELF,[Text.Encoding]::UTF8);$i=$t.IndexOf(\'#\'+\'PS\'+\'START\');iex $t.Substring($i)"',
  'exit /b',
  '#PSSTART',
  '',
].join('\r\n');
const cmd = head + body.replace(/\r?\n/g, '\r\n');
fs.writeFileSync(path.join(OUT, 'FalconOfis-Onarim.cmd'), cmd, 'utf8');
fs.writeFileSync(path.join(OUT, 'onarim-test.ps1'), '\uFEFF' + body.replace(/\r?\n/g, '\r\n'), 'utf8'); // CI testi için (aynı betik, başlıksız)
execFileSync('zip', ['-qjX', path.join(OUT, 'FalconOfis-Onarim.zip'), path.join(OUT, 'FalconOfis-Onarim.cmd')]);
fs.writeFileSync(path.join(OUT, 'onarim.json'), JSON.stringify({ version: meta.version, zip: zipName, sha256: sha, url }, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('onarım', meta.version, zipName, fs.statSync(zipFile).size, 'bayt', sha);
