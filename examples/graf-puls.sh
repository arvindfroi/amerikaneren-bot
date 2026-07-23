#!/bin/bash
# Graf-puls: oppdaterer GitHub Pages-grafen hvert 2. minutt.
# Kjøres som bakgrunnsprosess; overvåkingskjeden relanserer den ved behov.
cd /home/user/amerikaneren-bot
while true; do
  node examples/neat-graf.ts --pages > /dev/null 2>&1 || true
  sleep 120
done
