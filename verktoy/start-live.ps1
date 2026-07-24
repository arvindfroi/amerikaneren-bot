<#
.SYNOPSIS
  Starter den lokale live-siden (http://localhost:8790).

.DESCRIPTION
  Leser status.json, treningsloggene og e1-data rett fra disk og oppdaterer
  seg hvert 3. sekund – i motsetning til GitHub Pages-grafen, som er et par
  minutter forsinket. Kjorer losrevet fra terminalen.

.EXAMPLE
  .\verktoy\start-live.ps1
  .\verktoy\start-live.ps1 -Port 8791
#>
param([int]$Port = 8790)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

$alt = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*examples/live.ts*" }
if ($alt) {
  Write-Host "Live-siden kjorer allerede (pid $($alt.ProcessId -join ', ')) - http://localhost:$Port" -ForegroundColor Yellow
  exit 0
}

$node = (Get-Command node).Source
$logg = Join-Path $repo "live.log"
if (Test-Path $logg) { Move-Item $logg "$logg.1" -Force }

$p = Start-Process -FilePath $node -ArgumentList @("examples/live.ts", "--port", "$Port") `
  -WorkingDirectory $repo -RedirectStandardOutput $logg -RedirectStandardError "$logg.err" `
  -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 2
if ($p.HasExited) {
  Write-Host "Live-siden dode med en gang:" -ForegroundColor Red
  Get-Content "$logg.err" -Tail 10
  exit 1
}
Write-Host "Live-siden kjorer (pid $($p.Id)): http://localhost:$Port" -ForegroundColor Green
