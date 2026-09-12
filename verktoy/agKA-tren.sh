#!/usr/bin/env bash
# KANONISERING VED PRODUKSJONSVOLUM — fire armer paa NOEYAKTIG samme stillinger.
#
# Agent X maalte kanonisering FRA BUNNEN paa 200 023 rader og fikk K8 0,925 mot
# 0,950. Innvendingen var driftspunktet: tro-7 ligger paa 0,898 med langt mer data,
# saa gevinsten kunne vaere en artefakt av at begge armene var undertrent.
#
# Derfor to familier paa det samme korpuset, samme froe, samme plan:
#
#   VARMSTART (slik loekka faktisk trener): tro-7 + 4 epoker, lr 1e-4.
#     A1 absolutte farger   B1 kanoniske farger
#     Spoersmaalet er ogsaa om et KANONISK nett i det hele tatt kan varmstarte fra
#     et absolutt: vektene passer dimensjonsmessig, men representasjonen er doept om.
#
#   FRA BUNNEN (agent X sin plan, men paa dette korpuset): 20 epoker, lr 1e-3.
#     A0 absolutte farger   B0 kanoniske farger
#
# TRO-7 SELV maales paa samme holdout: treneren skriver TRO-BOT-K8-START foer
# foerste epoke, altsaa nettopp tro-7 paa disse radene. Fra A1-loggen er det tro-7
# paa ABSOLUTTE rader; fra B1-loggen er det tro-7 foret KANONISKE rader - hvor mye
# et absolutt nett taper paa aa faa fargene doept om under foettene.
#
# MENNESKERADENE ER UTE AV BEGGE ARMENE. Loekka trener med --tren-menneske, men
# D:/amb-grp/menneske/rader996 finnes bare i absolutt form, og en arm med kanoniske
# botrader og absolutte menneskerader ville vaert halvt kanonisk (se
# examples/mlb-trodata.ts). Begge armene er like uten dem, saa differansen staar.
set -u
cd /d/amb-agKA || exit 1
PY="bash /d/amb-k8/py-wsl.sh"
mkdir -p analyse
S=kk/tren-status.txt
logg() { echo "$(date +%FT%T) $*" >> "$S"; }
: > "$S"

for f in kk/abs-tren-0.bin kk/kan-tren-0.bin kk/abs-hold-0.bin kk/kan-hold-0.bin; do
  [ -s "$f" ] || { logg "STOPP: $f mangler"; exit 1; }
done
# FELLA FOER TRENINGEN: armene maa vaere like store rad for rad. Er de ikke det, er
# ikke «samme stillinger» sant, og hver differanse under sammenlikner to utvalg.
for p in tren-0 tren-1 tren-2 hold-0 hold-1; do
  a=$(stat -c %s "kk/abs-$p.bin" 2>/dev/null || echo x)
  b=$(stat -c %s "kk/kan-$p.bin" 2>/dev/null || echo y)
  [ "$a" = "$b" ] || { logg "STOPP: kk/abs-$p.bin ($a) og kk/kan-$p.bin ($b) er ulike store"; exit 1; }
done
logg "KORPUS ok: $(du -ch kk/abs-tren-*.bin | tail -1 | cut -f1) trening, $(du -ch kk/abs-hold-*.bin | tail -1 | cut -f1) holdout per arm"

# $1=navn $2=abs|kan $3=ekstra flagg
tren() {
  local navn=$1 arm=$2
  shift 2
  logg "TRENER $navn ($arm) $*"
  $PY verktoy/mlb-tro-tren.py \
    --tren "kk/$arm-tren-*.bin" --hold "kk/$arm-hold-*.bin" \
    --ut "analyse/agKA-tro-$navn.bin" \
    --logg "analyse/agKA-tro-$navn.jsonl" --rapport "analyse/agKA-tro-$navn.txt" \
    "$@" > "analyse/agKA-tren-$navn.log" 2>&1 || { logg "STOPP: $navn feilet, se analyse/agKA-tren-$navn.log"; return 1; }
  logg "FERDIG $navn: $(grep -aE '^TRO-BOT-K8-(START|BESTE)' "analyse/agKA-tren-$navn.log" | tr '\n' ' ')"
}

# VARMSTART — loekkas egen plan (adams-max-loop-v8.sh linje 127-130), uten menneskeradene.
tren A1 abs --vekter e1-modell/tro-7.bin --epoker 4 --lr 1e-4 --minne-dropout-bot 0.5 || exit 1
tren B1 kan --vekter e1-modell/tro-7.bin --epoker 4 --lr 1e-4 --minne-dropout-bot 0.5 || exit 1
# FRA BUNNEN — agent X sin plan, samme froe i begge armene (default 20260809).
tren A0 abs --epoker 20 --lr 1e-3 || exit 1
tren B0 kan --epoker 20 --lr 1e-3 || exit 1

k8() { grep -a "^$2 " "analyse/agKA-tren-$1.log" | tail -1 | awk '{print $2}'; }
SA=$(k8 A1 TRO-BOT-K8-START)   # tro-7 paa ABSOLUTTE holdoutrader
SK=$(k8 B1 TRO-BOT-K8-START)   # tro-7 paa KANONISKE holdoutrader
logg "TRO-7 paa holdouten: absolutt $SA, kanonisk-foret $SK"

# PARVIS, med trenerens egne tall som felle. Kanoniske nett leses paa kanoniske
# rader (--hold-for); fella i agX-k8-par.py krever at de to korpusene er rad-for-rad
# samme giv, stikk og sete med like mange usette kort.
$PY verktoy/agX-k8-par.py \
  --hold "kk/abs-hold-*.bin" \
  --nett "start=e1-modell/tro-7.bin" \
  --nett "A1=analyse/agKA-tro-A1.bin" \
  --nett "B1=analyse/agKA-tro-B1.bin" \
  --nett "A0=analyse/agKA-tro-A0.bin" \
  --nett "B0=analyse/agKA-tro-B0.bin" \
  --hold-for "B1=kk/kan-hold-*.bin" \
  --hold-for "B0=kk/kan-hold-*.bin" \
  --fasit "start=$SA" \
  --fasit "A1=$(k8 A1 TRO-BOT-K8-BESTE)" \
  --fasit "B1=$(k8 B1 TRO-BOT-K8-BESTE)" \
  --fasit "A0=$(k8 A0 TRO-BOT-K8-BESTE)" \
  --fasit "B0=$(k8 B0 TRO-BOT-K8-BESTE)" \
  --par "B1-A1" --par "B0-A0" --par "A1-start" --par "B1-start" \
  --ut analyse/agKA-k8-par.txt > analyse/agKA-k8-par.log 2>&1 || { logg "STOPP: parmaalingen feilet"; exit 1; }
logg "PARVIS ferdig -> analyse/agKA-k8-par.txt"
logg "ALT FERDIG"
