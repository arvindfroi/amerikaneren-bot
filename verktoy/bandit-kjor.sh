#!/usr/bin/env bash
# STØYGULVSMÅLINGEN for adaptiv budsjettering (`~fordel=halv`), 14. sep.
#
#   bash verktoy/bandit-kjor.sh [kamper] [runder]
#
# TRE ARBEIDERE — maskinen har et tak på 3 kjerner i dette oppdraget, og
# iterasjon 12 kjører samtidig. Hver arbeider tar EGNE kamper (egne giv-frø), så
# klyngene i `bandit-sum.ts` er ekte kamper og ikke tre lange strømmer.
#
# RESULTATENE SKRIVES FRA PROSESSEN SELV til `analyse/bandit-w*.jsonl`. Loggen er
# bare en logg: en flertimers måling som bare finnes i et stdout-rør er ingen
# måling, og det har kostet dette prosjektet en hel kjøring før.
set -u

KAMPER="${1:-4}"
RUNDER="${2:-4}"
UTMAPPE="analyse"
LOGGMAPPE="D:/amb-grp/loop"

mkdir -p "$UTMAPPE"

for w in 0 1 2; do
  # Frøene ligger langt fra hverandre, så to arbeidere ikke kan treffe samme giv.
  FRO=$((14000901 + w * 7919))
  UT="$UTMAPPE/bandit-w$w.jsonl"
  rm -f "$UT"
  echo "arbeider $w: fro=$FRO kamper=$KAMPER runder=$RUNDER -> $UT"
  node examples/bandit.ts \
    --kamper "$KAMPER" --runder "$RUNDER" --fro "$FRO" \
    --merke "w$w" --ut "$UT" \
    > "$LOGGMAPPE/bandit-w$w.log" 2>&1 &
done

wait
echo "alle arbeidere ferdige"
node examples/bandit-sum.ts "$UTMAPPE"/bandit-w*.jsonl | tee "$LOGGMAPPE/bandit-sammendrag.txt"
