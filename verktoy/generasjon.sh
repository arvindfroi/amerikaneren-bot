#!/usr/bin/env bash
# GENERASJONSLØKKA — det som faktisk gjør systemet selvlærende.
#
# ARVIND: «pass på at den lærer av seg selv.»
#
# ================= HULLET DENNE FYLLER ===================================
#
# Nattkjøringen genererte med `--spiller ADAMS --motpart ADAMS`, der ADAMS
# bruker `d7alle`. Korpuset kom altså alltid fra SAMME generasjon. Det er én
# destillasjon — søket lærer nettet noe nettet ikke visste — men det er ikke en
# løkke. Etter én runde er kilden oppbrukt.
#
# Selvlæring krever at det nye nettet settes TILBAKE i generatoren:
#
#     nett_n  →  spiller bedre  →  søket blir bedre (det bruker nettet som
#     prior og som rolloutspiller)  →  bedre etiketter  →  nett_{n+1}
#
# Det er den samme strukturen AlphaZero har: søket forbedrer politikken,
# destillasjonen fanger forbedringen i vektene, og runden gjentas.
#
# ================= HVORFOR BASIS ALLTID ER `d7alle` ======================
#
# Kandidaten finjusteres fra `d7alle` HVER generasjon, ikke fra forrige
# generasjon. Det ser bakvendt ut og er et bevisst valg:
#
#   Å stable finjusteringer komponerer drift. Hver runde arver forrige rundes
#   skjevheter og legger sine egne på toppen, og ingen enkeltmåling ser det.
#   Med fast basis kommer HELE forbedringen fra at korpuset er bedre — som er
#   nøyaktig det vi vil måle.
#
#   Korpuset AKKUMULERES over generasjoner (`--data` tar alle mappene). Så
#   datamengden vokser selv om startpunktet står stille, og en generasjon som
#   ikke ble forfremmet har likevel bidratt med rader.
#
# ================= PORTEN: ALDRI FORFREMME PÅ STØY =======================
#
# Et nytt nett blir generator bare om det slår det sittende på gate 2 med
# POSITIVT SNITT **og** flertall i tegntesten. Feiler det, beholdes det
# sittende og korpuset vokser videre — en generasjon som ikke overbeviser er
# ikke en generasjon som forkastes, den er en generasjon som ikke er ferdig.
#
# Kontrollarmen må måle eksakt 0. Gjør den ikke det, avbrytes forfremmelsen
# uansett hva kandidaten målte, for da er benken i stykker.
#
# ================= OG KOLLAPSVAKTEN GÅR HVER RUNDE =======================
#
# `verktoy/kollaps.py` måler mot fremmede korpus og skriver til en jsonl som
# VOKSER. Ett tall derfra bestemmer ingenting; kurven over generasjoner er det
# som skiller fordelingskollaps fra riktig uenighet med en svakere fasit.
set -u
cd "$(dirname "$0")/.."

MESTER="${1:-e1-modell/d7alle.bin}"      # sittende generator
BASIS="${2:-e1-modell/d7alle.bin}"       # fast finjusteringsstart, se over
BREDDE="${3:-273}"
SKARD="${4:-8}"
TERSKEL="${5:-40000}"                    # nye rader per generasjon
GENSTART="${6:-1}"
FREMMED="${7:-sd-frys2,sd-rv1}"          # kollapsprober

SKJULT="512,384,256"
WSLROT="/mnt/c/Users/arvin/Documents/Claude/Projects/amerikaneren-bot"
FASTE="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:e1:"
LOGG="analyse/generasjon.txt"
mkdir -p analyse

ekko() { echo "[$(date '+%m-%d %H:%M')] $*" | tee -a "$LOGG"; }

# EKSTRA er korpus som finnes fra FØR løkka startet - nattkjøringens
# `sd-natt-c` er generasjon 0 i alt annet enn navn: samme generator, samme
# orakel, samme port, bare uten forfremmelsestrinnet. Å kaste de radene fordi
# de ble laget før løkka fikk et navn ville vært sløsing.
EKSTRA="${8:-sd-natt-c}"

# Alle korpus fra og med gen 1 akkumuleres inn i treningen.
KORPUSLISTE="$EKSTRA"
for g in $(seq 1 $((GENSTART - 1))); do
  [ -d "sd-gen$g" ] && KORPUSLISTE="${KORPUSLISTE:+$KORPUSLISTE,}sd-gen$g"
done

ekko "=== GENERASJONSLØKKE start: mester $(basename "$MESTER"), bredde $BREDDE ==="
ekko "basis $(basename "$BASIS") (fast), $SKARD skard, terskel $TERSKEL rader/gen"

GEN=$GENSTART
while :; do
  KORPUS="sd-gen$GEN"
  mkdir -p "$KORPUS"
  SPEK="${FASTE}${MESTER}"

  ekko "--- GEN $GEN: genererer med $(basename "$MESTER") -> $KORPUS ---"
  for S in $(seq 0 $((SKARD - 1))); do
    nohup node examples/sd-orakel.ts --skard "$S/$SKARD" --kamper 100000 \
      --bredde "$BREDDE" --slutning bayes --orakel amu --amum 2 \
      --spredning 0.5 --verdener 12 --kandidater 16 \
      --spiller "$SPEK" --motpart "$SPEK" \
      --froe $((91000000 + GEN * 1000000)) \
      --ut "$KORPUS/skard-$S.jsonl" > "$KORPUS/log-$S.txt" 2>&1 &
  done

  # Vent til generasjonen har nok NYE rader.
  while :; do
    N=$(cat "$KORPUS"/*.jsonl 2>/dev/null | wc -l)
    [ "$N" -ge "$TERSKEL" ] && break
    sleep 300
  done
  ekko "GEN $GEN: $N rader - stopper generatorene og trener"
  pkill -f "sd-orakel.ts --skard .*$KORPUS" 2>/dev/null
  sleep 5

  ALLE="${KORPUSLISTE:+$KORPUSLISTE,}$KORPUS"
  NAVN="gen${GEN}"
  KAND="e1-modell/${NAVN}.bin"
  TRENLOGG="analyse/gen${GEN}-tren.txt"

  ekko "GEN $GEN: trener $NAVN fra $(basename "$BASIS") paa [$ALLE]"
  if ! wsl -e bash -lc "cd $WSLROT && ~/Arvind-Lora/.venv/bin/python verktoy/sd-tren.py \
        --data '$ALLE' --holdoutmappe '$KORPUS' \
        --kjor '${NAVN}:${ALLE}:${SKJULT}' \
        --start '$BASIS' --startlr 1e-4 --epoker 6 \
        --klipp $BREDDE --utmappe e1-modell \
        --logg 'analyse/gen${GEN}-tren.jsonl'" > "$TRENLOGG" 2>&1; then
    ekko "GEN $GEN: TRENING FEILET - se $TRENLOGG. Beholder mester og fortsetter."
    KORPUSLISTE="$ALLE"; GEN=$((GEN + 1)); continue
  fi
  [ -f "$KAND" ] || { ekko "GEN $GEN: ingen vektfil - beholder mester"; KORPUSLISTE="$ALLE"; GEN=$((GEN+1)); continue; }

  # KOLLAPSVAKTEN FØRST, slik at tallet finnes uansett hva porten sier.
  ekko "GEN $GEN: kollapsvakt mot [$FREMMED]"
  wsl -e bash -lc "cd $WSLROT && ~/Arvind-Lora/.venv/bin/python verktoy/kollaps.py \
      --nett '$MESTER,$KAND' --korpus '$FREMMED,$KORPUS' --bredde $BREDDE \
      --merk 'gen$GEN' --ut 'analyse/kollaps-gen${GEN}.txt'" >> "$TRENLOGG" 2>&1 || true
  sed -n '4,12p' "analyse/kollaps-gen${GEN}.txt" 2>/dev/null | tee -a "$LOGG"

  # PORTEN.
  ekko "GEN $GEN: gate 2 mot sittende mester"
  rm -f "analyse/g2-${NAVN}s"*.jsonl
  for S in 0 1 2 3 4 5 6 7; do
    node examples/gate2.ts --kandidat "vakt:abmpf:e1:${KAND}" \
      --kandidat "vakt:abmpf:e1:${MESTER}" --miljo "vakt:abmpf:e1:${MESTER}" \
      --froe $((3000000 + GEN * 500000)) --giver 400 --skard "${S}/8" \
      --ut "analyse/g2-${NAVN}s${S}.jsonl" >> "$TRENLOGG" 2>&1 &
  done
  wait
  node examples/gate2.ts --rapport "analyse/g2-${NAVN}s*.jsonl" >> "$TRENLOGG" 2>&1
  RAP="analyse/g2-${NAVN}s.txt"
  sed -n '1,14p' "$RAP" 2>/dev/null | tee -a "$LOGG"

  # Les kandidatens parrede linje: «<navn>  <snitt> ± <se> (<z> SE)  <a>/<b>  p=<p>»
  LINJE=$(grep -F "$(basename "$KAND")" "$RAP" 2>/dev/null | grep -E "^\s+vakt" | head -1)
  SNITT=$(echo "$LINJE" | awk '{for(i=1;i<=NF;i++) if($i ~ /^[+-][0-9]/){print $i; exit}}')
  BROK=$(echo "$LINJE" | grep -oE "[0-9]+/[0-9]+" | head -1)
  # «^KONTROLL» alene traff OGSAA setningen «KONTROLLARMEN skal ligge paa 0»,
  # saa variabelen ble tolinjet og kontrollsjekken hadde slaatt ut HVER eneste
  # gang - en stille, permanent blokkering av all forfremmelse. Loekka ville
  # kjoert i det uendelige uten aa forfremme noe, og loggen ville sagt «benken
  # er i stykker» om en benk som var helt i orden.
  # «^KONTROLL[[:space:]]» utelukker KONTROLLARMEN, som ikke har mellomrom.
  KONTROLL=$(grep -E "^KONTROLL[[:space:]]" "$RAP" 2>/dev/null | head -1 | awk '{print $2}')

  GODKJENT=0
  if [ -n "${SNITT:-}" ] && [ -n "${BROK:-}" ]; then
    A=${BROK%/*}; B=${BROK#*/}
    # Kontrollarmen MAA vaere null. Er den ikke det, er benken i stykker og
    # kandidatens tall kan ikke leses uansett hvor pent det ser ut.
    case "$KONTROLL" in
      +0.000|-0.000|0.000|+0.0000|-0.0000) ;;
      *) ekko "GEN $GEN: KONTROLLARMEN er $KONTROLL, ikke 0 - benken er i stykker, INGEN forfremmelse"; A=0; B=1;;
    esac
    POS=$(echo "$SNITT" | grep -c "^+" || true)
    FLERTALL=$(awk -v a="$A" -v b="$B" 'BEGIN{print (b>0 && a > b/2) ? 1 : 0}')
    [ "$POS" = "1" ] && [ "$FLERTALL" = "1" ] && GODKJENT=1
  fi

  if [ "$GODKJENT" = "1" ]; then
    ekko "GEN $GEN: FORFREMMET ($SNITT, tegntest $BROK). Ny mester: $NAVN"
    MESTER="$KAND"
  else
    ekko "GEN $GEN: ikke forfremmet (${SNITT:-?}, tegntest ${BROK:-?}). Mester staar; korpuset vokser videre."
  fi

  KORPUSLISTE="$ALLE"
  GEN=$((GEN + 1))
done
