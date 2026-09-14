#!/usr/bin/env bash
# Del 1-maalingen: 3 arbeidere, egne kamper per arbeider, egne utfiler.
# Vakt: nekter aa starte hvis det alt kjoerer en seiersmaal-fasit.ts (3-kjerners taket).
set -u
KAMPER=${1:-180}
RUNDER=${2:-60}
cd "$(dirname "$0")/.."
if ps -W 2>/dev/null | grep -q "seiersmaal-fasit" ; then
  echo "AVVIST: seiersmaal-fasit.ts kjoerer alt. Taket er 3 kjerner."; exit 1
fi
mkdir -p analyse
rm -f analyse/seiersmaal-w*.jsonl analyse/seiersmaal-w*.log
for i in 0 1 2; do
  node examples/seiersmaal-fasit.ts --kamper "$KAMPER" --runder "$RUNDER" --tak 7 \
    --froe 13000777 --skard "$i/3" --ut "analyse/seiersmaal-w$i.jsonl" \
    > "analyse/seiersmaal-w$i.log" 2>&1 &
done
wait
echo "FERDIG $(date +%H:%M:%S)"
for i in 0 1 2; do echo "-- w$i --"; tail -3 "analyse/seiersmaal-w$i.log"; done
