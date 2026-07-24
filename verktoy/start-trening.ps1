<#
.SYNOPSIS
  Starter den lokale NEAT-treningen (begge linjer) som bakgrunnsprosess.

.DESCRIPTION
  Kjører examples/lokal-tren.ts løsrevet fra terminalen, så treningen fortsetter
  når vinduet lukkes. Supervisoren holder begge linjer i live og pusher
  fremgangsgrafen til https://arvindfroi.github.io/amerikaneren-bot/ hvert
  2. minutt.

.EXAMPLE
  .\verktoy\start-trening.ps1
  .\verktoy\start-trening.ps1 -Populasjon 192 -Traader 8
  .\verktoy\start-trening.ps1 -UtenGraf      # tren uten å publisere
#>
param(
  [int]$Populasjon = 128,
  [int]$Traader = 0,
  [switch]$UtenGraf
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

# Allerede i gang? Ikke start en linje til på samme mapper.
$alt = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*lokal-tren.ts*" }
if ($alt) {
  Write-Host "Treningen kjører allerede (pid $($alt.ProcessId -join ', ')). Stopp den med verktoy\stopp-trening.ps1." -ForegroundColor Yellow
  exit 1
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Fant ikke node på PATH. Node 22+ kreves (nodejs.org)." }
$versjon = & $node --version
if ([int](($versjon -replace '^v','') -split '\.')[0] -lt 22) {
  throw "Node $versjon er for gammel - trenger 22+ (kjører TypeScript direkte)."
}

# Supervisorloggen roteres, så forrige økt er lesbar etter en omstart.
$logg = Join-Path $repo "lokal-tren.log"
$feil = Join-Path $repo "lokal-tren.err.log"
foreach ($f in @($logg, $feil)) {
  if (Test-Path $f) { Move-Item $f "$f.1" -Force }
}

$argumenter = @("examples/lokal-tren.ts", "$Populasjon")
if ($UtenGraf) { $argumenter += "--uten-graf" }

# Start-Process arver miljøet vårt, så trådtallet settes her.
if ($Traader -gt 0) { $env:TRAADER = "$Traader" }

$p = Start-Process -FilePath $node -ArgumentList $argumenter -WorkingDirectory $repo `
  -RedirectStandardOutput $logg -RedirectStandardError $feil -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 3
if ($p.HasExited) {
  Write-Host "Supervisoren døde med en gang. Siste linjer fra $feil :" -ForegroundColor Red
  Get-Content $feil -Tail 20
  exit 1
}

Write-Host "Trening startet (pid $($p.Id))." -ForegroundColor Green
Write-Host "  Logger:  trening-c4.log / trening-d1.log / lokal-tren.log"
Write-Host "  Status:  .\verktoy\status-trening.ps1"
Write-Host "  Stopp:   .\verktoy\stopp-trening.ps1"
Write-Host "  Graf:    https://arvindfroi.github.io/amerikaneren-bot/"
