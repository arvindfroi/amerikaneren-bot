#!/usr/bin/env bash
# SØKET I ALLE ROLLER — den eksplisitte grensen på hvor god Adams kan bli.
#
# ARVIND: «jeg leter etter at du finner noe som hindrer fremgangen eller at vi
# har satt en implisitt (eller eksplisitt) grense på hvor god Adams kan bli nå.»
#
# ================= GRENSEN, FUNNET ======================================
#
# `ADAMS_V6` er `amu:foerer:...`. Søket kjører altså BARE i førersetet.
#
# Og fasegapet mot MesterAI (analyse/mesterai-fasegap.txt, 879 runder) sier
# hvor poengene faktisk går tapt:
#
#   rolle           andel   vår p/rd   MesterAI   diff
#   spillefører      27 %     +8,45      +8,45    +0,00
#   makker           22 %     +4,10      +4,32    −0,22
#   forsvarer        50 %     +1,07      +1,19    −0,12
#
# **Det dyreste verktøyet i stakken står påslått i det ENESTE setet der gapet
# er null, og avslått i de to rollene der hele tapet ligger — altså for 73 %
# av setene.**
#
# ================= HVORFOR DET VAR SLIK, OG HVORFOR DET IKKE GJELDER =====
#
# Det finnes en målt grunn, §49:
#
#     fører alene        +0,542 (5,14 SE)   fører +2,170 (z = +5,52)
#     fører + forsvar    +0,529 (3,99 SE)   forsvar −0,027 (z = −0,55)
#     «FORSVARSSØKET ER NULL.»
#
# Men den målingen ble gjort med `ork:` — PIMC-stil, som midler over verdener
# FØR valget og dermed later som vi får vite hvilken verden vi er i. Det er
# STRATEGIFUSJON, og den er ikke en detalj her: den drepte `eks:` og `juks:`
# i dette prosjektet.
#
# Fusjonen slår hardest nettopp i forsvar. Som fører legger man én plan for et
# spill man i stor grad styrer; som forsvarer avhenger riktig kort av hva
# makker vet og gjør, og «midle over verdener» er da maksimalt galt.
#
# **Alpha-mu ble bygget for å fjerne strategifusjon.** Nullmålingen på
# forsvarssøk er altså tatt med den operatoren som har feilen, og aldri
# gjentatt med den som retter den. En gammel null fra et ødelagt instrument
# låser konfigurasjonen for 73 % av setene.
#
# ================= HVA DENNE MÅLINGEN GJØR ==============================
#
# Kandidat: `amu:alle`. Miljø: `amu:foerer`. Alt annet likt, så bare ROLLEN
# søket kjører i skiller dem. Gate 2 bryter ned per rolle, så svaret kommer
# der spørsmålet er: flytter søket makker og forsvar?
#
# 4 000 giv gir SE ≈ ±0,05, altså nok til å se +0,10 med to SE margin (§97).
# M=1 er et SCREENINGSVALG: M=2 koster 5,3x og ville tatt 30 timer. alpha-mu
# med M=1 er allerede fusjonsfri ved selve beslutningen, som er den vi måler.
set -u
cd "$(dirname "$0")/.."

GIVERE="${1:-4000}"
SKARD="${2:-20}"
FROE="${3:-8100000}"
MERKE="${4:-rolle}"

M="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:e1-modell/d7alle.bin"
SOK="12k16sm1e0.25r0.4"
FOERER="amu:foerer:${SOK}:${M}"
ALLE="amu:alle:${SOK}:${M}"

LOGG="analyse/rollesok-${MERKE}.txt"
mkdir -p analyse
ekko() { echo "[$(date '+%m-%d %H:%M')] $*" | tee -a "$LOGG"; }

ekko "=== SOEK I ALLE ROLLER mot soek bare i foerersetet ==="
ekko "kandidat: amu:alle   miljoe: amu:foerer   $GIVERE giv, $SKARD skard, froe $FROE"
ekko "SE ved $GIVERE giv blir ca ±$(awk -v g=$GIVERE 'BEGIN{printf "%.3f", 0.163*sqrt(400/g)}')"

rm -f "analyse/rs-${MERKE}s"*.jsonl
PIDER=""
for S in $(seq 0 $((SKARD - 1))); do
  nohup node examples/gate2.ts \
    --kandidat "$ALLE" \
    --kandidat "$FOERER" \
    --miljo "$FOERER" \
    --froe "$FROE" --giver "$GIVERE" --skard "${S}/${SKARD}" \
    --ut "analyse/rs-${MERKE}s${S}.jsonl" > "analyse/rs-${MERKE}-log-${S}.txt" 2>&1 &
  PIDER="$PIDER $!"
done
ekko "startet $SKARD skard"

# VENT TIL ALLE ER FERDIGE. §49: «les aldri en gate2-fil foer kjoeringen er
# ferdig, uansett hvor fristende tallet ser ut.» Delresultater loey FIRE ganger
# paa én natt der - forsvarssoeket saa ut som +0,255, saa +0,125, og endte paa
# -0,027. Derfor rapporterer denne fila ingenting foer alt er inne.
for P in $PIDER; do wait "$P" 2>/dev/null || true; done
ekko "alle skard ferdige"

node examples/gate2.ts --rapport "analyse/rs-${MERKE}s*.jsonl" >> "$LOGG" 2>&1
ekko "RESULTAT:"
sed -n '1,40p' "analyse/rs-${MERKE}s.txt" 2>/dev/null | tee -a "$LOGG"
