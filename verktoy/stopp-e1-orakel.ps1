<#
.SYNOPSIS
  Stopper E1s orakel-skard. Dataene som er skrevet, blir liggende.
#>
$ErrorActionPreference = "Stop"

$prosesser = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*e1-orakel.ts*" })

if ($prosesser.Count -eq 0) { Write-Host "Ingen orakel-skard kjorer." -ForegroundColor Yellow; exit 0 }

foreach ($p in $prosesser) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "Stoppet $($prosesser.Count) skard. Dataene i e1-data\ er intakte." -ForegroundColor Green
