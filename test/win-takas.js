// Gerçek Windows testi (CI build işi, windows-latest): electron/takas.js betiği
//  1) program kendisi kapanınca dosyayı değiştirip programı yeniden açar,
//  2) program kapanmazsa ~15 sn'de zorla kapatıp yine değiştirir,
//  3) Türkçe harfli klasörde (Programlarım) çalışır.
// Kullanım: node test/win-takas.js   (Windows dışında atlanır)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const takas = require('../electron/takas');

if (process.platform !== 'win32') { console.log('win-takas: Windows değil, atlandı'); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function run(name, holdMs, via) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'Claude Programlarım İş '));
  const target = path.join(dir, 'app.asar');
  const next = target + '.next';
  const marker = path.join(dir, 'acildi.txt');
  const writer = path.join(dir, 'yaz.js');
  fs.writeFileSync(target, 'ESKI');
  fs.writeFileSync(next, 'YENI');
  fs.writeFileSync(writer, 'require("fs").writeFileSync(process.argv[2], process.argv.slice(3).join("|"))');
  const prog = cp.spawn(process.execPath, ['-e', `setTimeout(()=>{}, ${holdMs})`], { stdio: 'ignore' });
  await sleep(500);
  const t0 = Date.now();
  const r = takas.start({ tmp: dir, pid: prog.pid, target, next, exe: process.execPath, args: [writer, marker, '--hidden'], noWscript: via === 'powershell' });
  console.log(name, 'başlatıldı:', r.via);
  while (!fs.existsSync(marker) && Date.now() - t0 < 90000) await sleep(500);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const log = fs.existsSync(path.join(os.tmpdir(), 'falcon-guncelleme.log')) ? fs.readFileSync(path.join(os.tmpdir(), 'falcon-guncelleme.log'), 'utf8').slice(-600) : '(günlük yok)';
  const fail = (m) => { console.error(`HATA ${name}: ${m}\n${log}`); process.exit(1); };
  if (!fs.existsSync(marker)) fail('program yeniden açılmadı');
  if (fs.readFileSync(target, 'utf8') !== 'YENI') fail('app.asar değişmedi');
  if (fs.readFileSync(target + '.bak', 'utf8') !== 'ESKI') fail('.bak yok');
  if (fs.existsSync(next)) fail('.next kaldı');
  if (fs.readFileSync(marker, 'utf8') !== '--hidden') fail('argümanlar yanlış: ' + fs.readFileSync(marker, 'utf8'));
  if (alive(prog.pid)) fail('eski program hâlâ açık');
  await sleep(1500);
  if (fs.existsSync(r.bat)) fail('betik silinmedi');
  console.log(`TAMAM ${name} (${r.via}) ${secs} sn`);
}

(async () => {
  await run('kendisi kapanan program', 3000, 'wscript');
  await run('kapanmayan program (zorla kapatma)', 10 * 60000, 'wscript');
  await run('yedek yol (powershell)', 3000, 'powershell');
})().catch((e) => { console.error(e); process.exit(1); });
