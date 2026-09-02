#!/usr/bin/env bash
#
# MLB FASE 0a, HELE KJEDEN I ÉN KOMMANDO — data → trening → K8-prøve → dom.
#
#   bash verktoy/mlb-fase0a.sh
#   PYTHON=~/Arvind-Lora/.venv/bin/python bash verktoy/mlb-fase0a.sh
#   TRENING_GIVER=10000 HOLDOUT_GIVER=2000 bash verktoy/mlb-fase0a.sh   # prøvekjøring
#
# ===================== HVORFOR DENNE FILA FINNES =========================
#
# Fase 0a er fire steg med hver sine flagg, og bare ETT av dem trenger Python.
# Kjørt for hånd er rekkefølgen lett å ta feil av, og den dyre feilen er å
# oppdage at treningssteget har et flaggavvik ETTER at datasteget har brent en
# time. Her kjøres stegene i rekkefølge, hvert med en sjekk på at forrige steg
# faktisk la igjen noe.
#
# ===================== DEN VIKTIGSTE EGENSKAPEN: GJENOPPTAKELIG ==========
#
# Hvert steg hopper over seg selv hvis utdataene alt finnes. Feiler Python-
# steget, koster det ingenting å rette og kjøre skriptet på nytt — de mange
# gigabytene med treningsdata blir liggende. Vil du tvinge et steg om igjen,
# slett utdataene (eller sett PAANYTT=1 for alt).
#
# ===================== FRØBÅNDENE ER LÅST I KODEN ========================
#
# `examples/mlb-trodata.ts` avsetter tre disjunkte bånd (trening g<100 000,
# holdout g<20 000, K8-prøven for seg). Standardverdiene under er nettopp de
# båndene fylt helt opp — ikke rør dem uten å lese §5 i `docs/mlb.md`, ellers
# kan trening og holdout begynne å overlappe.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PYTHON="${PYTHON:-python3}"
KJERNER="${KJERNER:-$(nproc 2>/dev/null || echo 4)}"
TRENING_GIVER="${TRENING_GIVER:-100000}"
HOLDOUT_GIVER="${HOLDOUT_GIVER:-20000}"
EPOKER="${EPOKER:-30}"
K8_GIVER="${K8_GIVER:-400}"
K8_VERDENER="${K8_VERDENER:-64}"
DATA="${DATA:-mlb-tro-data}"
NETT="${NETT:-e1-modell/mlb-tro.bin}"
PAANYTT="${PAANYTT:-0}"

if [ "$PAANYTT" = "1" ]; then rm -rf "$DATA" "$NETT" analyse/mlb-k8-*.jsonl analyse/mlb-k8-*.jsonl.delvis; fi
mkdir -p "$DATA" analyse

# ~24 rader per giv, ~2,7 kB per rad — mål på pilotkjøring 2026-09-02.
anslag() { echo $(( $1 * 24 * 2700 / 1000000000 )); }

echo "=============================================================="
echo "MLB fase 0a   kjerner=$KJERNER  python=$PYTHON"
echo "  trening $TRENING_GIVER giv (~$(anslag "$TRENING_GIVER") GB)"
echo "  holdout $HOLDOUT_GIVER giv (~$(anslag "$HOLDOUT_GIVER") GB)"
echo "=============================================================="

# --- Steg 0: er Python i det hele tatt brukbar? -------------------------
#
# Sjekkes FØR datasteget, ikke etter. Det er hele poenget: en manglende torch
# skal koste to sekunder, ikke en time.
if ! "$PYTHON" -c "import torch, numpy" 2>/dev/null; then
  echo "STOPP: «$PYTHON» mangler torch og/eller numpy."
  echo "       Sett PYTHON=... til virtualenv-en som har dem, f.eks."
  echo "       PYTHON=~/Arvind-Lora/.venv/bin/python bash verktoy/mlb-fase0a.sh"
  exit 1
fi
echo "steg 0: torch og numpy funnet i $PYTHON"

# --- Steg 1: datasettene ------------------------------------------------
# Per skard, ikke per bånd. Et avbrutt datasteg etterlater NOEN skard, og en
# glob-sjekk ville da hoppet over hele båndet og latt et halvt datasett se
# ferdig ut. Hvert skard skrives dessuten til «.delvis» og gis riktig navn
# først når noden har avsluttet med kode 0 — et skard som ble drept midtveis
# blir aldri forvekslet med et ferdig et.
lagBand() {
  local band=$1 giver=$2 i mangler=()
  for (( i = 0; i < KJERNER; i++ )); do
    [ -s "$DATA/$band-$i.bin" ] || mangler+=("$i")
  done
  if [ ${#mangler[@]} -eq 0 ]; then
    echo "steg 1 ($band): hopper over, alle $KJERNER skard finnes"
    return
  fi
  echo "steg 1 ($band): $giver giv, lager skard ${mangler[*]} av $KJERNER ..."
  for i in "${mangler[@]}"; do
    (
      node examples/mlb-trodata.ts --giver "$giver" --skard "$i/$KJERNER" \
        --band "$band" --ut "$DATA/$band-$i.bin.delvis" \
        && mv "$DATA/$band-$i.bin.delvis" "$DATA/$band-$i.bin"
    ) &
  done
  wait
  for (( i = 0; i < KJERNER; i++ )); do
    [ -s "$DATA/$band-$i.bin" ] || { echo "STOPP: $band-skard $i mangler etter datasteget."; exit 1; }
  done
}
lagBand trening "$TRENING_GIVER"
lagBand holdout "$HOLDOUT_GIVER"
du -sh "$DATA"

# --- Steg 2: treningen (det eneste steget som trenger Python) -----------
if [ -f "$NETT" ]; then
  echo "steg 2: hopper over, $NETT finnes alt (slett den for å trene på nytt)"
else
  echo "steg 2: trener trohodet, $EPOKER epoker ..."
  "$PYTHON" verktoy/mlb-tro-tren.py \
    --tren "$DATA/trening-*.bin" --hold "$DATA/holdout-*.bin" \
    --ut "$NETT" --epoker "$EPOKER"
  [ -f "$NETT" ] || { echo "STOPP: treningen la ikke igjen $NETT."; exit 1; }
fi

# --- Steg 3: K8-prøven --------------------------------------------------
k8mangler=()
for (( i = 0; i < KJERNER; i++ )); do
  [ -s "analyse/mlb-k8-$i.jsonl" ] || k8mangler+=("$i")
done
if [ ${#k8mangler[@]} -eq 0 ]; then
  echo "steg 3: hopper over, alle $KJERNER K8-skard finnes"
else
  echo "steg 3: K8-prøven, $K8_GIVER giv x $K8_VERDENER verdener, skard ${k8mangler[*]} ..."
  for i in "${k8mangler[@]}"; do
    (
      node examples/mlb-k8.ts --giver "$K8_GIVER" --verdener "$K8_VERDENER" \
        --vrakalfa 2 --nett "$NETT" --skard "$i/$KJERNER" \
        --ut "analyse/mlb-k8-$i.jsonl.delvis" \
        && mv "analyse/mlb-k8-$i.jsonl.delvis" "analyse/mlb-k8-$i.jsonl"
    ) &
  done
  wait
  for (( i = 0; i < KJERNER; i++ )); do
    [ -s "analyse/mlb-k8-$i.jsonl" ] || { echo "STOPP: K8-skard $i mangler."; exit 1; }
  done
fi

# --- Steg 4: dommen -----------------------------------------------------
echo "steg 4: dommen ..."
node analyse/mlb-k8-dom.mjs --ut analyse/mlb-k8-dom.txt analyse/mlb-k8-*.jsonl
echo
echo "=============================================================="
cat analyse/mlb-k8-dom.txt
echo "=============================================================="
echo
echo "Nettet: $NETT"
echo "Dommen: analyse/mlb-k8-dom.txt   treningslogg: analyse/mlb-tro-tren.txt"
echo
echo 'PASS/IKKE-PASS for K8: se "% av veien gulv -> tak" i dommen over.'
echo "  dagens beste (bayes+W)  4,37 %"
echo "  gulv+ (bare renonser)   5,82 %"
echo "  forrige MLB-trohode    12,34 %   <- tallet som skal slaas"
