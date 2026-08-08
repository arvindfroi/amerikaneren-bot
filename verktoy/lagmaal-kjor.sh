#!/usr/bin/env bash
# LAGMAALET OG VETOEN — replikering i disjunkt froebaand, og to spoersmaal i én kjoering.
#
# ARVIND: «forsvar og makker skal ogsaa ha tilgang til alfa mu. jeg tipper
# forsvar og makker burde bli bedre med det sant?»
#
# Vetokjoeringen (4 400 000-4 400 899) sa TO ting:
#
#   veto v0.5    +0,4809 ± 0,1332 samlet - men PER ROLLE laa alt i foereren
#                (+1,9415), mens makker (-0,07) og forsvar (+0,02) bare gikk
#                fra klart negative til noeyaktig null.
#
# Vetoen fjernet altsaa SKADEN, ikke mangelen paa gevinst. Det staar igjen én
# forklaring paa hvorfor de to rollene ikke tjener paa soeket, og den ligger i
# MAALET: `standardMål` trekker fra MAKKERENS poeng, saa en makker verdsetter
# en 27-0-runde til 3,00 der foereren ser 15,00.
#
# TO SPOERSMAAL, FIRE ARMER, SAMME GIV:
#
#   v0.5     replikerer +0,4809 i et disjunkt baand?      (adopsjonsporten)
#   v0.5L    loefter lagmaalet makker og forsvar over 0?  (Arvinds spoersmaal)
#   L        er lagmaalet noe verdt UTEN vetoen?          (skiller de to)
#
# Uten den tredje armen kunne et positivt v0.5L-tall vaert vetoen alene.
set -u
cd "$(dirname "$0")/.."
GIVERE=1600
SKARD=16
FROE=8800000   # DISJUNKT fra vetokjoeringens 4 400 000-4 400 899.

NETT="vakt:abmpf:e1:e1-modell/d7alle.bin"
HALE="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:${NETT}"
MILJO="amu:foerer:12k16sm1e0.25r1.5:${HALE}"

rm -f analyse/lagm-s*.jsonl
P=""
for S in $(seq 0 $((SKARD - 1))); do
  nohup node examples/gate2.ts \
    --kandidat "amu:alle:12k16sm1e0.25r1.5v0.5:${HALE}" \
    --kandidat "amu:alle:12k16sm1e0.25r1.5v0.5L:${HALE}" \
    --kandidat "amu:alle:12k16sm1e0.25r1.5L:${HALE}" \
    --miljo "$MILJO" --froe "$FROE" --giver "$GIVERE" --skard "${S}/${SKARD}" \
    --ut "analyse/lagm-s${S}.jsonl" > "analyse/lagm-log-${S}.txt" 2>&1 &
  P="$P $!"
done
for X in $P; do wait "$X" 2>/dev/null || true; done
# RAPPORTEN SKRIVES AV PROSESSEN SELV, aldri av et stdout-roer.
node examples/gate2.ts --rapport "analyse/lagm-s*.jsonl" > analyse/lagmaal-rapport.txt 2>&1
echo "FERDIG $(cat analyse/lagm-s*.jsonl|wc -l) rader" >> analyse/lagmaal-rapport.txt
