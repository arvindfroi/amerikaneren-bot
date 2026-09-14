#!/usr/bin/env bash
# STØYGULVSMÅLINGEN for stratifisert verdenstrekning (`~trekk=strata`), 14. sep.
#
#   bash verktoy/strata-kjor.sh [kamper] [runder]
#
# TRE ARBEIDERE — maskinen har et tak på 3 kjerner i dette oppdraget, og
# iterasjon 12 kjører samtidig. Hver arbeider tar EGNE kamper (egne giv-frø), så
# klyngene i `strata-sum.ts` er ekte kamper og ikke tre lange strømmer.
#
# RESULTATENE SKRIVES FRA PROSESSEN SELV til `analyse/strata-w*.jsonl`. Loggen er
# bare en logg: en flertimers måling som bare finnes i et stdout-rør er ingen
# måling, og det har kostet dette prosjektet en hel kjøring før.
#
# ============ VAKTEN, OG HVORFOR DEN FINNES ================================
#
# `bandit`-kjøringen 14. sep ble startet TO ganger. En prosessjekk viste seks
# arbeidere i stedet for tre: to komplette sett med samme frø, som begge skrev med
# `appendFileSync` til de samme filene. Hadde det fått stå, ville hver rad kommet
# to ganger, `n` vært doblet, hver klynge fylt med kopier av seg selv og den
# klyngede SE-en systematisk for liten — nøyaktig slik et støytall blir et «funn».
# Det brøt også 3-kjerners-taket.
#
# Derfor: dette skriptet NEKTER å starte hvis det allerede finnes en
# `examples/strata.ts`-prosess. `strata-sum.ts` har i tillegg sin egen
# duplikatkontroll, så feilen må forbi to sperrer for å nå en tabell.
set -u

KAMPER="${1:-4}"
RUNDER="${2:-4}"
UTMAPPE="analyse"
LOGGMAPPE="D:/amb-grp/loop"

# ---- VAKTEN -------------------------------------------------------------
ALT=$(tasklist /FI "IMAGENAME eq node.exe" /FO CSV 2>/dev/null | grep -c "node.exe" || true)
KJORER=$(wmic process where "name='node.exe'" get commandline 2>/dev/null | grep -c "examples/strata.ts" || true)
if [ "${KJORER:-0}" -gt 0 ]; then
  echo "NEKTER Å STARTE: det kjører allerede $KJORER prosess(er) med examples/strata.ts." >&2
  echo "Drep dem først, og slett $UTMAPPE/strata-w*.jsonl — ellers dobles radene." >&2
  exit 1
fi
echo "vakt: ingen strata-prosess kjører fra før (node.exe totalt: ${ALT:-ukjent})"

mkdir -p "$UTMAPPE"

for w in 0 1 2; do
  # Frøene ligger langt fra hverandre, så to arbeidere ikke kan treffe samme giv.
  FRO=$((14000901 + w * 7919))
  UT="$UTMAPPE/strata-w$w.jsonl"
  rm -f "$UT"
  echo "arbeider $w: fro=$FRO kamper=$KAMPER runder=$RUNDER -> $UT"
  node examples/strata.ts \
    --kamper "$KAMPER" --runder "$RUNDER" --fro "$FRO" \
    --merke "w$w" --ut "$UT" \
    > "$LOGGMAPPE/strata-w$w.log" 2>&1 &
done

wait
echo "alle arbeidere ferdige"
node examples/strata-sum.ts "$UTMAPPE"/strata-w*.jsonl | tee "$LOGGMAPPE/strata-sammendrag.txt"
