# Falcon Ofis Onarım — 1.58.0'da takılan güncellemeyi (siyah "find" pencereleri) onarır.
# Düzeltilmiş 1.58.2 program dosyalarını eski güncelleyicinin klasörüne (Falcon Ofis Veri\guncelleme ya da
# %APPDATA%\Falcon Ofis\guncelleme) koyar ve etkinleştirir. Kayıtlara, belgelere, PIN'e, eşitlemeye DOKUNMAZ.
# Program bir sonraki açılışta 1.58.2 ile açılır; "Yeni kurulum gerekli" → Şimdi kur, gizli ve güvenli takasla biter.
# Windows PowerShell 5.1 uyumlu. FCO_AUTO=1: pencere yok (CI testi). FCO_ROOTS: ';' ile ayrılmış hedef klasörler (test).
$ErrorActionPreference = 'Stop'
$VERSION = '1.58.2'
$ZIP_URL = '__ZIP_URL__'
$ZIP_SHA = '__ZIP_SHA256__'
$AUTO = $env:FCO_AUTO -eq '1'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

# ---------- dil ----------
$lang = 'en'
try { $c = (Get-Culture).TwoLetterISOLanguageName; if ($c -eq 'tr' -or $c -eq 'ar') { $lang = $c } } catch {}
if ($env:FCO_LANG) { $lang = $env:FCO_LANG }
$T = @{
  tr = @{ title = 'Falcon Ofis Onarım'; intro = "Takılan güncellemeyi onarır ve programı $VERSION sürümüne hazırlar.`nKayıtlarınız, belgeleriniz, PIN ve eşitleme bağlantınız korunur."
          start = 'Onar'; close = 'Kapat'; search = 'Falcon Ofis aranıyor…'; found = 'Bulunan kurulum: {0}'; notFound = 'Falcon Ofis bulunamadı. Programın klasörünü seçin (içinde "Falcon Ofis.exe" olan klasör).'
          pick = 'Falcon Ofis klasörünü seçin'; dl = 'İndiriliyor… %{0}'; dlLine = '{0} / {1} · kalan {2} · Hız {3}/sn'; verify = 'Dosya doğrulanıyor (SHA-256)…'; badHash = 'İndirilen dosya doğrulanamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.'
          write = 'Dosyalar yerleştiriliyor…'; stuck = 'Takılı kalan {0} yardımcı pencere kapatıldı.'; skipNewer = 'Bu kurulum zaten daha yeni: {0}'
          done = "Onarım tamamlandı.`n`n1) Falcon Ofis'i tamamen kapatın (saatin yanındaki simgede de duruyorsa sağ tık → Çık).`n2) Programı yeniden açın.`n3) ""Yeni kurulum gerekli"" penceresi çıkarsa Şimdi kur'a basın.`n`nBundan sonra güncellemeler Güncelle düğmesiyle tek tıkla gelir."
          fail = 'Onarım tamamlanamadı: {0}'; net = 'İnternet bağlantısı yok ya da GitHub\'a ulaşılamıyor.' }
  en = @{ title = 'Falcon Ofis Repair'; intro = "Repairs the stuck update and prepares the program for version $VERSION.`nYour records, documents, PIN and sync connection are kept."
          start = 'Repair'; close = 'Close'; search = 'Looking for Falcon Ofis…'; found = 'Installation found: {0}'; notFound = 'Falcon Ofis was not found. Choose the program folder (the one containing "Falcon Ofis.exe").'
          pick = 'Choose the Falcon Ofis folder'; dl = 'Downloading… {0}%'; dlLine = '{0} / {1} · {2} left · Speed {3}/s'; verify = 'Verifying file (SHA-256)…'; badHash = 'The downloaded file could not be verified. Check your internet connection and try again.'
          write = 'Placing files…'; stuck = 'Closed {0} stuck helper window(s).'; skipNewer = 'This installation is already newer: {0}'
          done = "Repair complete.`n`n1) Close Falcon Ofis completely (if it is in the tray next to the clock: right-click → Exit).`n2) Open the program again.`n3) If ""New installation required"" appears, press Install now.`n`nFrom now on updates arrive with one click on the Update button."
          fail = 'Repair could not be completed: {0}'; net = 'No internet connection or GitHub cannot be reached.' }
  ar = @{ title = 'إصلاح Falcon Ofis'; intro = "يُصلح التحديث المتوقف ويُجهّز البرنامج للإصدار $VERSION.`nتبقى سجلاتك ومستنداتك ورمز PIN واتصال المزامنة كما هي."
          start = 'إصلاح'; close = 'إغلاق'; search = 'جارٍ البحث عن Falcon Ofis…'; found = 'التثبيت الموجود: {0}'; notFound = 'لم يُعثر على Falcon Ofis. اختر مجلد البرنامج (المجلد الذي يحتوي على "Falcon Ofis.exe").'
          pick = 'اختر مجلد Falcon Ofis'; dl = 'جارٍ التنزيل… {0}%'; dlLine = '{0} / {1} · المتبقي {2} · السرعة {3}/ث'; verify = 'جارٍ التحقق من الملف (SHA-256)…'; badHash = 'تعذّر التحقق من الملف المُنزَّل. تحقّق من اتصال الإنترنت وحاول مرة أخرى.'
          write = 'جارٍ وضع الملفات…'; stuck = 'تم إغلاق {0} من النوافذ المساعدة العالقة.'; skipNewer = 'هذا التثبيت أحدث بالفعل: {0}'
          done = "اكتمل الإصلاح.`n`n1) أغلق Falcon Ofis تمامًا (إذا كان بجانب الساعة: انقر بزر الفأرة الأيمن ← خروج).`n2) افتح البرنامج مجددًا.`n3) إذا ظهرت نافذة ""يلزم تثبيت جديد"" فاضغط تثبيت الآن.`n`nمن الآن تصل التحديثات بنقرة واحدة على زر التحديث."
          fail = 'تعذّر إكمال الإصلاح: {0}'; net = 'لا يوجد اتصال بالإنترنت أو تعذّر الوصول إلى GitHub.' }
}[$lang]

function Fmt-MB([double]$b) {
  $s = ('{0:N1} MB' -f ($b / 1MB))
  if ($lang -eq 'tr') { $s = $s.Replace('.', '#').Replace(',', '.').Replace('#', ',') }
  return $s
}
function Compare-Ver([string]$a, [string]$b) {
  $pa = @($a.Split('.') | ForEach-Object { [int]("0$_" -replace '\D', '') })
  $pb = @($b.Split('.') | ForEach-Object { [int]("0$_" -replace '\D', '') })
  for ($i = 0; $i -lt [Math]::Max($pa.Count, $pb.Count); $i++) {
    $x = 0; $y = 0; if ($i -lt $pa.Count) { $x = $pa[$i] }; if ($i -lt $pb.Count) { $y = $pb[$i] }
    if ($x -ne $y) { if ($x -gt $y) { return 1 } else { return -1 } }
  }
  return 0
}
function Write-Utf8NoBom([string]$file, [string]$text) { [IO.File]::WriteAllText($file, $text, (New-Object Text.UTF8Encoding($false))) }

# ---------- arayüz (FCO_AUTO=1 iken yalnız konsol) ----------
$form = $null; $lblStatus = $null; $lblDetail = $null; $bar = $null; $btn = $null; $log = $null
function Say([string]$msg) {
  if ($AUTO) { Write-Host $msg; return }
  $log.AppendText($msg + "`r`n"); [Windows.Forms.Application]::DoEvents()
}
function Status([string]$main, [string]$detail, [int]$pct) {
  if ($AUTO) { if ($main) { Write-Host $main }; return }
  if ($null -ne $main) { $lblStatus.Text = $main }
  if ($null -ne $detail) { $lblDetail.Text = $detail }
  if ($pct -ge 0) { $bar.Style = 'Continuous'; $bar.Value = [Math]::Min(100, $pct) }
  [Windows.Forms.Application]::DoEvents()
}

# ---------- kurulum klasörlerini bul ----------
function Get-Roots {
  $roots = New-Object Collections.Generic.List[string]
  $add = { param($r) if ($r -and -not $roots.Contains($r)) { $roots.Add($r) } }
  if ($env:FCO_ROOTS) { foreach ($r in $env:FCO_ROOTS.Split(';')) { if ($r) { & $add $r } }; return ,$roots }
  $exeDirs = New-Object Collections.Generic.List[string]
  $addDir = { param($d) if ($d -and (Test-Path -LiteralPath (Join-Path $d 'Falcon Ofis.exe')) -and -not $exeDirs.Contains($d)) { $exeDirs.Add($d) } }
  try { Get-Process -Name 'Falcon Ofis' -ErrorAction SilentlyContinue | ForEach-Object { try { & $addDir (Split-Path -Parent $_.Path) } catch {} } } catch {}
  & $addDir (Join-Path $env:LOCALAPPDATA 'Programs\Falcon Ofis')
  & $addDir (Join-Path $env:ProgramFiles 'Falcon Ofis')
  # Masaüstü / Başlat menüsü kısayolları
  try {
    $sh = New-Object -ComObject WScript.Shell
    $places = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'), [Environment]::GetFolderPath('StartMenu'), [Environment]::GetFolderPath('CommonStartMenu'), [Environment]::GetFolderPath('Startup'))
    foreach ($p in $places) {
      if (-not $p -or -not (Test-Path -LiteralPath $p)) { continue }
      Get-ChildItem -LiteralPath $p -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*Falcon*' } | ForEach-Object {
        try { $t = $sh.CreateShortcut($_.FullName).TargetPath; if ($t) { & $addDir (Split-Path -Parent $t) } } catch {}
      }
    }
  } catch {}
  # Windows'un başlangıçta çalıştırdıkları
  foreach ($k in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run')) {
    try { $v = Get-ItemProperty -LiteralPath $k -ErrorAction SilentlyContinue; if ($v) { $v.PSObject.Properties | ForEach-Object { $s = [string]$_.Value; if ($s -match '"?([^"]*Falcon Ofis\.exe)"?') { & $addDir (Split-Path -Parent $Matches[1]) } } } } catch {}
  }
  # Sık kullanılan yerler (bir alt klasör derinliği)
  $skip = @('Windows', 'ProgramData', '$Recycle.Bin', 'System Volume Information', 'Recovery', 'PerfLogs')
  $bases = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('MyDocuments'), (Join-Path $env:USERPROFILE 'Downloads'))
  try { Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | Where-Object { $_.Root -match '^[A-Z]:\\$' } | ForEach-Object { $bases += $_.Root } } catch {}
  foreach ($base in $bases) {
    try {
      if (-not $base -or -not (Test-Path -LiteralPath $base)) { continue }
      & $addDir $base
      Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue | Where-Object { $skip -notcontains $_.Name -and $_.Name -notlike 'Program Files*' } | ForEach-Object {
        & $addDir $_.FullName
        Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue | ForEach-Object { & $addDir $_.FullName }
      }
    } catch {}
  }
  foreach ($d in $exeDirs) {
    $v = Join-Path $d 'Falcon Ofis Veri'
    if (Test-Path -LiteralPath $v) { & $add (Join-Path $v 'guncelleme') }
  }
  $ad = Join-Path $env:APPDATA 'Falcon Ofis'
  if (Test-Path -LiteralPath $ad) { & $add (Join-Path $ad 'guncelleme') }
  return ,$roots
}

# ---------- takılı kalan eski takas pencerelerini kapat ----------
function Stop-StuckHelpers {
  $n = 0
  try {
    $procs = Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name='find.exe' OR Name='tasklist.exe' OR Name='conhost.exe'" -ErrorAction SilentlyContinue
    $cmdIds = @($procs | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'fc-update-\d+\.cmd' } | ForEach-Object { $_.ProcessId })
    foreach ($p in $procs) {
      $hit = $false
      if ($p.Name -eq 'cmd.exe' -and $cmdIds -contains $p.ProcessId) { $hit = $true }
      elseif (($p.Name -eq 'find.exe' -or $p.Name -eq 'tasklist.exe') -and ($cmdIds -contains $p.ParentProcessId -or $p.CommandLine -match 'find(\.exe)?"?\s+"\d+"\s*$')) { $hit = $true }
      if ($hit) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $n++ } catch {} }
    }
  } catch {}
  return $n
}

# ---------- indir (yüzde, MB, kalan, hız) ----------
function Get-Payload {
  $dest = Join-Path $env:TEMP "falcon-ofis-onarim-$VERSION.zip"
  if ($env:FCO_ZIP) { Copy-Item -LiteralPath $env:FCO_ZIP -Destination $dest -Force; return $dest }
  if ((Test-Path -LiteralPath $dest) -and ((Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash -eq $ZIP_SHA.ToUpper())) { return $dest }
  $req = [Net.HttpWebRequest]::Create($ZIP_URL); $req.UserAgent = 'FalconOfis-Onarim'; $req.Timeout = 30000; $req.ReadWriteTimeout = 60000
  $res = $req.GetResponse(); $total = [double]$res.ContentLength
  $in = $res.GetResponseStream(); $out = [IO.File]::Create("$dest.part")
  try {
    $buf = New-Object byte[] 65536; $got = 0.0; $sw = [Diagnostics.Stopwatch]::StartNew(); $last = 0
    while (($r = $in.Read($buf, 0, $buf.Length)) -gt 0) {
      $out.Write($buf, 0, $r); $got += $r
      if ($sw.ElapsedMilliseconds - $last -ge 200 -or $got -eq $total) {
        $last = $sw.ElapsedMilliseconds
        $speed = 0.0; if ($sw.Elapsed.TotalSeconds -gt 0) { $speed = $got / $sw.Elapsed.TotalSeconds }
        $pct = 0; if ($total -gt 0) { $pct = [int](100 * $got / $total) }
        Status ($T.dl -f $pct) ($T.dlLine -f (Fmt-MB $got), (Fmt-MB $total), (Fmt-MB ([Math]::Max(0, $total - $got))), (Fmt-MB $speed)) $pct
      }
    }
  } finally { $out.Close(); $in.Close(); $res.Close() }
  Move-Item -LiteralPath "$dest.part" -Destination $dest -Force
  return $dest
}

# ---------- onarım ----------
function Invoke-Repair {
  Status $T.search '' -1
  $n = Stop-StuckHelpers; if ($n -gt 0) { Say ($T.stuck -f $n) }
  $roots = Get-Roots
  if ($roots.Count -eq 0) {
    if ($AUTO) { throw 'kurulum bulunamadı' }
    [Windows.Forms.MessageBox]::Show($form, $T.notFound, $T.title) | Out-Null
    $dlg = New-Object Windows.Forms.FolderBrowserDialog; $dlg.Description = $T.pick
    if ($dlg.ShowDialog($form) -ne 'OK') { return $false }
    $v = Join-Path $dlg.SelectedPath 'Falcon Ofis Veri'
    if (Test-Path -LiteralPath $v) { $roots.Add((Join-Path $v 'guncelleme')) } else { $roots.Add((Join-Path $env:APPDATA 'Falcon Ofis\guncelleme')) }
  }
  foreach ($r in $roots) { Say ($T.found -f (Split-Path -Parent $r)) }

  $zip = $null
  try { $zip = Get-Payload } catch { throw ($T.net + "`n" + $_.Exception.Message) }
  Status $T.verify '' 100
  $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
  if ($hash -ne $ZIP_SHA.ToUpper()) { Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue; throw $T.badHash }

  Status $T.write '' -1
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  foreach ($root in $roots) {
    New-Item -ItemType Directory -Force -Path $root | Out-Null
    $activeFile = Join-Path $root 'aktif.json'
    if (Test-Path -LiteralPath $activeFile) {
      try { $cur = (Get-Content -LiteralPath $activeFile -Raw -Encoding UTF8 | ConvertFrom-Json).version; if ($cur -and (Compare-Ver $cur $VERSION) -gt 0) { Say ($T.skipNewer -f $cur); continue } } catch {}
    }
    $tmp = Join-Path $root "$VERSION.onarim"
    $dir = Join-Path $root $VERSION
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
    [IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
    $pkg = Get-Content -LiteralPath (Join-Path $tmp 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($pkg.version -ne $VERSION -or -not (Test-Path -LiteralPath (Join-Path $tmp 'electron\takas.js'))) { throw 'paket içeriği beklenen gibi değil' }
    if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
    Rename-Item -LiteralPath $tmp -NewName $VERSION
    if (Test-Path -LiteralPath $activeFile) { Copy-Item -LiteralPath $activeFile -Destination (Join-Path $root ("aktif-onarim-oncesi-{0}.json" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())) -Force }
    Write-Utf8NoBom "$activeFile.tmp" ('{"version":"' + $VERSION + '","tries":0,"installedAt":"' + [DateTime]::UtcNow.ToString('o') + '","kaynak":"onarim"}')
    Move-Item -LiteralPath "$activeFile.tmp" -Destination $activeFile -Force
  }
  return $true
}

if ($AUTO) {
  try { if (Invoke-Repair) { Write-Host 'ONARIM TAMAM' ; exit 0 } else { exit 3 } } catch { Write-Host ('HATA: ' + $_.Exception.Message); exit 1 }
}

# ---------- pencere ----------
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$rtl = $lang -eq 'ar'
$form = New-Object Windows.Forms.Form
$form.Text = $T.title; $form.StartPosition = 'CenterScreen'; $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false
$form.ClientSize = New-Object Drawing.Size(560, 330); $form.Font = New-Object Drawing.Font('Segoe UI', 10); $form.BackColor = [Drawing.Color]::White
if ($rtl) { $form.RightToLeft = 'Yes'; $form.RightToLeftLayout = $true }
$head = New-Object Windows.Forms.Panel; $head.Dock = 'Top'; $head.Height = 54; $head.BackColor = [Drawing.Color]::FromArgb(14, 42, 71)
$ttl = New-Object Windows.Forms.Label; $ttl.Text = $T.title; $ttl.ForeColor = [Drawing.Color]::FromArgb(242, 193, 78); $ttl.Font = New-Object Drawing.Font('Segoe UI Semibold', 15); $ttl.AutoSize = $false; $ttl.Dock = 'Fill'; $ttl.TextAlign = 'MiddleCenter'
$head.Controls.Add($ttl)
$intro = New-Object Windows.Forms.Label; $intro.Text = $T.intro; $intro.SetBounds(20, 66, 520, 46)
$lblStatus = New-Object Windows.Forms.Label; $lblStatus.SetBounds(20, 118, 520, 22); $lblStatus.Font = New-Object Drawing.Font('Segoe UI Semibold', 10)
$bar = New-Object Windows.Forms.ProgressBar; $bar.SetBounds(20, 144, 520, 20); $bar.Style = 'Continuous'
$lblDetail = New-Object Windows.Forms.Label; $lblDetail.SetBounds(20, 168, 520, 20); $lblDetail.ForeColor = [Drawing.Color]::DimGray
$log = New-Object Windows.Forms.TextBox; $log.Multiline = $true; $log.ReadOnly = $true; $log.ScrollBars = 'Vertical'; $log.SetBounds(20, 194, 520, 80); $log.BackColor = [Drawing.Color]::FromArgb(245, 247, 250); $log.BorderStyle = 'FixedSingle'
$btn = New-Object Windows.Forms.Button; $btn.Text = $T.start; $btn.SetBounds(420, 286, 120, 32); $btn.BackColor = [Drawing.Color]::FromArgb(14, 42, 71); $btn.ForeColor = [Drawing.Color]::White; $btn.FlatStyle = 'Flat'
$form.Controls.AddRange(@($head, $intro, $lblStatus, $bar, $lblDetail, $log, $btn))
$script:finished = $false
$btn.Add_Click({
  if ($script:finished) { $form.Close(); return }
  $btn.Enabled = $false
  try {
    if (Invoke-Repair) {
      Status '' '' 100; $lblStatus.Text = ''; $lblDetail.Text = ''
      [Windows.Forms.MessageBox]::Show($form, $T.done, $T.title, 'OK', 'Information') | Out-Null
      Say ($T.done -replace "`n", "`r`n")
    }
  } catch {
    [Windows.Forms.MessageBox]::Show($form, ($T.fail -f $_.Exception.Message), $T.title, 'OK', 'Error') | Out-Null
    Say ($T.fail -f $_.Exception.Message)
  }
  $script:finished = $true; $btn.Text = $T.close; $btn.Enabled = $true
})
[void]$form.ShowDialog()
