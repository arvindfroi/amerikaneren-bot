<#
.SYNOPSIS
  Stopper den lokale NEAT-treningen pent.

.DESCRIPTION
  Legger igjen en STOPP-fil som supervisoren plukker opp innen 10 sekunder.
  Befolkningen er lagret på disk hver 5. generasjon, så en stopp koster maks
  fem generasjoner. Neste start fortsetter der denne slapp.

  Med -Hardt drepes node-prosessene direkte (bruk bare om supervisoren henger).
#>
param([switch]$Hardt)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

$prosesser = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*lokal-tren.ts*" -or $_.CommandLine -like "*neat-vakt.ts*" -or $_.CommandLine -like "*neat-tren.ts*" }

if (-not $prosesser) {
  Write-Host "Ingen trening kjorer." -ForegroundColor Yellow
  exit 0
}

if ($Hardt) {
  foreach ($p in $prosesser) {
    Write-Host "Dreper pid $($p.ProcessId)"
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Alle treningsprosesser drept." -ForegroundColor Green
  exit 0
}

New-Item -ItemType File -Path (Join-Path $repo "STOPP") -Force | Out-Null
Write-Host "STOPP-fil lagt igjen - venter pa at supervisoren avslutter ..."

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  $igjen = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*lokal-tren.ts*" }
  if (-not $igjen) {
    Write-Host "Treningen er stoppet. Fortsett senere med .\verktoy\start-trening.ps1" -ForegroundColor Green
    exit 0
  }
}

Write-Host "Supervisoren svarte ikke innen 60 s. Prov: .\verktoy\stopp-trening.ps1 -Hardt" -ForegroundColor Yellow
exit 1
