#!/usr/bin/env bash
# Læringskurve for E1: er det DATAMENGDEN eller ARKITEKTUREN som holder igjen?
#
#   wsl bash verktoy/e1-kurve.sh
#
# Alle kjøringer deler NØYAKTIG samme valideringssett (siste 5 % av hele
# korpuset, satt før uttrekket i e1-tren.py) og NØYAKTIG samme målebenk
# (holdout-halvdelen av e1-frys). Uten det ville kurven målt utvalget i
# stedet for læringen – feilen som gjorde D7-kurven verdiløs.
#
# Nettene skrives til e1-modell/kurve-*.bin, treningslogg til
# e1-modell/kurve.log, og angeren måles etterpå med:
#   node examples/e1-frysmaal.ts e1:e1-modell/kurve-<navn>.bin --merk kurve
#
# ─────────────────────────────────────────────────────────────────────────────
# RESULTAT 2026-07-25. Anger på holdout-halvdelen av e1-frys (21 044
# stillinger, gulv 0,9321, nevro 0,8167). Lavere er bedre.
#
#   treningsstillinger    25k     50k    100k    200k    383k
#   anger              0,5874  0,5574  0,5186  0,5257  0,5219
#
# Kurven er FLAT fra 100 000. Fire ganger så mye data (100k → 383k) ga
# 0,0033 – innenfor støyen. DATAMENGDEN ER IKKE FLASKEHALSEN, og de ti
# orakelprosessene kjøper oss ikke kortferdighet ved å kjøre lenger.
#
#   arkitektur      256,256  384,256  512,384,256  640,512,384  1024,768,512
#   val-anger        0,4773   0,4744       0,4893       0,4951        0,5010
#
# Heller ikke KAPASITETEN: det minste nettet slår det største. 720 000
# parametre overtilpasser der 180 000 ikke gjør det. Det som faktisk flyttet
# tallet, var å bytte SJEKKPUNKTKRITERIUM fra treffrate til anger – to
# kjøringer med identisk oppsett fikk begge val-treff 60,8 % men anger 0,5219
# og 0,5435, så treffraten kunne ikke skille dem.
set -u
cd "$(dirname "$0")/.."
PY=~/Arvind-Lora/.venv/bin/python
BUF=/home/arvind/e1-buffer-r2.npz
FELLES="--data e1-data,e1-data2,e1-data3 --utelat e1-frys --buffer $BUF --epoker 40 --taal 6 --logg e1-modell/kurve.log"

# 1) Datamengde, fast arkitektur (samme som r1/r2).
for n in 25000 50000 100000 200000 400000; do
  echo "=== datamengde $n ==="
  $PY verktoy/e1-tren.py $FELLES --maks "$n" --skjult 640,512,384 --ut "e1-modell/kurve-n$n.bin"
done

# 2) Kapasitet, full datamengde.
for skjult in 256,256 1024,768,512 1024,1024,768,512; do
  navn=$(echo "$skjult" | tr ',' '-')
  echo "=== arkitektur $skjult ==="
  $PY verktoy/e1-tren.py $FELLES --skjult "$skjult" --ut "e1-modell/kurve-a$navn.bin"
done
echo "KURVE FERDIG"
