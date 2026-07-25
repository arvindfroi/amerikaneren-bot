# Grafpuls: oppdaterer og pusher GitHub Pages-grafen hvert 2. minutt.
#
# Erstatter examples/graf-puls.sh, som hadde /home/user/amerikaneren-bot
# hardkodet inn og derfor aldri kunne kjoere paa Windows-maskinen der
# treningen faktisk foregaar. Siden stod stille i 40 minutter foer det ble
# oppdaget - loekka maa vaere like lokal som treningen den rapporterer om.
#
#   Start-Process powershell -ArgumentList '-NoProfile','-File','verktoy\graf-puls.ps1' -WindowStyle Hidden
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
while ($true) {
  try {
    node examples/neat-graf.ts --pages *> "$repo\trening-felles\graf-puls.log"
  } catch {
    $_ | Out-File -Append -Encoding utf8 "$repo\trening-felles\graf-puls.log"
  }
  Start-Sleep -Seconds 120
}
