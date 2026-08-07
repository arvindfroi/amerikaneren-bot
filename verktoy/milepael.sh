#!/usr/bin/env bash
# MILEPÆLSVAKT — natten driver seg selv.
#
# ARVIND: «du kan trene ganske lenge, men kontrollere litt underveis.»
#
# Å polle korpusstørrelsen manuelt er sløsing med tid som kunne gått til
# generering. Denne vakten venter på TERSKLER, og ved hver terskel gjør den
# hele syklusen selv: finjuster -> mål mot basis på gate 2 -> skriv til fil.
#
# HVORFOR TERSKLER OG IKKE TID: §91 målte −0,277 ± 0,348 med bare 10,0 %
# avgjorte på 7 516 rader. Det var ikke et resultat, det var for lite data.
# Statistisk styrke følger RADER, ikke klokketimer, så vakten skal være bundet
# til det som faktisk avgjør om målingen betyr noe.
#
# HVER MÅLING SKRIVES TIL FIL FØR DEN RAPPORTERES — aldri stdout-rør på
# flertimers arbeid.
#
# ALLE FLAGG ER VERIFISERT MOT KILDEN, ikke gjettet. Første utkast av denne
# fila brukte `--inn/--ut/--fra/--bredde` på sd-tren.py; ingen av dem finnes.
# Den ville feilet klokka tre om natten og etterlatt en tom loggfil — nøyaktig
# feilklassen «det målte og det kjørte var ikke samme ting».
set -u
cd "$(dirname "$0")/.."

KORPUS="${1:-sd-natt-c}"
BREDDE="${2:-273}"
BASIS="${3:-e1-modell/d7alle.bin}"
MERKE="${4:-cny}"
LOGG="analyse/milepael-${MERKE}.txt"
SKJULT="512,384,256"
WSLROT="/mnt/c/Users/arvin/Documents/Claude/Projects/amerikaneren-bot"
mkdir -p analyse

# Terskler valgt slik at hvert steg omtrent DOBLER datamengden. Et steg som
# bare legger på 20 % kan ikke skille «mer data hjalp» fra støy.
# Tersklene kan overstyres som femte argument, slik at en arm som allerede har
# kjoert en milepael kan starte paa den neste i stedet for aa gjenta arbeidet.
TERSKLER="${5:-25000 50000 100000 200000}"

ekko() { echo "[$(date '+%m-%d %H:%M')] $*" | tee -a "$LOGG"; }

ekko "=== MILEPAELSVAKT: $KORPUS, bredde $BREDDE, basis $(basename "$BASIS") ==="
ekko "terskler: $TERSKLER"

for T in $TERSKLER; do
  while :; do
    N=$(cat "$KORPUS"/*.jsonl 2>/dev/null | wc -l)
    [ "$N" -ge "$T" ] && break
    sleep 300
  done
  ekko "--- terskel $T naadd (n=$N) ---"

  NAVN="${MERKE}${T}"
  TRENLOGG="analyse/milepael-${NAVN}-tren.txt"

  # Læringsraten senkes ettersom korpuset vokser: en finjustering på 200k rader
  # tåler færre, større steg enn en på 25k før den glemmer det nettet kan.
  if [ "$T" -ge 100000 ]; then LR=5e-5; EP=4; else LR=1e-4; EP=6; fi

  ekko "trener $NAVN: startlr=$LR epoker=$EP fra $(basename "$BASIS")"
  # KJOERER I WSL PAA GPU. Windows-`python` er 3.8.10 og klarer ikke engang aa
  # PARSE sd-tren.py (`list[tuple[...]]` i en annotasjon evalueres ved def-tid);
  # 3.11 og 3.14 finnes, men uten torch. WSL-venvet har torch 2.11+cu128 med
  # CUDA, altsaa RTX-5080-en. Det er den eneste kombinasjonen som virker.
  #
  # SKJULT-SPEKKEN er lest ut av selve vektfila (512,384,256), ikke gjettet.
  # Feil arkitektur avvises hoeylytt av sd-tren.py, men et gjettet tall som
  # TILFELDIGVIS passer ville gitt et nett som ser ferdigtrent ut.
  #
  # --holdoutmappe MAA vaere blant --data (sd-tren.py haandhever det selv).
  if ! wsl -e bash -lc "cd $WSLROT && ~/Arvind-Lora/.venv/bin/python verktoy/sd-tren.py \
        --data '$KORPUS' --holdoutmappe '$KORPUS' \
        --kjor '${NAVN}:${KORPUS}:${SKJULT}' \
        --start '$BASIS' --startlr $LR --epoker $EP \
        --klipp $BREDDE --utmappe e1-modell \
        --logg 'analyse/milepael-${NAVN}-tren.jsonl'" \
        > "$TRENLOGG" 2>&1; then
    ekko "TRENING FEILET ved $T - se $TRENLOGG"
    continue
  fi
  VEKT="e1-modell/${NAVN}.bin"
  [ -f "$VEKT" ] || { ekko "INGEN VEKTFIL $VEKT - hopper over maalingen"; continue; }

  # Gate 2: kandidaten i ETT sete, miljøet i tre, parret på (giver, sete).
  # KONTROLLARMEN er miljøet mot seg selv og MÅ måle eksakt 0,0000 - ellers er
  # det seteskjevhet i oppsettet og ingen av de andre tallene kan leses.
  ekko "maaler $NAVN paa gate 2 (8 skard x 400 givere)..."
  rm -f "analyse/g2-${NAVN}s"*.jsonl
  for S in 0 1 2 3 4 5 6 7; do
    node examples/gate2.ts \
      --kandidat "vakt:abmpf:e1:${VEKT}" \
      --kandidat "vakt:abmpf:e1:${BASIS}" \
      --miljo "vakt:abmpf:e1:${BASIS}" \
      --froe 3000000 --giver 400 --skard "${S}/8" \
      --ut "analyse/g2-${NAVN}s${S}.jsonl" >> "$TRENLOGG" 2>&1 &
  done
  wait
  node examples/gate2.ts --rapport "analyse/g2-${NAVN}s*.jsonl" >> "$TRENLOGG" 2>&1
  ekko "RESULTAT $NAVN:"
  sed -n '1,40p' "analyse/g2-${NAVN}s.txt" 2>/dev/null | tee -a "$LOGG"
done

ekko "=== alle terskler kjoert ==="
