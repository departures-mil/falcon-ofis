'use strict';
// 1.58.2: Windows'ta güvenli app.asar takası (GitHub güncellemesi + eski kabuk köprüsü "Yeni kurulum gerekli").
// Çekirdeğin eski betiği "cmd /c" ile ayrık açılıyordu: Windows 11'de (Terminal varsayılan) her komut kendi siyah penceresinde
// açılıyordu, bekleme sayacı %N% parantez içinde hiç artmadığı için program kapanmazsa sonsuz döngüye giriyordu ve UTF-8 yazılan
// betikte "Programlarım" gibi Türkçe yollar bozuluyordu. Burada:
//  - betik wscript üzerinden GİZLİ açılır (konsol penceresi yok); yollar betiğe değil ortam değişkenlerine yazılır (Unicode güvenli),
//  - program 15 sn'de kapanmazsa zorla kapatılır, 30 sn'de her durumda devam edilir,
//  - eski dosya taşınamazsa (1.58.4) açık kalan kopyalar kapatılır, yine olmazsa dosya yerinde kopyalanıp bayt bayt doğrulanır;
//    o da olmazsa eski dosya yerinde kalır ve program eski hâliyle açılır (kayıtlar etkilenmez),
//  - adımlar %TEMP%\falcon-guncelleme.log dosyasına yazılır.
// Electron'a bağımlı değildir; CI'da (windows-latest) test/win-takas.js ile gerçek Windows'ta denenir.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function script() {
  return [
    '@echo off',
    'setlocal EnableExtensions DisableDelayedExpansion',
    'set "LOG=%TEMP%\\falcon-guncelleme.log"',
    '>>"%LOG%" echo [%DATE% %TIME%] takas basladi, PID %FCU_PID%',
    'set /a N=0',
    ':wait',
    'tasklist /FI "PID eq %FCU_PID%" /NH 2>NUL | find " %FCU_PID% " >NUL',
    'if errorlevel 1 goto gone',
    'set /a N+=1',
    'if %N% EQU 15 >>"%LOG%" echo program kapanmadi, zorla kapatiliyor',
    'if %N% EQU 15 taskkill /F /PID %FCU_PID% >NUL 2>&1',
    'if %N% GEQ 30 goto gone',
    'ping -n 2 127.0.0.1 >NUL',
    'goto wait',
    ':gone',
    'ping -n 2 127.0.0.1 >NUL',
    'set /a M=0',
    ':mv',
    'if exist "%FCU_T%.bak" del /F /Q "%FCU_T%.bak" >NUL 2>&1',
    'move /Y "%FCU_T%" "%FCU_T%.bak" >NUL 2>&1 && goto put',
    'set /a M+=1',
    // 1.58.4: açık kalan başka bir kopya (bekçi, ikinci pencere) dosyayı tutuyorsa kapatılır
    'if %M% EQU 4 if not "%FCU_IMG%"=="" >>"%LOG%" echo eski dosya kilitli, acik kalan kopyalar kapatiliyor',
    'if %M% EQU 4 if not "%FCU_IMG%"=="" taskkill /F /IM "%FCU_IMG%" >NUL 2>&1',
    'if %M% GEQ 10 goto copy',
    'ping -n 2 127.0.0.1 >NUL',
    'goto mv',
    // 1.58.4: dosya silinmeye/taşınmaya kapalı biçimde açık tutuluyorsa (ör. başka bir uygulama .asar'ı okuyor) yerinde kopyalanır:
    // önce yedek, sonra yeni dosya üzerine, sonra bayt bayt karşılaştırma; tutmazsa yedek geri konur.
    ':copy',
    '>>"%LOG%" echo eski dosya tasinamadi, kopyalanarak yerine konuyor',
    'copy /B /Y "%FCU_T%" "%FCU_T%.bak" >NUL 2>&1 || goto cfail',
    'copy /B /Y "%FCU_N%" "%FCU_T%" >NUL 2>&1 || goto crestore',
    'fc /B "%FCU_N%" "%FCU_T%" >NUL 2>&1 || goto crestore',
    'del /F /Q "%FCU_N%" >NUL 2>&1',
    'goto ok',
    ':crestore',
    '>>"%LOG%" echo kopya dogrulanamadi, eski dosya geri konuyor',
    'copy /B /Y "%FCU_T%.bak" "%FCU_T%" >NUL 2>&1',
    ':cfail',
    '>>"%LOG%" echo eski dosya degistirilemedi, program eski haliyle aciliyor',
    'goto run',
    ':put',
    'move /Y "%FCU_N%" "%FCU_T%" >NUL 2>&1 && goto ok',
    '>>"%LOG%" echo yeni dosya konamadi, eskisi geri kondu',
    'move /Y "%FCU_T%.bak" "%FCU_T%" >NUL 2>&1',
    'goto run',
    ':ok',
    '>>"%LOG%" echo yeni dosya yerine kondu',
    ':run',
    'if "%FCU_NORUN%"=="1" goto son',
    'start "" "%FCU_EXE%" %FCU_ARGS%',
    '>>"%LOG%" echo program yeniden acildi',
    ':son',
    'del /F /Q "%FCU_VBS%" >NUL 2>&1',
    'del /F /Q "%~dpn0.ps1" >NUL 2>&1',
    '(goto) 2>NUL & del "%~f0"',
  ].join('\r\n') + '\r\n';
}

const VBS = 'Set sh = CreateObject("WScript.Shell")\r\n'
  + 'sh.Run "cmd.exe /d /c """ & sh.ExpandEnvironmentStrings("%FCU_BAT%") & """", 0, False\r\n';

// o: { tmp, pid, target, next, exe, args[], noWscript, noRun, killImage }  killImage: dosya kilitliyse kapatılacak program (exe adı)  → { bat, vbs, via }   noRun: takastan sonra programı açma (kapanışta otomatik kurulum)
function start(o) {
  const id = `${o.pid}-${Date.now()}`;
  const bat = path.join(o.tmp, `falcon-takas-${id}.cmd`);
  const vbs = path.join(o.tmp, `falcon-takas-${id}.vbs`);
  const args = (o.args || []).map((a) => `"${String(a).replace(/"/g, '')}"`).join(' ');
  fs.writeFileSync(bat, script(), 'ascii');
  // VBS UTF-16 (BOM): kullanıcı adında Türkçe harf olsa da yol doğru okunur. 0 = gizli pencere, False = beklemeden dön.
  fs.writeFileSync(vbs, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(VBS, 'utf16le')]));
  const env = Object.assign({}, process.env, {
    FCU_PID: String(o.pid), FCU_T: o.target, FCU_N: o.next, FCU_EXE: o.exe, FCU_ARGS: args, FCU_BAT: bat, FCU_VBS: vbs, FCU_NORUN: o.noRun ? '1' : '0', FCU_IMG: o.killImage ? path.basename(String(o.killImage)) : '',
  });
  delete env.ELECTRON_RUN_AS_NODE;
  const ws = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
  if (!o.noWscript && fs.existsSync(ws)) {
    try {
      const c = cp.spawn(ws, ['//B', '//Nologo', vbs], { detached: true, stdio: 'ignore', windowsHide: true, env });
      c.on('error', () => {});
      c.unref();
      return { bat, vbs, via: 'wscript' };
    } catch {
      // yedek yola geç
    }
  }
  // yedek yol (wscript kapalıysa): PowerShell betiği gizli konsolda başlatır. Doğrudan ayrık "cmd /c" KULLANILMAZ: konsolsuz kalan
  // cmd'nin alt komutları (tasklist | find) ayrı pencerelerde açılıp takılıyor (1.58.0'daki siyah "find" pencereleri; CI'da da görüldü).
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const ps1 = bat.replace(/\.cmd$/, '.ps1');
  fs.writeFileSync(ps1, '\ufeff' + 'Start-Process -WindowStyle Hidden -FilePath $env:ComSpec -ArgumentList ("/d /c `"" + $env:FCU_BAT + "`"")\r\n', 'utf8');
  // PowerShell beklenerek (ayrık değil) çalıştırılır; Start-Process ile açılan cmd programdan bağımsız yaşar.
  cp.spawnSync(fs.existsSync(ps) ? ps : 'powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1],
    { stdio: 'ignore', windowsHide: true, env, timeout: 20000 });
  return { bat, vbs, via: 'powershell' };
}

module.exports = { script, start };
