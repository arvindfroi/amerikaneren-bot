#!/usr/bin/env bash
# §126 SVEIP 2 — KL-BUDSJETTET er det bindende taket, ikke entropikoeffisienten.
#
# Sveip 1 maalte: uten entropitrykk naar policyen KL 0,0098 paa en HEL epoke
# (848 batcher, ingen frys). Med trykk nok til aa flytte en kollapset fase fyrer
# bremsen paa batch 4-18. Entropileddet og KL-bremsen slaass altsaa om det samme
# budsjettet, og bremsen vinner - det er §124s sykdom i ny drakt: FOERTI steg.
#
# Bremsen ble satt (§123) mot en policy som EKSPLODERTE til KL 5 299. Et bevisst
# entropitrykk paa 0,04 er ikke en eksplosjon. Spoersmaalet er derfor maalbart:
# hva skjer med verdihodet, logitene og fasene naar budsjettet heves?
set -u
cd /mnt/c/Users/arvin/Documents/Claude/Projects/amerikaneren-bot || exit 1
PY=~/Arvind-Lora/.venv/bin/python
INN='analyse/126-sveip/erf-s*.bin'
VEKT=e1-modell/v125/mlb-beste-e10.bin

kjor() {
  navn="$1"; shift
  echo "=== $navn ===" >> analyse/126-sveip2.txt
  $PY verktoy/mlb-gradient.py --inn "$INN" --vekter "$VEKT" \
    --ut "/tmp/126-$navn.bin" --epoke 0 --pass 16 --lr 5e-5 --lr-verdi 1e-3 \
    --kl-intervall 1 --opt-tilstand '' \
    --logg analyse/126-sveip2.jsonl --rapport analyse/126-sveip2.txt "$@" \
    >> analyse/126-sveip2-kjor.txt 2>&1
  echo "  [$navn kode $?]" >> analyse/126-sveip2.txt
}

FASE=0.01,0.01,0.01,0.01,0.01
FASE3=0.03,0.03,0.03,0.03,0.03
GULV=0.60,0.55,0.75,0.55,0.55

kjor F-0.01-kl0.10 --entropi-fase $FASE  --kl-maal 0.10 --kl-tak 0.20
kjor G-0.03-kl0.10 --entropi-fase $FASE3 --kl-maal 0.10 --kl-tak 0.20
kjor H-0.03-kl0.06 --entropi-fase $FASE3 --kl-maal 0.06 --kl-tak 0.12
kjor I-gulv0.3-kl0.10 --entropi-fase 0.3,0.3,0.3,0.3,0.3 --entropi-gulv $GULV --kl-maal 0.10 --kl-tak 0.20
kjor J-0.01-kl0.06 --entropi-fase $FASE  --kl-maal 0.06 --kl-tak 0.12
# KONTROLL: samme hevede budsjett, INGEN entropi per fase. Skiller «bremsen slapp
# policyen loes» fra «entropileddet virket». Uten den er hele sveipet ulesbart.
kjor K-flat0.01-kl0.10 --entropi 0.01 --kl-maal 0.10 --kl-tak 0.20
echo "SVEIP 2 FERDIG $(date)" >> analyse/126-sveip2.txt
