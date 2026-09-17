#!/usr/bin/env bash
# LANG UBEMANNET KJØRING (14. sep). Kjører iterasjon $1..$2 med v12 etter hverandre.
# Stopper ved første STOPP. Skriver én linje per iterasjon til sammendraget, så
# eieren kan lese hele perioden på ett blikk uten å grave i status.txt.
set -u
FRA="${1:?fra}"; TIL="${2:?til}"
ST=/d/amb-grp/loop/status.txt
SAM=/d/amb-grp/loop/LANG-SAMMENDRAG.txt
{ echo ""; echo "===== LANG KJØRING START $(date +%F' '%H:%M) : iterasjon $FRA-$TIL ====="; } >> "$SAM"
for K in $(seq "$FRA" "$TIL"); do
  echo "[$(date +%H:%M)] starter iterasjon $K" >> "$SAM"
  bash /d/amb-imit/adams-max-loop-v12.sh "$K" > "/d/amb-grp/loop/iter$K-lang.log" 2>&1
  if grep -qa "\[iter $K\] STOPP" "$ST"; then
    echo "[$(date +%H:%M)] iterasjon $K STOPPET: $(grep -a "\[iter $K\] STOPP" "$ST" | tail -1 | cut -c1-160)" >> "$SAM"
    echo "KJEDEN AVBRUTT – se $ST" >> "$SAM"; exit 1
  fi
  hel=$(grep -a "\[iter $K\] HELPORT" "$ST" | tail -1 | sed 's/.*HELPORT: //' | cut -c1-110)
  hol=$(grep -a "\[iter $K\] HOLDOUT" "$ST" | tail -1 | sed 's/.*HOLDOUT[^:]*: //' | cut -c1-40)
  kra=$(grep -a "\[iter $K\] KRAV FERDIG" "$ST" | tail -1 | grep -oE "[0-9]+ av [0-9]+ rader")
  echo "[$(date +%H:%M)] iterasjon $K FERDIG | $kra | port: $hel | holdout: $hol" >> "$SAM"
done
echo "[$(date +%H:%M)] ===== ALLE ITERASJONER $FRA-$TIL FERDIGE =====" >> "$SAM"
