#!/usr/bin/env bash
# SONDE C-DATA (agent T, 12. sep) — RADER MED DET EKSAKTE RETTFERDIGE TAKET.
#
# Sonde C spør om budvinnerens gap bor der identiteten er ukjent. Til det trengs BEGGE tallene
# på samme rad: trohodets tap, og tapet til den eksakte Bayes-posterioren gitt det setet ser og
# policyene bordet spiller. `mlb-trodata.ts --myk` regner nettopp den posterioren
# (`examples/myk-etikett.ts`) og skriver den som versjon 2-etikett.
#
# DYRT, OG DERFOR LITE: målt 12. sep koster én myk etikett ~0,8 s, og dekningen er bare de sene
# stikkene (rommet er millioner av ganger større tidlig i runden). Utvalget her er derfor et
# SENT-I-RUNDEN-utvalg, ikke et snitt over runden, og tallene skal leses som det.
#
# BÅNDET: holdout, men fra kamp 200 og opp — sonde A/B bruker kamp 0–90 i samme bånd, og
# identitetsmodellen i sonde C trenes på TRENINGSbåndet. Ingen rad her har vært sett før.
#
# `--myk` bytter bordets agenter til `kanoniskAgent` (hånd og vrak sortert, frø 0), ellers er
# den sanne given uforenlig med bordet i noen kamper. Samme bord og samme speker, men ikke
# samme likhetsbrudd som radene i sonde A — verdt å vite når tallene sammenliknes.
#
# HØYST TO node-prosesser: treningsløkka eier maskinen.
set -u
cd /d/amb-agT || exit 1
UT=_agT/myk
mkdir -p "$UT"

N=6
D7="e1:e1-modell/d7alle.bin"
POL="okt:vr:e1-modell/vrak-$N.bin@e1-modell/etterlyst-$N.bin:telrd:profil:budq:e1-modell/budq-$N.bin:vakt:abmp:e1:e1-modell/kort-$N.bin"
P_ADAMS="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:$D7"
P_MENN="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json:vakt:abmp:$D7"
P_GBT="etl:2:vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-gbt.json@-3.0:vakt:abmp:$D7"
P_SPAR="vr:e1-modell/vrakrang.bin:tl:budq:e1-modell/budq-s4a.bin:vakt:abmpd:$D7"
P_HOY="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@2.5:vakt:hbmpS:$D7"
BORD=("@|$P_ADAMS|@|$P_MENN" "@|$P_GBT|@|$P_SPAR" "@|$P_HOY|@|$P_MENN")

FRA=${FRA:-200}
TIL=${TIL:-260}
MAKSRUNDER=${MAKSRUNDER:-6}

kjor() {
  local i=$1
  node examples/mlb-trodata.ts --kamp --hukommelse --signal --sanser2 --myk --bordmerke \
    --spek "$POL" --drivere "${BORD[$((i % 3))]}" --rotasjon \
    --band holdout --fra "$FRA" --kamper "$TIL" --skard "$i/3" --maksrunder "$MAKSRUNDER" \
    --ut "$UT/myk-$i.bin" > "$UT/log-$i.txt" 2>&1
  echo "$(date +%FT%T) ferdig myk-$i: $(grep -o 'myk: .*' "$UT/log-$i.txt" | tail -1)" >> "$UT/status.txt"
}

# PAR=1 når en sonde skal regne samtidig: to node-prosesser HER pluss én torch-prosess ville
# vært tre, og budsjettet er to. PAR=2 når myk-kjøringen er alene om plassen.
PAR=${PAR:-2}
echo "$(date +%FT%T) START myk fra=$FRA til=$TIL maksrunder=$MAKSRUNDER par=$PAR" >> "$UT/status.txt"
if [ "$PAR" = "1" ]; then
  kjor 0; kjor 1; kjor 2
else
  kjor 0 & kjor 1 & wait
  kjor 2 & wait
fi
echo "$(date +%FT%T) FERDIG myk" >> "$UT/status.txt"
