#!/usr/bin/env bash
# Venter til vetomaalingen er komplett og kjoerer rapporten selv.
# §49: aldri les en gate2-fil foer kjoeringen er ferdig.
set -u
cd "$(dirname "$0")/.."
while :; do
  n=$(cat analyse/veto-s*.jsonl 2>/dev/null | wc -l)
  [ "$n" -ge 3600 ] && break
  # Doed hand: er alle skard borte uten aa naa maalet, stopp med beskjed.
  lev=$(powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*veto-s*' }).Count" 2>/dev/null | tr -d '\r ')
  if [ "${lev:-0}" = "0" ]; then
    echo "ADVARSEL: ingen skard lever, men bare $n av 3600 rader. Ufullstendig." | tee analyse/veto-rapport.txt
    exit 1
  fi
  sleep 60
done
node examples/gate2.ts --rapport "analyse/veto-s*.jsonl" > analyse/veto-rapport.txt 2>&1
echo "FERDIG - $(cat analyse/veto-s*.jsonl | wc -l) rader" >> analyse/veto-rapport.txt
