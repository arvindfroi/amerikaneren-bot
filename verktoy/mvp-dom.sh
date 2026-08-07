#!/usr/bin/env bash
# MVP-DOMMEN — er V7 et sprang, eller bare flere deler?
#
# ARVIND: «husk at delene må jo fungere sammen — fordi det skal utgjøre 1
# komplett modell. dette skal være et stort sprang i forhold til de andre
# Adams bottene.»
#
# Et sprang er ikke en påstand om arkitektur. Det er et tall, og det finnes
# ingen snarvei til det. Denne fila er den ene kjøringen som svarer.
#
# ================= HVORFOR TO PORTER OG IKKE ÉN =========================
#
# Gate 2 lager friske agenter per giv og stopper ved `RUNDE_SLUTT`. Tre av
# evnene i V7 er derfor STRUKTURELT usynlige der:
#
#   A2 / `okt:`     krever MIN_RUNDER = 4 observerte runder  ->  får 1
#   `profil:`       fyller okt-boka over tid                 ->  samme
#   `race` (r0.4)   krever framdrift >= 0,3 av målpoeng      ->  EKSAKT 0
#
# En V7-mot-V6-måling på gate 2 alene ville altså slått av en tredel av det
# som skiller dem, og så konkludert med at forskjellen er liten.
#
# Kampbenken spiller til `målPoeng` med agenter som HUSKER. Der lever de tre.
# Men parringen er svakere (kampene divergerer så snart spillet gjør det), så
# den trenger flere kamper for samme presisjon. Ingen av portene erstatter den
# andre.
#
# ================= KONTROLLARMENE ER ULIKE ==============================
#
#   gate 2       miljøet mot seg selv skal måle EKSAKT 0,0000
#   kampbenken   fire like agenter skal måle 0,2500 (andelen kamper vunnet)
#
# Avviker en av dem, er den benken i stykker og tallene fra den kan ikke leses
# uansett hvor pene de er.
#
# ================= OG DEN SVARER PÅ «GJØR DELENE HVERANDRE BEDRE?» ======
#
# Ett samlet tall sier bare OM det ble bedre. Derfor kjøres også hvert ledd
# alene mot samme miljø, på samme frø:
#
#     V7            alt påslått
#     V6+alle       bare rollene, uten b/g/sok
#     V6+b          bare A5
#     V6+sok        bare budsøket
#     V6            grunnlinja
#
# Er V7 bedre enn summen av leddene, samvirker de. Er den dårligere, kjemper
# de om det samme — som A6 og A7 gjorde om de frie kortvalgene, der A7 slettet
# koden A6 nettopp la inn.
set -u
cd "$(dirname "$0")/.."

GIVERE="${1:-4000}"
KAMPER="${2:-300}"
SKARD="${3:-16}"
MERKE="${4:-mvp}"

LOGG="analyse/mvp-dom-${MERKE}.txt"
mkdir -p analyse
ekko() { echo "[$(date '+%m-%d %H:%M')] $*" | tee -a "$LOGG"; }

NETT="vakt:abmpf:e1:e1-modell/d7alle.bin"
FOR="vr:e1-modell/vrakrang.bin:telrd"
BUD="budm:e1-modell/bud-vant.json@-3.0"
BUDSOK="budm:e1-modell/bud-vant.json@-3.0/0.6/0/-3.0/0/sok12k8b0.5"

# Grunnlinja er V6-formen: soek bare i foerersetet, A1-vekt, ingen b/g/sok.
V6="okt:${FOR}:amu:foerer:12k16sm1e0.25r0.4:profil:${BUD}:${NETT}"
V7="okt:${FOR}:amu:alle:12k16bgm1e0.25r0.4:profil:${BUDSOK}:${NETT}"
ALLE="okt:${FOR}:amu:alle:12k16sm1e0.25r0.4:profil:${BUD}:${NETT}"
BAYES="okt:${FOR}:amu:foerer:12k16bm1e0.25r0.4:profil:${BUD}:${NETT}"
SOK="okt:${FOR}:amu:foerer:12k16sm1e0.25r0.4:profil:${BUDSOK}:${NETT}"

ekko "=== MVP-DOMMEN: er V7 et sprang? ==="
ekko "gate 2: $GIVERE giv over $SKARD skard  (SE ca ±$(awk -v g=$GIVERE 'BEGIN{printf "%.3f", 0.163*sqrt(400/g)}'))"
ekko "kampbenk: $KAMPER kamper over $SKARD skard"
ekko "grunnlinje (miljoe): V6"

# ---------- PORT 1: GATE 2, alle ledd mot samme miljoe ----------
ekko "--- gate 2 ---"
rm -f "analyse/mvp-${MERKE}g"*.jsonl
P=""
for S in $(seq 0 $((SKARD - 1))); do
  nohup node examples/gate2.ts \
    --kandidat "$V7" --kandidat "$ALLE" --kandidat "$BAYES" --kandidat "$SOK" --kandidat "$V6" \
    --miljo "$V6" --froe 5100000 --giver "$GIVERE" --skard "${S}/${SKARD}" \
    --ut "analyse/mvp-${MERKE}g${S}.jsonl" > "analyse/mvp-${MERKE}-glog-${S}.txt" 2>&1 &
  P="$P $!"
done
for X in $P; do wait "$X" 2>/dev/null || true; done
node examples/gate2.ts --rapport "analyse/mvp-${MERKE}g*.jsonl" >> "$LOGG" 2>&1
ekko "GATE 2-RESULTAT:"
sed -n '1,24p' "analyse/mvp-${MERKE}g.txt" 2>/dev/null | tee -a "$LOGG"

# ---------- PORT 2: KAMPBENKEN, bare V7 mot V6 ----------
# Bare ett par her: kampbenken er dyr, og spoersmaalet den svarer paa er om
# HELHETEN vinner kamper - ikke hvilket ledd som bidro.
ekko "--- kampbenken ---"
rm -f "analyse/mvp-${MERKE}k"*.jsonl
P=""
for S in $(seq 0 $((SKARD - 1))); do
  nohup node examples/kamp.ts \
    --kandidat "$V7" --miljo "$V6" \
    --kamper "$KAMPER" --froe 700000000 --skard "${S}/${SKARD}" \
    --ut "analyse/mvp-${MERKE}k${S}.jsonl" > "analyse/mvp-${MERKE}-klog-${S}.txt" 2>&1 &
  P="$P $!"
done
for X in $P; do wait "$X" 2>/dev/null || true; done
ekko "kampbenk ferdig: $(cat analyse/mvp-${MERKE}k*.jsonl 2>/dev/null | wc -l) rader"
if [ -f verktoy/kamp-les.py ]; then
  /c/Python314/python.exe verktoy/kamp-les.py analyse/mvp-${MERKE}k*.jsonl \
    --ut "analyse/mvp-dom-${MERKE}-kamp.txt" >> "$LOGG" 2>&1 || \
    ekko "kamp-les.py feilet - raadata ligger i analyse/mvp-${MERKE}k*.jsonl"
  sed -n '1,30p' "analyse/mvp-dom-${MERKE}-kamp.txt" 2>/dev/null | tee -a "$LOGG"
fi

ekko "=== FERDIG ==="
ekko "LES SLIK: kontrollarmen paa gate 2 MAA vaere 0,0000 og kampbenkens"
ekko "kontroll 0,2500. Er de ikke det, er benken i stykker og ingen av de"
ekko "andre tallene kan leses. Og et sprang er ikke ett positivt tall - det"
ekko "skal replikeres i et disjunkt froebaand foer det adopteres."
