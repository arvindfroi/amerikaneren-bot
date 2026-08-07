#!/usr/bin/env bash
# KAMPPORTEN — den andre porten, som gate 2 ikke kan erstatte.
#
# ARVIND: «lag en komplett modell … med alle egenskaper og evner en menneske og
# en maskin kan ha.»
#
# ================= HVORFOR GATE 2 IKKE HOLDER ALENE =====================
#
# `examples/gate2.ts` lager FRISKE agenter per giv og stopper ved
# `RUNDE_SLUTT`. Konsekvensene er absolutte, ikke gradvise:
#
#   A2 / `okt:`     krever MIN_RUNDER = 4 observerte runder  ->  faar 1
#   `profil:`       fyller okt-boka over tid                 ->  samme
#   `race` (r0.4)   krever framdrift >= 0,3 av maalpoeng     ->  EKSAKT 0
#
# Racepresset er det klareste: `framdrift = max(egne, beste) / maal`, og hver
# giv starter paa 0-0. **`racepress` returnerer eksakt null i hver eneste
# gate2-maaling som noensinne er kjoert.** Parameteren `r0.4` i baade ADAMS_V6
# og ADAMS_V7 er en matematisk garantert nulloperasjon der.
#
# Og verre: korpusgenereringen spiller HELE kamper, saa de tre er AKTIVE naar
# etikettene lages og AVSLAATT naar vi bedoemmer. Vi betaler for dem og maaler
# dem aldri.
#
# `examples/kamp.ts` sa dette selv i hodet sitt fra dag én:
#
#     «Poengandelen er dermed pinnet til null i hvert eneste tall dette
#      prosjektet har produsert, og enhver strategi som avhenger av STILLINGEN
#      ... har vaert usynlig for benken.»
#
# Verktoeyet fantes altsaa. Ingen brukte det til aa BESTEMME noe. Denne fila er
# den manglende bruken.
#
# ================= KONTROLLARMEN ER 0,2500, IKKE 0 ======================
#
# Paa kampbenken er maaltallet ANDELEN kamper fokussetet vinner. Med fire like
# agenter er grunnlinja 25 %. Avviker kontrollen fra 0,2500, er benken i
# stykker og ingen andre tall kan leses - noeyaktig samme rolle som gate 2s
# 0,0000.
#
# PARRINGEN ER SVAKERE ENN I GATE 2, og det skal sies rett ut: kampene
# divergerer saa snart spillet gjoer det. Derfor trengs FLERE kamper for samme
# presisjon, ikke faerre.
set -u
cd "$(dirname "$0")/.."

KAND="${1:?spek for kandidaten}"
MILJO="${2:?spek for miljoeet}"
KAMPER="${3:-400}"
SKARD="${4:-16}"
FROE="${5:-700000000}"
MERKE="${6:-kampport}"

LOGG="analyse/kampport-${MERKE}.txt"
mkdir -p analyse
ekko() { echo "[$(date '+%m-%d %H:%M')] $*" | tee -a "$LOGG"; }

ekko "=== KAMPPORT: $MERKE ==="
ekko "kandidat: $KAND"
ekko "miljoe:   $MILJO"
ekko "$KAMPER kamper, $SKARD skard, froe $FROE"
ekko "PARRET modus - kamp-les.py krever fire rader per froe og virker ikke uparret."

rm -f "analyse/kp-${MERKE}s"*.jsonl
PIDER=""
for S in $(seq 0 $((SKARD - 1))); do
  nohup node examples/kamp.ts \
    --kandidat "$KAND" --miljo "$MILJO" \
    --kamper "$KAMPER" --froe "$FROE" --skard "${S}/${SKARD}" \
    --ut "analyse/kp-${MERKE}s${S}.jsonl" > "analyse/kp-${MERKE}-log-${S}.txt" 2>&1 &
  PIDER="$PIDER $!"
done
ekko "startet $SKARD skard"

# VENT TIL ALT ER INNE. §49: delresultater loey fire ganger paa én natt.
for P in $PIDER; do wait "$P" 2>/dev/null || true; done
ekko "alle skard ferdige - $(cat analyse/kp-${MERKE}s*.jsonl 2>/dev/null | wc -l) rader"

if [ -f verktoy/kamp-les.py ]; then
  /c/Python314/python.exe verktoy/kamp-les.py analyse/kp-${MERKE}s*.jsonl \
    --ut "analyse/kampport-${MERKE}-rapport.txt" >> "$LOGG" 2>&1 || \
    ekko "kamp-les.py feilet - raadataene ligger i analyse/kp-${MERKE}s*.jsonl"
  ekko "RESULTAT:"
  sed -n '1,40p' "analyse/kampport-${MERKE}-rapport.txt" 2>/dev/null | tee -a "$LOGG"
else
  ekko "kamp-les.py mangler - raadataene ligger i analyse/kp-${MERKE}s*.jsonl"
fi
