#!/usr/bin/env bash
# NESTE ADAMS-ITERASJON, ende til ende — én kommando.
#
#   bash verktoy/neste-adams.sh [korpusmappe] [epoker]
#
# SPØRSMÅLET DEN SVARER PÅ: bærer sansene? Det utrullede nettet ser 273 av 714
# trekk, og de 441 andre — stikksjanse, forventet fargelengde, renonssannsynlighet,
# hvem-la-hva — har aldri vært trent på. Fram til 5. august var de dessuten
# 95 % konstant null, så et negativt svar tidligere beviste ingenting.
#
# KONTROLLERT SAMMENLIKNING. To nett trenes på NØYAKTIG samme korpus, samme
# holdout, samme hyperparametere. Det eneste som skiller dem er BREDDEN:
#
#     b273   ser bare v1-kjernen        (det d7alle ser i dag)
#     b714   ser alt, inkludert sansene
#
# Da kan en forskjell ikke komme fra noe annet enn trekkene. Måler vi bare b714
# mot d7alle, blander vi sammen bredde, korpus og treningsoppsett.
#
# ALT SKRIVES TIL FIL. En flertimers kjøring som bare finnes i et stdout-rør er
# tapt i det terminalen lukkes — det har skjedd i dette prosjektet før.
set -u
KORPUS="${1:-sd-v10}"
EPOKER="${2:-40}"
PY="$HOME/Arvind-Lora/.venv/bin/python"
ADAMS="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmp"
RAPPORT="analyse/neste-adams.txt"

logg() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$RAPPORT"; }

mkdir -p analyse
: > "$RAPPORT"
logg "NESTE ADAMS — korpus $KORPUS, $EPOKER epoker"
RADER=$(cat "$KORPUS"/*.jsonl 2>/dev/null | wc -l)
logg "korpus: $RADER rader"
if [ "$RADER" -lt 20000 ]; then logg "FOR FÅ RADER — avbryter"; exit 1; fi

# Bredden i DATA må stemme med det vi tror. Den har driftet før.
BREDDE=$(head -1 "$KORPUS"/skard-0.jsonl | python -c "import sys,json;print(len(json.load(sys.stdin)['t']))")
logg "bredde i data: $BREDDE"
if [ "$BREDDE" != "714" ]; then logg "VENTET 714 — avbryter"; exit 1; fi

# --- 1. TREN BEGGE BREDDENE, samme alt ellers -----------------------------
logg "trener b273 og b714 …"
"$PY" verktoy/sd-tren.py --data "$KORPUS" --holdoutmappe "$KORPUS" \
  --kjor "b273:$KORPUS:512,384,256" --kjor "b714:$KORPUS:512,384,256" \
  --epoker "$EPOKER" --utmappe e1-modell --logg analyse/neste-adams-tren.jsonl \
  >> "$RAPPORT" 2>&1
logg "trening ferdig"

for N in b273 b714; do
  [ -f "e1-modell/$N.bin" ] || { logg "MANGLER e1-modell/$N.bin — avbryter"; exit 1; }
done

# --- 2. GATE 2 mot Adams-v4 -----------------------------------------------
logg "gate2 …"
rm -f analyse/na-g*.jsonl
for i in $(seq 0 11); do
  node examples/gate2.ts \
    --kandidat "$ADAMS:e1:e1-modell/b714.bin" \
    --kandidat "$ADAMS:e1:e1-modell/b273.bin" \
    --kandidat "$ADAMS:e1:e1-modell/d7alle.bin" \
    --miljo "$ADAMS:e1:e1-modell/d7alle.bin" \
    --froe 828000000 --giver 2000 --skard "$i/12" --ut "analyse/na-g$i.jsonl" \
    > "analyse/na-g$i.ut" 2>&1 &
done
wait
python verktoy/gate2-les.py "analyse/na-g*.jsonl" >> "$RAPPORT" 2>&1
logg "gate2 ferdig"

# --- 3. KAMPBENKEN — den som teller ---------------------------------------
# Rundebenken undervurderer med faktor 2,2 (målt 5. august), så et svakt
# gate2-tall er ikke et nei. Kampbenken måler det målet faktisk er formulert som.
logg "kampbenken …"
rm -f analyse/na-k*.jsonl
for i in $(seq 0 11); do
  node examples/kamp.ts \
    --kandidat "$ADAMS:e1:e1-modell/b714.bin" \
    --miljo "$ADAMS:e1:e1-modell/d7alle.bin" \
    --kamper 3000 --froe 515000000 --skard "$i/12" --ut "analyse/na-k$i.jsonl" \
    > "analyse/na-k$i.ut" 2>&1 &
done
wait
python verktoy/kamp-les.py "analyse/na-k*.jsonl" >> "$RAPPORT" 2>&1
logg "FERDIG — alt i $RAPPORT"
