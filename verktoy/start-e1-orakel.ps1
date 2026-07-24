<#
.SYNOPSIS
  Starter E1s orakel-generering i N parallelle skard.

.DESCRIPTION
  Hvert skard spiller egne partier (disjunkte frø) og skriver merkede
  stillinger til sin egen JSONL-fil i e1-data/. Skardene er uavhengige:
  dør ett, mister du bare det skardets siste linje.

  Dette er ren CPU-jobb. La D1 beholde noen kjerner, ellers stopper
  NEAT-linjen opp.

.EXAMPLE
  .\verktoy\start-e1-orakel.ps1                 # 16 skard, 400 partier hver
  .\verktoy\start-e1-orakel.ps1 -Skard 8 -Kamper 100
#>
param(
  [int]$Skard = 16,
  [int]$Kamper = 400,
  [int]$Verdener = 24,
  [int]$Dybde = 7,
  [double]$Sjanse = 0.35,
  [int]$Froe = 300000
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source

$alt = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*e1-orakel.ts*" }
if ($alt) {
  Write-Host "Orakelet kjorer allerede ($($alt.Count) skard). Stopp med verktoy\stopp-e1-orakel.ps1." -ForegroundColor Yellow
  exit 1
}

$data = Join-Path $repo "e1-data"
if (-not (Test-Path $data)) { New-Item -ItemType Directory $data | Out-Null }

for ($i = 0; $i -lt $Skard; $i++) {
  $ut = "e1-data/skard-$i.jsonl"
  $logg = Join-Path $data "skard-$i.ut"
  $argumenter = @(
    "examples/e1-orakel.ts",
    "--ut", $ut,
    "--kamper", "$Kamper",
    "--froe", "$Froe",
    "--skard", "$i/$Skard",
    "--verdener", "$Verdener",
    "--dybde", "$Dybde",
    "--sjanse", "$Sjanse"
  )
  Start-Process -FilePath $node -ArgumentList $argumenter -WorkingDirectory $repo `
    -RedirectStandardOutput $logg -RedirectStandardError "$logg.err" -WindowStyle Hidden | Out-Null
}

Write-Host "Startet $Skard skard a $Kamper partier ($Verdener verdener, dybde $Dybde)." -ForegroundColor Green
Write-Host "  Data:   e1-data\skard-*.jsonl"
Write-Host "  Status: .\verktoy\status-e1-orakel.ps1"
Write-Host "  Stopp:  .\verktoy\stopp-e1-orakel.ps1"
