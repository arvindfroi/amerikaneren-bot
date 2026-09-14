#!/usr/bin/env bash
# STØYGULVSMÅLINGEN for felles kandidatpulje (`~pulje=felles`), 14. sep.
#
#   bash verktoy/pulje-kjor.sh [kamper] [runder]
#
# TRE ARBEIDERE — maskinen har et tak på 3 kjerner i dette oppdraget, og iterasjon 12
# kjører batteri samtidig. Hver arbeider tar EGNE kamper (egne giv-frø), så klyngene i
# `pulje-sum.ts` er ekte kamper og ikke tre lange strømmer.
#
# RESULTATENE SKRIVES FRA PROSESSEN SELV til `analyse/pulje-w*.jsonl`. Loggen er bare en
# logg: en flertimers måling som bare finnes i et stdout-rør er ingen måling, og det har
# kostet dette prosjektet en hel kjøring før.
#
# ============ VAKTEN, OG HVORFOR DEN FINNES ================================
#
# `bandit`-kjøringen 14. sep ble startet TO ganger. En prosessjekk viste seks arbeidere i
# stedet for tre: to komplette sett med samme frø, som begge skrev med `appendFileSync` til
# de samme filene. Hadde det fått stå, ville hver rad kommet to ganger, `n` vært doblet,
# hver klynge fylt med kopier av seg selv og den klyngede SE-en systematisk for liten —
# nøyaktig slik et støytall blir et «funn». Det brøt også 3-kjerners-taket.
#
# Derfor: dette skriptet NEKTER å starte hvis det allerede finnes en `examples/pulje.ts`-
# prosess. `pulje-sum.ts` har i tillegg sin egen duplikatkontroll, så feilen må forbi to
# sperrer for å nå en tabell.
set -u

KAMPER="${1:-4}"
RUNDER="${2:-3}"
UTMAPPE="analyse"
LOGGMAPPE="D:/amb-grp/loop"

# ---- VAKTEN -------------------------------------------------------------
#
# POWERSHELL, IKKE `wmic`/`tasklist`. Begge de to sviktet på denne maskinen 14. sep:
# `wmic` er fjernet i nyere Windows 11, og en `tasklist | grep -c`-telling rapporterte
# 0 mens 28 node-prosesser FAKTISK kjørte. En vakt som svarer «ingen kjører» når det
# kjører 28 er verre enn ingen vakt — den er en falsk trygghet foran nøyaktig den
# doblingen den skal stanse. `Get-CimInstance` er verifisert å virke her.
ALT=$(powershell -NoProfile -Command "@(Get-Process node -ErrorAction SilentlyContinue).Count" 2>/dev/null | tr -d '\r')
KJORER=$(powershell -NoProfile -Command \
  "@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*examples/pulje.ts*' }).Count" \
  2>/dev/null | tr -d '\r')
# FEILER VAKTEN, SKAL VI IKKE STARTE. Et tomt svar betyr at vi ikke VET, og «vet ikke»
# må behandles som «kanskje» når prisen er en lydløst doblet måling.
if ! [ "${KJORER:-}" -eq "${KJORER:-}" ] 2>/dev/null; then
  echo "NEKTER Å STARTE: prosessvakten svarte ikke (fikk «${KJORER:-}»)." >&2
  echo "Uten en fungerende vakt kan en dobbeltstart ikke utelukkes. Sjekk manuelt." >&2
  exit 1
fi
if [ "${KJORER:-0}" -gt 0 ]; then
  echo "NEKTER Å STARTE: det kjører allerede $KJORER prosess(er) med examples/pulje.ts." >&2
  echo "Drep dem først, og slett $UTMAPPE/pulje-w*.jsonl — ellers dobles radene." >&2
  exit 1
fi
echo "vakt: ingen pulje-prosess kjører fra før (node.exe totalt: ${ALT:-ukjent})"

mkdir -p "$UTMAPPE"

for w in 0 1 2; do
  # Frøene ligger langt fra hverandre, så to arbeidere ikke kan treffe samme giv.
  FRO=$((14000901 + w * 7919))
  UT="$UTMAPPE/pulje-w$w.jsonl"
  rm -f "$UT"
  echo "arbeider $w: fro=$FRO kamper=$KAMPER runder=$RUNDER -> $UT"
  node examples/pulje.ts \
    --kamper "$KAMPER" --runder "$RUNDER" --fro "$FRO" \
    --merke "w$w" --ut "$UT" \
    > "$LOGGMAPPE/pulje-w$w.log" 2>&1 &
done

wait
echo "alle arbeidere ferdige"
node examples/pulje-sum.ts "$UTMAPPE"/pulje-w*.jsonl | tee "$LOGGMAPPE/pulje-sammendrag.txt"
