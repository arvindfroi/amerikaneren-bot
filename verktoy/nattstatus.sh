#!/bin/bash
# Status paa nattkjoeringen. Skriver til analyse/nattstatus.txt slik at den
# overlever at terminalen lukkes - regelen fra plan.md: aldri stol paa
# stdout-roer for flertimers maalinger.
cd "$(dirname "$0")/.."
{
  echo "=== $(date '+%H:%M:%S') ==="
  a=$(cat sd-natt-a/*.jsonl 2>/dev/null | wc -l)
  c=$(cat sd-natt-c/*.jsonl 2>/dev/null | wc -l)
  echo "ARM A (714, nye etiketter): $a rader"
  echo "ARM C (273, SAMME etiketter - breddekontrollen): $c rader"
  echo "levende prosesser: $(ps 2>/dev/null | grep -c node)"
  krasj=$(grep -l "Error" sd-natt-*/*.log 2>/dev/null | wc -l)
  echo "skard med feil: $krasj av 18"
  [ "$krasj" -gt 0 ] && grep -h "Error" sd-natt-*/*.log 2>/dev/null | sort -u | head -3
  echo "GPU: $(tail -1 analyse/b714gammel.log 2>/dev/null | head -c 100)"
} >> analyse/nattstatus.txt
