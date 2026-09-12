#!/usr/bin/env bash
# KORPUSPARET til kanoniseringsmaalingen: NOEYAKTIG samme stillinger, to fargenavn.
#
# Armene maa vaere rad-for-rad de samme givene, stikkene og setene - ellers er
# «parvis» en loegn (fella i verktoy/agX-k8-par.py). Derfor: samme froe, samme
# spek, samme bord, samme rekkefoelge; den ENESTE forskjellen er --kanonisk.
#
# Befolkningen er loekkas egen (3 bord), fordelt paa tre disjunkte kampbolker slik
# at blandingen blir den samme som adams-max-loop-v8.sh sine 6 skard gir.
# Kampbaandet er brukt av loekka opp til 3150; vi tar resten [3150, 4000).
set -u
cd /d/amb-agKA || exit 1
POL="okt:vr:e1-modell/vrak-7.bin@e1-modell/etterlyst-7.bin:telrd:profil:budq:e1-modell/budq-7.bin:vakt:abmp:e1:e1-modell/kort-7.bin"
D7="e1:e1-modell/d7alle.bin"
P_ADAMS="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:$D7"
P_MENN="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json:vakt:abmp:$D7"
P_GBT="etl:2:vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-gbt.json@-3.0:vakt:abmp:$D7"
P_SPAR="vr:e1-modell/vrakrang.bin:tl:budq:e1-modell/budq-s4a.bin:vakt:abmpd:$D7"
P_HOY="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@2.5:vakt:hbmpS:$D7"
BORD=("@|$P_ADAMS|@|$P_MENN" "@|$P_GBT|@|$P_SPAR" "@|$P_HOY|@|$P_MENN")

# $1 = "abs" | "kan"
arm() {
  local navn=$1 flagg=""
  [ "$navn" = "kan" ] && flagg="--kanonisk"
  # HOLDOUT foerst (billig): 2 bolker, sjanse 0.5 som i loekka.
  local hf=(600 650 700)
  for i in 0 1; do
    node examples/mlb-trodata.ts --kamp --hukommelse --signal --sanser2 --spek "$POL" \
      --drivere "${BORD[$i]}" --rotasjon --band holdout --fra "${hf[$i]}" --kamper "${hf[$((i + 1))]}" \
      --sjanse 0.5 --skard 0/1 $flagg --ut "D:/amb-agKA/kk/$navn-hold-$i.bin" > "kk/log-$navn-hold-$i.txt" 2>&1 || return 1
  done
  # TRENING: 3 bolker over [3150, 4000), sjanse 1 for aa naa volum innenfor baandet.
  local tf=(3150 3433 3716 4000)
  for i in 0 1 2; do
    node examples/mlb-trodata.ts --kamp --hukommelse --signal --sanser2 --spek "$POL" \
      --drivere "${BORD[$i]}" --rotasjon --band trening --fra "${tf[$i]}" --kamper "${tf[$((i + 1))]}" \
      --sjanse 1 --skard 0/1 $flagg --ut "D:/amb-agKA/kk/$navn-tren-$i.bin" > "kk/log-$navn-tren-$i.txt" 2>&1 || return 1
  done
  echo "FERDIG $navn $(date +%FT%T)" >> kk/gen-status.txt
}

: > kk/gen-status.txt
arm abs &
arm kan &
wait
echo "ALT FERDIG $(date +%FT%T)" >> kk/gen-status.txt
ls -la kk/*.bin >> kk/gen-status.txt
