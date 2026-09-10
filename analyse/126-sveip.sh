#!/usr/bin/env bash
# §126 — HVOR STERK MAA ENTROPIBONUSEN VAERE? Maalt, ikke valgt.
#
# Samme data, samme startvekter, samme froe. Bare entropileddet endres.
# Hver kjoering legger EN rad i analyse/126-sveip.txt og EN i .jsonl.
set -u
cd /mnt/c/Users/arvin/Documents/Claude/Projects/amerikaneren-bot || exit 1
PY=~/Arvind-Lora/.venv/bin/python
INN='analyse/126-sveip/erf-s*.bin'
VEKT=e1-modell/v125/mlb-beste-e10.bin

kjor() {
  navn="$1"; shift
  echo "=== $navn ===" >> analyse/126-sveip.txt
  $PY verktoy/mlb-gradient.py --inn "$INN" --vekter "$VEKT" \
    --ut "/tmp/126-$navn.bin" --epoke 0 --pass 16 --lr 5e-5 --lr-verdi 1e-3 \
    --kl-maal 0.03 --kl-tak 0.06 --kl-intervall 1 --opt-tilstand '' \
    --logg analyse/126-sveip.jsonl --rapport analyse/126-sveip.txt "$@" \
    >> analyse/126-sveip-kjor.txt 2>&1
  echo "  [$navn kode $?]" >> analyse/126-sveip.txt
}

# A: §125 slik den star i dag - ett snitt over alle rader.
kjor A-flat0.01 --entropi 0.01
# B: per fase, samme koeffisient. Hver fase far sitt EGET snitt.
kjor B-fase0.01 --entropi-fase 0.01,0.01,0.01,0.01,0.01
# C: per fase, tyngre der kollapsen er (bud, trumf, etterlys).
kjor C-fase0.05 --entropi-fase 0.05,0.01,0.05,0.05,0.01
# D: hengsel med gulv. Presser BARE en fase som ligger under gulvet.
kjor D-gulv1.0 --entropi-fase 1,1,1,1,1 --entropi-gulv 0.60,0.55,0.75,0.55,0.55
# E: samme gulv, svakere press.
kjor E-gulv0.3 --entropi-fase 0.3,0.3,0.3,0.3,0.3 --entropi-gulv 0.60,0.55,0.75,0.55,0.55
echo "SVEIP FERDIG $(date)" >> analyse/126-sveip.txt
