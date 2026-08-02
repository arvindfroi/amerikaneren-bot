<#
.SYNOPSIS
  Framdrift for Adams: treningsdata mot maalet, og budporten mot n=200 par.

.DESCRIPTION
  Raten maales ved aa telle to ganger med noen sekunders mellomrom, ikke ved
  aa dele totalen paa tiden siden start. Skardene starter og stopper til ulike
  tider - sd-spredt ble ferdig mens sd-dagger fortsatt skriver - saa et
  gjennomsnitt siden start ville gitt en ETA som er systematisk feil.

.PARAMETER Maal
  Radmaalet for treningsdataene. 300 000 er tallet fra den opprinnelige
  oppgaven, ikke fra docs/plan.md - planen setter ingen radgrense.

.PARAMETER Foelg
  Oppdater kontinuerlig til maalet er naadd. Uten denne tas ett oejeblikksbilde.

.EXAMPLE
  .\verktoy\status-adams.ps1
  .\verktoy\status-adams.ps1 -Foelg
#>
param(
  [int]$Maal = 300000,
  [int]$Vindu = 12,
  [switch]$Foelg
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Tell-Rader {
  param([string[]]$Mapper)
  $sum = 0
  foreach ($m in $Mapper) {
    $sti = Join-Path $repo $m
    if (-not (Test-Path $sti)) { continue }
    foreach ($f in Get-ChildItem $sti -Filter *.jsonl -ErrorAction SilentlyContinue) {
      # StreamReader framfor Get-Content: filene er ~25 MB hver og vokser mens
      # vi leser. Get-Content ville lastet alt i minnet for aa telle linjer.
      $r = [System.IO.File]::OpenText($f.FullName)
      try { while ($null -ne $r.ReadLine()) { $sum++ } } finally { $r.Close() }
    }
  }
  return $sum
}

function Tell-Skard {
  param([string]$Moenster)
  $p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*$Moenster*" }
  return @($p).Count
}

function Vis-Bar {
  param([int]$Naa, [int]$Av, [int]$Bredde = 44)
  $andel = if ($Av -gt 0) { [math]::Min(1.0, $Naa / $Av) } else { 0 }
  $fylt = [int][math]::Round($andel * $Bredde)
  $farge = if ($andel -ge 1) { "Green" } elseif ($andel -ge 0.75) { "Cyan" } else { "Yellow" }
  Write-Host "  [" -NoNewline
  Write-Host ("#" * $fylt) -NoNewline -ForegroundColor $farge
  Write-Host ("." * ($Bredde - $fylt)) -NoNewline -ForegroundColor DarkGray
  Write-Host ("] {0,5:P0}" -f $andel)
}

function Vis-Eta {
  param([double]$Rate, [int]$Mangler, [string]$Enhet)
  if ($Mangler -le 0) {
    Write-Host "  MAALET ER NAADD." -ForegroundColor Green
    return
  }
  if ($Rate -le 0) {
    Write-Host "  ETA: -- (ingen produksjon maalt; skardene staar stille)" -ForegroundColor Red
    return
  }
  $min = $Mangler / $Rate
  $ferdig = (Get-Date).AddMinutes($min)
  $tid = if ($min -ge 60) { "{0:N0} t {1:N0} min" -f [math]::Floor($min / 60), ($min % 60) } else { "{0:N0} min" -f $min }
  "  rate {0:N0} {1}/min   mangler {2:N0}   ETA {3}  (~{4:HH:mm})" -f $Rate, $Enhet, $Mangler, $tid, $ferdig | Write-Host
}

do {
  $t0 = Get-Date
  $a0 = Tell-Rader @("sd-spredt", "sd-dagger", "sd-dagger2")
  Start-Sleep -Seconds $Vindu
  $a1 = Tell-Rader @("sd-spredt", "sd-dagger", "sd-dagger2")
  $sek = ((Get-Date) - $t0).TotalSeconds
  $rate = if ($sek -gt 0) { ($a1 - $a0) / $sek * 60 } else { 0 }

  Clear-Host
  Write-Host ""
  Write-Host "  ADAMS - framdrift  $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor White
  Write-Host "  ================================================" -ForegroundColor DarkGray
  Write-Host ""

  Write-Host "  TRENINGSDATA (v2, 340 trekk)" -ForegroundColor Cyan
  Vis-Bar -Naa $a1 -Av $Maal
  "  {0:N0} av {1:N0} rader   {2} orakel-skard" -f $a1, $Maal, (Tell-Skard "sd-orakel") | Write-Host
  Vis-Eta -Rate $rate -Mangler ($Maal - $a1) -Enhet "rader"

  # Fordelingen mellom mappene er med fordi de to har ulike roller: sd-spredt
  # er spredte kontrakter, sd-dagger er stillinger fra nettets EGEN policy.
  # Blir dagger-andelen for liten, er DAgger-aksen i praksis ikke med.
  $spredt = Tell-Rader @("sd-spredt")
  $dagger = $a1 - $spredt
  "    sd-spredt {0,8:N0}   dagger {1,8:N0}  ({2:P0} DAgger)" -f $spredt, $dagger, ($dagger / [math]::Max(1, $a1)) | Write-Host

  # TAKET, IKKE BARE RATEN. Hvert skard har et fast budsjett (--kamper), og
  # ferdige skard lander paa ~5 200 rader. En ETA fra dagens rate alene later
  # som om produksjonen fortsetter i det uendelige, og bommer derfor grovt
  # naar skardene begynner aa gaa tomme. Det skjedde 2026-08-02: baren viste
  # 22:46 for 300k mens det virkelige taket laa paa ~247k.
  # Taket er en OEVRE grense: det antar fullt budsjett igjen paa hvert skard.
  # Et skard som allerede staar paa 5 100 rader bidrar naesten ingenting mer.
  # Grensen er likevel den som betyr noe, for er DEN under maalet, er saken
  # avgjort uansett hvor raskt det gaar akkurat naa.
  $skard = Tell-Skard "sd-orakel"
  $tak = $a1 + $skard * 5200
  if ($tak -lt $Maal) {
    "  TAK: hoeyst ~{0:N0} rader med {1} skard - {2:N0} UNDER maalet." -f $tak, $skard, ($Maal - $tak) | Write-Host -ForegroundColor Red
    Write-Host "       Start flere skard, ellers stopper det her." -ForegroundColor Red
  } else {
    "  tak: hoeyst ~{0:N0} rader med {1} skard (oevre grense, over maalet)" -f $tak, $skard | Write-Host -ForegroundColor DarkGray
  }
  Write-Host ""

  Write-Host "  BUDPORTEN (budm mot MesterAI)" -ForegroundColor Cyan
  $ut = & node (Join-Path $repo "examples/h2h-parret.ts") `
    --a "analyse/h2h-abmp-*.jsonl" --b "analyse/h2h-budm-*.jsonl" `
    --navna abmp --navnb budm --ut "analyse/h2h-parret-budm.txt" 2>&1
  # MOENSTERET ER REN ASCII med vilje. Linjen ser slik ut:
  #   budm − abmp = +0.4786 ± 0.3770   (1.3 SE), n=33
  # men den inneholder U+2212 og U+00B1, og naar Windows PowerShell leser
  # denne .ps1-fila som ANSI blir de tegnene noe annet enn det de var da
  # fila ble skrevet. Da matcher moensteret ingenting - stille.
  $linje = $ut | Select-String -Pattern "SE\), n=" | Select-Object -First 1
  $porten = $ut | Select-String -Pattern "PORTEN" | Select-Object -First 1
  if ($porten -match "Naa: (\d+)") {
    $par = [int]$Matches[1]
    Vis-Bar -Naa $par -Av 200
    "  {0} av 200 par   {1} h2h-skard" -f $par, (Tell-Skard "mesterai-h2h") | Write-Host
    if ($linje) { "  {0}" -f $linje.ToString().Trim() | Write-Host }
  } else {
    Write-Host "  (fant ikke porten - er maalingen startet?)" -ForegroundColor Yellow
  }
  Write-Host ""

  if ($Foelg -and $a1 -lt $Maal) { Start-Sleep -Seconds 30 }
} while ($Foelg -and $a1 -lt $Maal)
