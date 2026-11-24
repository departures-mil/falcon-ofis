# CI (windows-latest): onarım betiğini Türkçe harfli sahte kurulumlarda dener. Kullanım: test-win.ps1 <out klasörü> [-Online]
param([string]$Out, [switch]$Online)
$ErrorActionPreference = 'Stop'
$Out = (Resolve-Path $Out).Path
function Fail($m) { Write-Host "TEST BAŞARISIZ: $m"; exit 1 }
$base = Join-Path $env:RUNNER_TEMP ("Test Programlarım " + [guid]::NewGuid().ToString('N').Substring(0, 6))

function New-Install($name, $activeVer) {
  $g = Join-Path $base "$name\Falcon Ofis Veri\guncelleme"
  New-Item -ItemType Directory -Force -Path (Join-Path $g '1.58.0\electron') | Out-Null
  Set-Content -LiteralPath (Join-Path $g '1.58.0\package.json') -Value '{"version":"1.58.0"}' -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $g 'aktif.json') -Value ('{"version":"' + $activeVer + '","tries":0}') -Encoding ASCII
  return $g
}
function Check-Repaired($g) {
  $pkg = Get-Content -LiteralPath (Join-Path $g '1.58.2\package.json') -Raw | ConvertFrom-Json
  if ($pkg.version -ne '1.58.2') { Fail "sürüm $($pkg.version) ($g)" }
  if (-not (Test-Path -LiteralPath (Join-Path $g '1.58.2\electron\takas.js'))) { Fail "takas.js yok ($g)" }
  if (-not (Test-Path -LiteralPath (Join-Path $g '1.58.2\electron\main.js'))) { Fail "main.js yok ($g)" }
  $bytes = [IO.File]::ReadAllBytes((Join-Path $g 'aktif.json'))
  if ($bytes[0] -eq 0xEF) { Fail 'aktif.json BOM içeriyor (Node JSON.parse bozulur)' }
  $a = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
  if ($a.version -ne '1.58.2' -or $a.tries -ne 0) { Fail "aktif.json: $($a | ConvertTo-Json -Compress)" }
  if (-not (Get-ChildItem -LiteralPath $g -Filter 'aktif-onarim-oncesi-*.json')) { Fail 'eski aktif.json yedeği yok' }
  if (Test-Path -LiteralPath (Join-Path $g '1.58.2.onarim')) { Fail 'geçici klasör kaldı' }
}

$env:FCO_AUTO = '1'; $env:FCO_LANG = 'tr'
if (-not $Online) { $env:FCO_ZIP = (Get-ChildItem -LiteralPath $Out -Filter 'falcon-ofis-*-onarim.zip').FullName }

# 1) Takılı eski takas penceresi (fc-update-<pid>.cmd) kapatılmalı
$stuck = Join-Path $env:TEMP 'fc-update-99999.cmd'
Set-Content -LiteralPath $stuck -Value "@echo off`r`n:w`r`nping -n 2 127.0.0.1 >NUL`r`ngoto w" -Encoding ASCII
$sp = Start-Process cmd.exe -ArgumentList '/d', '/c', "`"$stuck`"" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

# 2) Takılı kurulum + daha yeni kurulum (dokunulmamalı)
$g1 = New-Install 'Falcon Ofis' '1.58.0'
$g2 = New-Install 'Yeni Falcon' '1.60.0'
$env:FCO_ROOTS = "$g1;$g2"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Out 'onarim-test.ps1')
if ($LASTEXITCODE -ne 0) { Fail "betik çıkış kodu $LASTEXITCODE" }
Check-Repaired $g1
if (Test-Path -LiteralPath (Join-Path $g2 '1.58.2')) { Fail 'daha yeni kuruluma yazıldı' }
if ((Get-Content -LiteralPath (Join-Path $g2 'aktif.json') -Raw) -notmatch '1\.60\.0') { Fail 'daha yeni kurulumun aktif.json değişti' }
Start-Sleep -Seconds 1
if (-not $sp.HasExited) { Fail 'takılı fc-update penceresi kapatılmadı' }

# 3) Kullanıcıya verilen .cmd'nin içindeki betik (başlıktaki çıkarma komutuyla, aynı yoldan) çalışmalı
$g3 = New-Install 'Üçüncü Kurulum' '1.58.0'
$env:FCO_ROOTS = $g3
$env:FCO_SELF = Join-Path $Out 'FalconOfis-Onarim.cmd'
$line = (Get-Content -LiteralPath $env:FCO_SELF -TotalCount 3)[2]
if ($line -notmatch '-Command "(.*)"$') { Fail 'cmd başlığı okunamadı' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $Matches[1]
if ($LASTEXITCODE -ne 0) { Fail "cmd içi betik çıkış kodu $LASTEXITCODE" }
Check-Repaired $g3

# 4) İkinci kez çalıştırmak zarar vermez
$env:FCO_ROOTS = $g1
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Out 'onarim-test.ps1')
if ($LASTEXITCODE -ne 0) { Fail 'ikinci çalıştırma' }
Check-Repaired $g1

Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ('ONARIM TESTİ GEÇTİ' + $(if ($Online) { ' (GitHub indirmesi)' } else { '' }))
