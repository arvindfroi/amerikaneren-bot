#!/usr/bin/env bash
# Lokal langtidstrening for kraftig maskin (f.eks. Lenovo Legion Pro 7i,
# Core Ultra 9). Kjører BEGGE linjer (C4 evolusjon-ren, D1 gradient-stack)
# med maks kjerneutnyttelse og en innebygd babysitter som relanserer ved
# krasj. Treningen tåler at maskinen sover/starter på nytt: befolkningen
# lagres hver 5. generasjon, og skriptet gjenopptar fra den.
#
#   bash examples/lokal-tren.sh                 # auto-kjerner, populasjon 128
#   bash examples/lokal-tren.sh 192             # populasjon 192
#   POPP=160 TRAADER=10 bash examples/lokal-tren.sh   # full overstyring
#
# Stopp: Ctrl-C (dreper begge linjer og babysitteren).
set -u
cd "$(dirname "$0")/.." || exit 1

# --- Kjernetelling (Linux / macOS / WSL) -----------------------------------
if command -v nproc >/dev/null 2>&1; then KJERNER=$(nproc)
elif command -v sysctl >/dev/null 2>&1; then KJERNER=$(sysctl -n hw.ncpu)
else KJERNER=8; fi

POPP="${1:-${POPP:-128}}"
# To linjer kjører samtidig, så del kjernene: hver linje får (kjerner-2)/2
# arbeidstråder (min 2). GPU-en hjelper ikke – dette er ren CPU.
STD_TR=$(( (KJERNER - 2) / 2 )); [ "$STD_TR" -lt 2 ] && STD_TR=2
TRAADER="${TRAADER:-$STD_TR}"

echo "Maskin: $KJERNER kjerner → $TRAADER tråder per linje, populasjon $POPP"
echo "C4 (evolusjon-ren) + D1 (gradient: sluttsøk+spillfasit+budfasit)"

start_c4() {
  nohup node examples/neat-vakt.ts 8000 "$POPP" 616161 --hall 16 --dir trening-c4 \
    --fra-flere trening-c4/start.json --tråder "$TRAADER" --kampfrø 2 --portvakter 4 \
    >> trening-c4.log 2>&1 &
}
start_d1() {
  nohup node examples/neat-vakt.ts 8000 "$POPP" 717171 --hall 16 --dir trening-d1 \
    --fra-flere trening-d1/start.json --tråder "$TRAADER" --kampfrø 2 --portvakter 4 \
    --sluttsøk 4 --spillfasit --budfasit >> trening-d1.log 2>&1 &
}

# Ryddig avslutning: drep barna ved Ctrl-C.
trap 'echo; echo "stopper…"; pkill -P $$ 2>/dev/null; exit 0' INT TERM

start_c4; start_d1
echo "Startet. Logger: trening-c4.log / trening-d1.log. Ctrl-C for å stoppe."

# --- Babysitter: relanser en linje som har dødd ----------------------------
while true; do
  sleep 60
  pgrep -f "616161 --hall" >/dev/null 2>&1 || { echo "$(date '+%H:%M') relanserer C4"; start_c4; }
  pgrep -f "717171 --hall" >/dev/null 2>&1 || { echo "$(date '+%H:%M') relanserer D1"; start_d1; }
done
