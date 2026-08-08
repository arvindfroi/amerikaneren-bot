#!/usr/bin/env bash
# MATRISEN: hele stakker mot hverandre, to og to ved bordet.
set -u
cd "$(dirname "$0")/.."
GIVER=${1:-150}; SKARD=${2:-20}; FROE=${3:-800000000}; MERKE=${4:-m1}
rm -f "analyse/matrise-${MERKE}-s"*.jsonl
P=""
for S in $(seq 0 $((SKARD - 1))); do
  nohup node examples/matrise.ts --giver "$GIVER" --froe "$FROE" --skard "${S}/${SKARD}" \
    --ut "analyse/matrise-${MERKE}-s${S}.jsonl" > "analyse/matrise-${MERKE}-log-${S}.txt" 2>&1 &
  P="$P $!"
done
for X in $P; do wait "$X" 2>/dev/null || true; done
# RAPPORTEN SKRIVES AV PROSESSEN SELV - aldri gjennom et stdout-roer.
node examples/matrise.ts --rapport "analyse/matrise-${MERKE}-s*.jsonl" > "analyse/matrise-${MERKE}-rapport.txt" 2>&1
echo "FERDIG $(cat analyse/matrise-${MERKE}-s*.jsonl|wc -l) rader" >> "analyse/matrise-${MERKE}-rapport.txt"
