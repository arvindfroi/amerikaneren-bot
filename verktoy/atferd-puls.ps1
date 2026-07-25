# Atferdspuls: maaler HVA botten gjoer, ikke bare hva den scorer.
#
# Poengsummen sier at noe er galt; den sier ikke hva. Denne kjoerer
# examples/spillprofil.ts mot hver aktive linjes mester hvert 20. minutt og
# legger én JSONL-linje per maaling i <linje>/atferd.jsonl. NevroHjerne maales
# hver gang paa de samme giverne, saa avviket kan leses av direkte.
#
# Det som overvaakes er noeyaktig de fire fasene: BUD (snitt, passandel,
# andel >= 9), VRAK (valoer, ess/konge, egen trumf), TRUMF (lengde, lengste
# farge, serie) og SPILL (lagstikk, overskudd, innfridd).
#
#   Start-Process powershell -ArgumentList '-NoProfile','-File','verktoy\atferd-puls.ps1' -WindowStyle Hidden
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
while ($true) {
  foreach ($d in Get-ChildItem -Directory -Path $repo -Filter 'trening-d*') {
    $mester = Join-Path $d.FullName 'mester.json'
    $status = Join-Path $d.FullName 'status.json'
    if (-not (Test-Path $mester)) { continue }
    # Bare linjer med ferskt hjerteslag - ellers maaler vi doede loep om igjen.
    if (Test-Path $status) {
      try {
        $st = Get-Content $status -Raw | ConvertFrom-Json
        $alder = ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $st.tidsstempel) / 60000
        if ($alder -gt 30) { continue }
        $gen = $st.generasjon
      } catch { $gen = '' }
    } else { $gen = '' }
    $ut = Join-Path $d.FullName 'atferd.jsonl'
    node examples/spillprofil.ts $mester --kamper 24 --jsonl $ut --merke "$gen" *> $null
  }
  Start-Sleep -Seconds 1200
}
