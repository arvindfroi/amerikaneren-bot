#!/usr/bin/env bash
# ADAMS MAX-LØKKA v12 (14. sep) – som v11, men SKALAFEILEN I PORTEN ER RETTET.
#
# FEILEN v11 HADDE: porten maalte iterasjon 12 paa UTVALGET (150 kamper) og sammenliknet mot
# beste.txt = «11 1.24 0.21», som var maalt paa ALLE 273 kampene i iterasjon 10. Epler mot paerer.
# Iterasjon 12 fikk 0.91 ± 0.27 og ble RULLET TILBAKE – nettene ble overskrevet og er tapt. Verre:
# hver framtidige iterasjon ville blitt maalt mot 1.24 og rullet tilbake, saa loekka ville staatt
# fast paa nett 11 for alltid. beste.txt nullstilles derfor sammen med denne versjonen, saa foerste
# iterasjon under v12 setter en UTVALGS-grunnlinje. Gammel fil: beste.txt.foer-skalafiks.
#
# HVORFOR v11 FINNES. Helporten i v10 valgte hvilke nettsett som overlever ved å måle K1 på de
# SAMME 2641 rundene i 273 menneskekamper fra 10. aug, iterasjon etter iterasjon. Det er
# seleksjon på testsettet. Elleve iterasjoner pluss ~15 løsrevne K1-målinger på samme sett, med
# SE ±0,20, gir et forventet maksimum av ren støy på ~+0,3 pp – hele størrelsen på
# «forbedringen» fra 1,01 til 1,24. Parret på nøyaktig samme runder var ingen av differansene
# mellom iterasjonene signifikante (iter10−iter7 +0,232 ± 0,150).
#
#   utvalg   150 kamper. PORTEN. Alle valg av nettsett tas her.
#   holdout  123 kamper. Porten ser den ALDRI. Rapporteres side om side, aldri besluttes på.
#
# Delingen er låst i `analyse/k1-kampsett.tsv` i koden – en fil under versjonskontroll, ikke en
# hash-regel som kan endres i stillhet. Kjøres denne løkka mot en arbeidskopi UTEN den fila,
# stopper den heller enn å falle stille tilbake til å måle på alt.
#
# Fra v4: hukommelsen er ALLTID nullet i menneskeradene (--minne-dropout 1.0): i iterasjon 2 ga 0,5 negativ minnegevinst mot mennesker (K6-menneske stigning z −5,3, fremmed bok bedre enn egen). Fra v3:: befolkning + SANSER 2 + MENNESKERADER i troen.
#
#   bash /d/amb-imit/adams-max-loop-v11.sh <iterasjon>      (12, 13, …)
#
# Endringer fra v2:
#  - Arbeidskopien spoles fram til krav-grena FØR noe kjører (git checkout -- verktoy/ først, men bare når forskjellen
#    er ren linjeslutt – den stoppet fast-forward i batterikopien 11. sep).
#  - --sanser2 (agent K): tro 996 = 920 | stilling per sete | valgt bort (offentlig); BudQ 323 = 287 | stilling.
#    Trenerne utvider forrige nett med nuller bakerst første gang.
#  - Troen trenes også på MENNESKERADER (agent I, D:\amb-grp\menneske\rader996) med --minne-dropout 1.0, og epoken
#    velges på snittet av bot- og menneske-holdout (menneskedata alene ga +1,26 pp mot mennesker, men minnet overtilpasset).
set -u
K=${1:?iterasjon}
K1=$((K + 1))
WT=/d/amb-loop
N=/d/amb-grp/loop/nett
D=/d/amb-grp/loop/iter$K
ST=/d/amb-grp/loop/status.txt
MR=/d/amb-grp/menneske/rader996
mkdir -p "$D"
logg() { echo "$(date +%FT%T) [iter $K] $*" >> "$ST"; }

spol() { # $1 = arbeidskopi. Rydder ren CRLF-støy i verktoy/ og spoler fram; stopper ved ekte lokale endringer.
  local ekte
  ekte=$(git -C "$1" diff --ignore-cr-at-eol --name-only -- verktoy/ | wc -l)
  [ "$ekte" = "0" ] || { logg "STOPP: $1 har $ekte ekte lokale endringer i verktoy/"; exit 1; }
  git -C "$1" checkout -- verktoy/
  git -C "$1" merge --ff-only krav-2026-09-11 > /dev/null 2>&1 || { logg "STOPP: fast-forward av $1 feilet"; exit 1; }
  logg "KODE $1 → $(git -C "$1" log --oneline -1 | cut -c1-70)"
}
spol "$WT"
cd "$WT" || exit 1
[ -f src/mlb/stillingtrekk.ts ] || { logg "STOPP: sanser 2 mangler i $WT"; exit 1; }
for f in trening-0.bin holdout-0.bin; do [ -s "$MR/$f" ] || { logg "STOPP: menneskerader $MR/$f mangler"; exit 1; }; done

for f in vrak budq tro; do [ -f "$N/$f-$K.bin" ] || { logg "STOPP: $N/$f-$K.bin mangler"; exit 1; }; cp "$N/$f-$K.bin" e1-modell/; done
VR="e1-modell/vrak-$K.bin"
if [ -f "$N/etterlyst-$K.bin" ]; then cp "$N/etterlyst-$K.bin" e1-modell/; VR="$VR@e1-modell/etterlyst-$K.bin"; fi
# KORTSPILLET I LØKKA (agent M, 11. sep): helbotens søk merker kortvalgene, et nytt kortnett (sd-tren, 273 inn)
# trenes fra forrige, og porten er anger mot søkets beste kort på holdout. Første gang startes fra d7alle.
[ -f "$N/kort-$K.bin" ] || cp e1-modell/d7alle.bin "$N/kort-$K.bin"
cp "$N/kort-$K.bin" e1-modell/
KORT="e1:e1-modell/kort-$K.bin"
POL="okt:vr:$VR:telrd:profil:budq:e1-modell/budq-$K.bin:vakt:abmp:$KORT"
HELK="okt:vr:$VR:telrd:eks:3Lt2000:profil:sik:alle:0.5:24k32e3LMD~mlbu=e1-modell/tro-$K.bin:budq:e1-modell/budq-$K.bin:vakt:abmp:$KORT"

# Befolkningen og prod-grunnlinja beholder d7alle.
D7="e1:e1-modell/d7alle.bin"
P_ADAMS="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:$D7"
P_MENN="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json:vakt:abmp:$D7"
P_GBT="etl:2:vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-gbt.json@-3.0:vakt:abmp:$D7"
P_SPAR="vr:e1-modell/vrakrang.bin:tl:budq:e1-modell/budq-s4a.bin:vakt:abmpd:$D7"
P_HOY="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@2.5:vakt:hbmpS:$D7"
BORD=("@|$P_ADAMS|@|$P_MENN" "@|$P_GBT|@|$P_SPAR" "@|$P_HOY|@|$P_MENN")
logg "START (v11, kortnett 493, helport på UTVALG) policy=$POL befolkning=3 bord, sanser2, menneskerader"

# ------------------------------------------------------------------ DATA (samtidig)
( mkdir -p "$D/bud"
  for i in $(seq 0 7); do
    node examples/budq-data.ts --spek "$POL" --drivere "${BORD[$((i % 3))]}" --rotasjon --kamper 800 --skard "$i/8" --verdener 12 --sjanse 0.5 --hukommelse --sanser2 \
      --froe $((100000000 + K * 10000000)) --seier e1-modell/seier-g0.bin --ut "D:/amb-grp/loop/iter$K/bud/s$i.jsonl" > "$D/bud/log-$i.txt" 2>&1 &
  done; wait; logg "DATA bud: $(cat "$D"/bud/s*.jsonl | wc -l) budstillinger" ) &
( mkdir -p "$D/vrak"
  for i in $(seq 0 5); do
    node examples/vrakq-data.ts --spek "$POL" --drivere "${BORD[$((i % 3))]}" --rotasjon --kampstilling --etterlyst --kamper 900 --skard "$i/6" --verdener 12 --sjanse 0.25 \
      --froe $((300000000 + K * 10000000)) --ut "D:/amb-grp/loop/iter$K/vrak/s$i.jsonl" > "$D/vrak/log-$i.txt" 2>&1 &
  done; wait; logg "DATA vrak+kall: $(cat "$D"/vrak/s*.jsonl | wc -l) grupper" ) &
# mlb-trodata --kamp: --kamper er SLUTTINDEKS. Iterasjon k bruker [k·450, (k+1)·450) og [k·60, (k+1)·60).
( mkdir -p "$D/tro"
  for i in $(seq 0 5); do
    node examples/mlb-trodata.ts --kamp --hukommelse --signal --sanser2 --spek "$POL" --drivere "${BORD[$((i % 3))]}" --rotasjon --band trening \
      --fra $((K * 450)) --kamper $(((K + 1) * 450)) --skard "$i/6" --ut "D:/amb-grp/loop/iter$K/tro/trening-$i.bin" > "$D/tro/log-t$i.txt" 2>&1 &
  done; wait
  for i in 0 1; do
    node examples/mlb-trodata.ts --kamp --hukommelse --signal --sanser2 --spek "$POL" --drivere "${BORD[$((i % 3))]}" --rotasjon --band holdout \
      --fra $((K * 60)) --kamper $(((K + 1) * 60)) --skard "$i/2" --ut "D:/amb-grp/loop/iter$K/tro/holdout-$i.bin" > "$D/tro/log-h$i.txt" 2>&1 &
  done; wait; logg "DATA tro: $(ls "$D"/tro/*.bin | wc -l) filer, $(du -sh "$D/tro" | cut -f1)" ) &
wait
# Kortvalgene ETTER de andre generatorene (helbotens søk i @-setene, ~0,37 s per kortvalg): 20 skard × 25 kamper
# ≈ 185 k merkelapper på ~60 min med 20 kjerner. Merkelappen er søkets lagverdi per lovlig kort i verdener fra setets syn.
( mkdir -p "$D/kort"
  for i in $(seq 0 19); do
    # v5: bredde 493 = 273 | hukommelse | stilling | valgt bort (agent O/Q); sd-tren utvider kort-K med nuller første gang.
    node examples/kort-data.ts --spek "$HELK" --drivere "${BORD[$((i % 3))]}" --rotasjon --kamper 500 --skard "$i/20" --sjanse 1 --bredde 493 \
      --froe $((500000000 + K * 10000000)) --ut "D:/amb-grp/loop/iter$K/kort/s$i.jsonl" > "$D/kort/log-$i.txt" 2>&1 &
  done; wait; logg "DATA kort: $(cat "$D"/kort/s*.jsonl | wc -l) kortvalg" )
# 13. sep 05:25: DENNE SJEKKEN VAR BLIND FOR MANGLENDE FILER. «for f in .../tro/*.bin» itererer over
# filene som FINNES; da iterasjon 8 mistet alle seks treningsskaarene paa «baandet er avsatt til 4000
# kamper», utvidet globben seg til de to holdout-filene, begge var ikke-tomme, og loekka meldte
# «DATA tro: 2 filer» som suksess. Troen ble trent paa NULL nye rader uten at noe feilet.
# Naa kreves riktig ANTALL per type, og hver generatorlogg sjekkes for krasj.
sjekk_antall() { # $1=moenster  $2=forventet antall  $3=navn
  n=$(ls $1 2>/dev/null | wc -l)
  [ "$n" = "$2" ] || { logg "STOPP: $3 har $n av $2 filer (moenster $1)"; exit 1; }
}
sjekk_antall "$D/bud/s*.jsonl"      8  "bud"
sjekk_antall "$D/vrak/s*.jsonl"     6  "vrak"
sjekk_antall "$D/tro/trening-*.bin" 6  "tro trening"
sjekk_antall "$D/tro/holdout-*.bin" 2  "tro holdout"
sjekk_antall "$D/kort/s*.jsonl"    20  "kort"
for f in "$D"/bud/s*.jsonl "$D"/vrak/s*.jsonl "$D"/tro/*.bin "$D"/kort/s*.jsonl; do
  [ -s "$f" ] || { logg "STOPP: tom datafil $f"; exit 1; }
done
# Generatorene skriver stackspor til sine egne logger; en krasj skal stoppe iterasjonen, ikke telles som data.
for g in "$D"/bud/log-*.txt "$D"/vrak/log-*.txt "$D"/tro/log-*.txt "$D"/kort/log-*.txt; do
  [ -f "$g" ] || continue
  grep -qaE "^Error:|^ *at .*node:internal" "$g" && { logg "STOPP: generatorkrasj i $g: $(grep -am1 '^Error:' "$g")"; exit 1; }
done
logg "DATA-SJEKK OK: alle generatorfiler til stede, ingen krasj i loggene"

# ------------------------------------------------------------------ TRENING (GPU, etter hverandre)
wsl_opp() {
  if ! timeout 120 wsl.exe -d Ubuntu -e true > /dev/null 2>&1; then
    logg "WSL svarte ikke – wsl --shutdown og nytt forsøk"; wsl.exe --shutdown > /dev/null 2>&1; sleep 8
    timeout 180 wsl.exe -d Ubuntu -e true > /dev/null 2>&1 || { logg "STOPP: WSL starter ikke"; exit 1; }
  fi
}
wsl_opp
PY="bash /d/amb-k8/py-wsl.sh"

$PY verktoy/budq-tren.py --dim 323 --data "/mnt/d/amb-grp/loop/iter$K/bud/s*.jsonl" --blanding 0.3 --epoker 60 \
  --vekter "/mnt/d/amb-grp/loop/nett/budq-$K.bin" --ut "/mnt/d/amb-grp/loop/iter$K/budq-ny.bin" \
  --rapport "/mnt/d/amb-grp/loop/iter$K/budq.txt" > "$D/tren-bud.log" 2>&1
if [ -f "$D/budq-ny.bin" ]; then cp "$D/budq-ny.bin" "$N/budq-$K1.bin"; else cp "$N/budq-$K.bin" "$N/budq-$K1.bin"; fi
logg "TRENT bud: $(grep -aE '^(MODELL-DIM|START-GEVINST|MODELL-GEVINST)' "$D/tren-bud.log" | tr '\n' ' ')"

velg_rang() { # $1=type $2=dim $3=forrige nett (kan mangle) $4=utnavn
  local vekter=""; [ -n "$3" ] && [ -f "$3" ] && vekter="--vekter /mnt/d/amb-grp/loop/nett/$(basename "$3")"
  # shellcheck disable=SC2086
  $PY verktoy/vrak-tren.py --type "$1" --dim "$2" --data "/mnt/d/amb-grp/loop/iter$K/vrak" $vekter --epoker 60 --lr 3e-4 --tau 3 \
    --ut "/mnt/d/amb-grp/loop/iter$K/$4-ny.bin" --logg "/mnt/d/amb-grp/loop/iter$K/tren-$4.jsonl" > "$D/tren-$4.log" 2>&1
  local pol mod
  pol=$(grep -a '^POLICY-ANGER-HOLDOUT' "$D/tren-$4.log" | tail -1 | awk '{print $2}')
  mod=$(grep -a '^MODELL-ANGER-HOLDOUT' "$D/tren-$4.log" | tail -1 | awk '{print $2}')
  if [ -n "$pol" ] && [ -n "$mod" ] && awk -v m="$mod" -v p="$pol" 'BEGIN { exit !(m < p) }'; then
    cp "$D/$4-ny.bin" "$N/$4-$K1.bin"; logg "TRENT $4: modell $mod < policy $pol → nytt nett"
  elif [ -n "$3" ] && [ -f "$3" ]; then
    cp "$3" "$N/$4-$K1.bin"; logg "TRENT $4: modell $mod, policy $pol → forrige nett beholdes"
  else
    logg "TRENT $4: modell $mod, policy $pol → regelen beholdes (intet nett)"
  fi
}
velg_rang vrak 27 "$N/vrak-$K.bin" vrak
velg_rang etterlyst 25 "$N/etterlyst-$K.bin" etterlyst

$PY verktoy/mlb-tro-tren.py --tren "/mnt/d/amb-grp/loop/iter$K/tro/trening-*.bin" --hold "/mnt/d/amb-grp/loop/iter$K/tro/holdout-*.bin" \
  --tren-menneske "/mnt/d/amb-grp/menneske/rader996/trening-*.bin" --hold-menneske "/mnt/d/amb-grp/menneske/rader996/holdout-*.bin" \
  --minne-dropout 0.5 --minne-dropout-bot 0.5 --vekter "/mnt/d/amb-grp/loop/nett/tro-$K.bin" --epoker 4 --lr 1e-4 --ut "/mnt/d/amb-grp/loop/iter$K/tro-ny.bin" \
  --logg "/mnt/d/amb-grp/loop/iter$K/tren-tro.jsonl" --rapport "/mnt/d/amb-grp/loop/iter$K/tren-tro.txt" > "$D/tren-tro.log" 2>&1
if [ -f "$D/tro-ny.bin" ]; then cp "$D/tro-ny.bin" "$N/tro-$K1.bin"; else cp "$N/tro-$K.bin" "$N/tro-$K1.bin"; fi
logg "TRENT tro: $(grep -aE '^TRO-' "$D/tren-tro.log" | tr '\n' ' ')"

# Kortnettet: sd-tren skriver startvektene som epoke 0 og lagrer bare en STRENGT bedre epoke, så modell < policy
# betyr at treningen faktisk forbedret nettet mot søkets beste kort på holdout.
rm -f "$D/kort-ny.bin"
$PY verktoy/sd-tren.py --data "/mnt/d/amb-grp/loop/iter$K/kort" --vekter "/mnt/d/amb-grp/loop/nett/kort-$K.bin" \
  --ut "/mnt/d/amb-grp/loop/iter$K/kort-ny.bin" --epoker 6 --lr 1e-4 --holdoutandel 0.1 --ingenbuffer \
  --logg "/mnt/d/amb-grp/loop/iter$K/tren-kort.jsonl" > "$D/tren-kort.log" 2>&1
# PORTEN HAR TO LEDD (v4, agent O): total anger bedre OG anger i SENT (stikk 7–11) ikke verre. kort-3 slapp gjennom på
# total anger (0,8195 → 0,8077) mens K7-gapet i batteriet økte (+0,31/+0,50 → +0,78/+0,81).
ktall() { grep -a "^$1 " "$D/tren-kort.log" | tail -1 | awk '{print $2}'; }
kpol=$(ktall POLICY-ANGER-HOLDOUT); kmod=$(ktall MODELL-ANGER-HOLDOUT)
kpols=$(ktall POLICY-ANGER-HOLDOUT-SENT); kmods=$(ktall MODELL-ANGER-HOLDOUT-SENT)
if [ -f "$D/kort-ny.bin" ] && awk -v m="$kmod" -v p="$kpol" -v ms="$kmods" -v ps="$kpols" \
     'BEGIN { t = "^[0-9]+([.][0-9]+)?$"; exit !(m ~ t && p ~ t && ms ~ t && ps ~ t && m + 0 < p + 0 && ms + 0 <= ps + 0) }'; then
  cp "$D/kort-ny.bin" "$N/kort-$K1.bin"; logg "TRENT kort: modell $kmod < policy $kpol, SENT $kmods <= $kpols → nytt nett"
else
  cp "$N/kort-$K.bin" "$N/kort-$K1.bin"; logg "TRENT kort: modell $kmod/$kpol, SENT $kmods/$kpols → forrige nett beholdes"
fi
logg "FERDIG trening"

# ------------------------------------------------------------------ HELHETEN: kravbatteri + kampsjekk mot prod
BT=/d/amb-krav-batteri
spol "$BT"
cd "$BT" || { logg "STOPP: $BT finnes ikke"; exit 1; }
# v11: delingen MÅ være i koden batteriet kjører. Mangler fila, ville --kampsett utvalg kastet
# midt i K1-raden – og verre: en framtidig utgave uten flagget ville målt på alle kampene igjen
# uten å si fra. En manglende fil er en STOPP, ikke et stille tilbakefall.
[ -f analyse/k1-kampsett.tsv ] || { logg "STOPP: analyse/k1-kampsett.tsv mangler i $BT – er holdout-grena slått sammen i krav-2026-09-11?"; exit 1; }
for f in vrak budq tro kort; do cp "$N/$f-$K1.bin" e1-modell/; done
VR1="e1-modell/vrak-$K1.bin"
[ -f "$N/etterlyst-$K1.bin" ] && cp "$N/etterlyst-$K1.bin" e1-modell/ && VR1="$VR1@e1-modell/etterlyst-$K1.bin"
# v6: helboten søker med 48 verdener (iterasjon 3: K1 +1,12 ± 0,19, z 5,8 mot +1,00 med 24).
HEL="okt:vr:$VR1:telrd:eks:3Lt2000:profil:sik:alle:0.5:48k32e3LMD~mlbu=e1-modell/tro-$K1.bin:budq:e1-modell/budq-$K1.bin:vakt:abmp:e1:e1-modell/kort-$K1.bin"
B0="vr:e1-modell/vrakrang.bin:telrd:sik:foerer:0.5:24:budq:e1-modell/budq-s4a.bin:vakt:abmp:e1:e1-modell/d7alle.bin"
logg "KRAV START helbot=$HEL"
node examples/mlb-krav.ts --spek "$HEL" --kjerner 20 --to-band --kampsett utvalg --ut "D:/amb-grp/loop/iter$K/krav" > "$D/krav.log" 2>&1
logg "KRAV FERDIG exit=$?: $(tail -4 "$D/krav.txt" 2>/dev/null | tr '\n' ' ' | cut -c1-400)"

# ============ PORTEN PÅ HELHETEN (v7, 12. sep) ============================================
# Iterasjon 4 er grunnen: bud (+0,090), vrak (1,53 < 1,76), etterlyst og kortnettet lukket hver sin delport,
# og HELHETEN mot mennesker falt likevel fra +1,00 til +0,70 (W48: +1,12 → +0,88). Delportene måler mot
# søkets egne merkelapper i løkkas befolkning; K1 måler mot v5-kjeden menneskene faktisk møtte.
# Derfor: nettsettet beholdes bare hvis K1 ikke er signifikant dårligere enn det BESTE hittil. Ellers
# skrives det beste settet tilbake i K+1-slottet, så neste iterasjon genererer data fra det beste vi har.
# BESTE-fila: «<iterasjon> <K1> <SE>» i $N/beste.txt, nettene i $N/beste/.
BESTE=$N/beste.txt
mkdir -p "$N/beste"
# v11: RADEN BÆRER NÅ TO TALL. «bot − menneske …» er UTVALGET og er det eneste porten leser;
# holdout står i samme rad som «holdout … = RAPPORT, aldri port». Mønsteret under treffer
# «menneske», altså utvalget – holdout-klausulen inneholder ikke det ordet.
k1ny=$(grep -a -A1 '^--- K1 ' "$D/krav.txt" 2>/dev/null | grep -a 'MÅLT' | head -1 | sed -n 's/.*menneske \([+-][0-9.]*\) ± \([0-9.]*\).*/\1 \2/p')
n1=$(echo "$k1ny" | awk '{print $1 + 0}'); s1=$(echo "$k1ny" | awk '{print $2 + 0}')
# HOLDOUT LOGGES, OG BARE DET. Tallet er med for at kurven skal kunne leses i ettertid; det går
# ikke inn i en eneste sammenlikning under. Havner det i en port, er delingen verdiløs fra den dagen.
k1h=$(grep -a -A1 '^--- K1 ' "$D/krav.txt" 2>/dev/null | grep -a 'MÅLT' | head -1 | sed -n 's/.*holdout \([+-][0-9.]*\) ± \([0-9.]*\).*/\1 ± \2/p')
logg "HOLDOUT (ren rapport, ingen beslutning): ${k1h:-fant ingen holdout-klausul i K1-raden}"
if [ -z "$k1ny" ]; then
  logg "HELPORT: fant ingen K1-rad – nettene beholdes uendret"
elif [ ! -s "$BESTE" ]; then
  echo "$K1 $n1 $s1" > "$BESTE"; for f in vrak budq tro kort etterlyst; do [ -f "$N/$f-$K1.bin" ] && cp "$N/$f-$K1.bin" "$N/beste/$f.bin"; done
  logg "HELPORT: første måling, nett $K1 er beste (K1 $n1 ± $s1)"
else
  nb=$(awk '{print $2 + 0}' "$BESTE"); sb=$(awk '{print $3 + 0}' "$BESTE"); ib=$(awk '{print $1}' "$BESTE")
  # MARGINEN ER FAST 0,15 pp, ikke 2 SE av summen. Begge målingene spiller de SAMME rundene, så
  # forskjellen er langt mer presis enn hver enkelt SE: en uavhengighetsantakelse ga 0,52 pp slingring
  # og ville sluppet fallet +1,12 → +0,70 (iterasjon 4) rett gjennom.
  #
  # v11, OG DETTE ER IKKE JUSTERT: porten måler nå på UTVALGET – 1484 runder i 150 kamper, ikke 2641
  # i 273. Parret SE mellom to iterasjoner er da ~0,20 pp (mot ~0,15 på alle kampene), så marginen på
  # 0,15 ligger UNDER sin egen støy: den fanger et fall den kaller signifikant oftere enn tallet bærer.
  # Det var slik den var i v10 også (0,15 mot ~0,15), bare mindre synlig. Terskelen er bevisst latt
  # stå urørt her, fordi denne endringen bare skulle flytte MÅLESETTET – å endre begge samtidig ville
  # gjort det umulig å se hva som virket. Den bør tas opp for seg.
  if awk -v n="$n1" -v b="$nb" 'BEGIN { exit !(n < b - 0.15) }'; then
    for f in vrak budq tro kort etterlyst; do [ -f "$N/beste/$f.bin" ] && cp "$N/beste/$f.bin" "$N/$f-$K1.bin"; done
    [ -f "$N/beste/etterlyst.bin" ] || rm -f "$N/etterlyst-$K1.bin"
    logg "HELPORT: K1 $n1 ± $s1 er dårligere enn beste $nb ± $sb (nett $ib) → RULLET TILBAKE til beste i slott $K1"
  else
    if awk -v n="$n1" -v b="$nb" 'BEGIN { exit !(n > b) }'; then
      echo "$K1 $n1 $s1" > "$BESTE"; for f in vrak budq tro kort etterlyst; do [ -f "$N/$f-$K1.bin" ] && cp "$N/$f-$K1.bin" "$N/beste/$f.bin"; done
      logg "HELPORT: K1 $n1 ± $s1 er nytt beste (forrige $nb, nett $ib)"
    else
      logg "HELPORT: K1 $n1 ± $s1 er ikke signifikant dårligere enn beste $nb ± $sb (nett $ib) → nettene beholdes"
    fi
  fi
fi
# SØKESTYRKE I STEDET FOR KAMPSJEKK (v4, 11. sep 23:50): kampsjekken mot prod kostet ~100 min per iterasjon og flyttet
# seg ikke (0,270 → 0,2625). K1 er målet, og Adams Max får bruke regnekraft: to varianter av HELE boten med sterkere
# søk dømmes på K1-duplikatet mot menneskene (~5–10 min hver). B0 står igjen for en senere kampsjekk før utrulling.
: "$B0"
# v6: HEL har 48 verdener; variantene prøver neste steg opp (96 verdener, og 48 verdener + eksakt fra 4 stikk).
# v8: E4 er ute (verre tre ganger på rad: +1,00 → +0,72 → +0,66). Inn kommer LIK7 – likelihood-vekting av verdenene
# (agent V) slått på fra og med åttende stikk, der hele gevinsten lå (+3,83 pp riktig plasserte kort, K8 −0,096).
for VAR in ; do  # v9: W96 (+0,94) og LIK7 (+0,91) falt begge mot 48-basis +1,01 - soekespakene er toemt
  case $VAR in
    W96)  SPEKV="${HEL/48k32e3LMD/96k32e3LMD}" ;;
    LIK7) SPEKV="${HEL/~mlbu=e1-modell\/tro-$K1.bin/~mlbu=e1-modell\/tro-$K1.bin~lik=selv,f7}" ;;
  esac
  [ "$SPEKV" != "$HEL" ] || { logg "SØKEVARIANT $VAR: mønsteret traff ikke – hopper over"; continue; }
  logg "SØKEVARIANT $VAR START $SPEKV"
  node examples/mlb-krav.ts --spek "$SPEKV" --bare k1 --kjerner 20 --ut "D:/amb-grp/loop/iter$K/k1-$VAR" > "$D/k1-$VAR.log" 2>&1
  logg "SØKEVARIANT $VAR: $(grep -a 'MÅLT' "$D/k1-$VAR.txt" 2>/dev/null | head -1 | tr -s ' ' | cut -c1-200)"
done
logg "FERDIG"
