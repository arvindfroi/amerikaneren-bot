<#
.SYNOPSIS
  Viser status for den lokale NEAT-treningen: prosesser, generasjoner, benk og siste publisering.
#>
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

$prosesser = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*lokal-tren.ts*" -or $_.CommandLine -like "*neat-vakt.ts*" -or $_.CommandLine -like "*neat-tren.ts*" }

Write-Host "== Prosesser ==" -ForegroundColor Cyan
if (-not $prosesser) {
  Write-Host "  (ingen - treningen er stoppet)" -ForegroundColor Yellow
} else {
  foreach ($p in $prosesser) {
    $rolle = if ($p.CommandLine -like "*lokal-tren.ts*") { "supervisor" }
             elseif ($p.CommandLine -like "*neat-vakt.ts*") { "vakt" } else { "trener" }
    $linje = if ($p.CommandLine -like "*trening-c4*") { "C4" }
             elseif ($p.CommandLine -like "*trening-d1*") { "D1" } else { "-" }
    $mb = [math]::Round($p.WorkingSetSize / 1MB)
    "  {0,-10} {1,-3} pid {2,-7} {3,6} MB" -f $rolle, $linje, $p.ProcessId, $mb | Write-Host
  }
}

Write-Host "`n== Linjer ==" -ForegroundColor Cyan
foreach ($d in @("trening-c4", "trening-d1")) {
  $statusfil = Join-Path $repo "$d\status.json"
  if (-not (Test-Path $statusfil)) { Write-Host "  $d : ingen status.json"; continue }
  $s = Get-Content $statusfil -Raw | ConvertFrom-Json
  $alder = [math]::Round(((Get-Date).ToUniversalTime() - [DateTimeOffset]::FromUnixTimeMilliseconds($s.tidsstempel).UtcDateTime).TotalMinutes, 1)
  "  {0} : generasjon {1}, hjerteslag for {2} min siden" -f $d, $s.generasjon, $alder | Write-Host
  if ($s.sisteBenk) { "      benk: $($s.sisteBenk)" | Write-Host }
  $gullfil = Join-Path $repo "$d\gull.json"
  if (Test-Path $gullfil) {
    $g = (Get-Content $gullfil -Raw | ConvertFrom-Json)
    "      gull: diff {0:N1} (gen {1})" -f $g.diff, $g.gen | Write-Host
  }
}

Write-Host "`n== Siste hendelser ==" -ForegroundColor Cyan
$logg = Join-Path $repo "lokal-tren.log"
if (Test-Path $logg) { Get-Content $logg -Tail 8 | ForEach-Object { "  $_" } } else { Write-Host "  (ingen lokal-tren.log)" }

Write-Host "`n== Publisering ==" -ForegroundColor Cyan
$pages = Join-Path (Split-Path -Parent $repo) "amerikaneren-pages"
if (Test-Path (Join-Path $pages ".git")) {
  $sist = & git -C $pages log -1 --format="%cr  %s" 2>$null
  "  gh-pages: $sist" | Write-Host
} else {
  Write-Host "  (worktreet er ikke laget enda - lages ved forste publisering)"
}
Write-Host "  Side:     https://arvindfroi.github.io/amerikaneren-bot/"
