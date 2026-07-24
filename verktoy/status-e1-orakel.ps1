<#
.SYNOPSIS
  Viser fremdriften i E1s orakel-generering.
#>
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo = Split-Path -Parent $PSScriptRoot
$data = Join-Path $repo "e1-data"

$prosesser = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*e1-orakel.ts*" })

Write-Host "== Skard ==" -ForegroundColor Cyan
Write-Host "  kjørende prosesser: $($prosesser.Count)"

if (-not (Test-Path $data)) { Write-Host "  (ingen e1-data ennå)"; exit 0 }

$filer = @(Get-ChildItem (Join-Path $data "skard-*.jsonl") -ErrorAction SilentlyContinue)
$sum = 0
$mb = 0
foreach ($f in $filer) {
  # ReadLines strømmer – filene blir hundrevis av MB, så de skal aldri
  # leses inn i minnet bare for å telles.
  $n = 0
  foreach ($l in [System.IO.File]::ReadLines($f.FullName)) { $n++ }
  $sum += $n
  $mb += $f.Length / 1MB
}
Write-Host "`n== Datasett ==" -ForegroundColor Cyan
"  {0} filer, {1:N0} merkede stillinger, {2:N0} MB" -f $filer.Count, $sum, $mb | Write-Host

$siste = @(Get-ChildItem (Join-Path $data "skard-*.ut") -ErrorAction SilentlyContinue | Sort-Object Name)
if ($siste.Count -gt 0) {
  Write-Host "`n== Siste linje fra tre skard ==" -ForegroundColor Cyan
  foreach ($f in $siste | Select-Object -First 3) {
    $l = Get-Content $f.FullName -Tail 1 -ErrorAction SilentlyContinue
    if ($l) { Write-Host "  $($f.BaseName): $l" }
  }
}
