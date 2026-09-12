#!/usr/bin/env bash
# SONDEDATA (agent T, 12. sep) — MERKEDE KAMPER FRA LØKKAS EGEN BEFOLKNING.
#
# Måleoppdraget: er flaskehalsen for K8/K6 en MANGLENDE SANS, eller at boten ikke klarer å
# bruke sansene den alt har? For å svare må vi vite hvem som faktisk satt i hvert sete, og
# derfor spilles NØYAKTIG de tre bordene løkka spiller (`adams-max-loop-v7.sh`), med samme
# rotasjon og samme kandidatspek — men på egne frø, og med `--bordmerke`/`--sekvens`.
#
# HVORFOR LØKKAS BORD OG IKKE ET PENERE ET: et bord som «@|A|B|C» ville gitt tre ulike
# motstandere per rad og et mye lettere identitetsproblem. Men trohodet er ikke trent på det
# bordet. Spørsmålet er hva som er lesbart i DE DATAENE NETTET FAKTISK SER, så bordene er
# løkkas. Følgen er at relativt sete 2 alltid er kandidaten (makkeren) — den er degenerert som
# etikett, og sonden rapporterer rel 1 og rel 3, der motstanderne sitter.
#
# BÅNDENE er `mlb-trodata.ts` sine egne kampbånd: trening 1,950 G og holdout 1,985 G. De er
# disjunkte PER KAMP ved konstruksjon, ikke per rad — to rader fra samme kamp deler bok og
# kortfordeling, og en radvis deling ville lekket.
#
# MASKINBUDSJETT: treningsløkka og en annen agent eier maskinen. HØYST TO node-prosesser om
# gangen, derfor de faste parene under — ikke `wait -n`, som ville latt en tredje starte.
#
# Hver prosess skriver sin egen logg (langkjøringer skal ikke leve i et stdout-rør).
set -u
cd /d/amb-agT || exit 1
UT=_agT/data
mkdir -p "$UT"

# Nettene er de nyeste fra løkka (indeks 6), kopiert inn i e1-modell/.
N=6
D7="e1:e1-modell/d7alle.bin"
POL="okt:vr:e1-modell/vrak-$N.bin@e1-modell/etterlyst-$N.bin:telrd:profil:budq:e1-modell/budq-$N.bin:vakt:abmp:e1:e1-modell/kort-$N.bin"
P_ADAMS="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:$D7"
P_MENN="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json:vakt:abmp:$D7"
P_GBT="etl:2:vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-gbt.json@-3.0:vakt:abmp:$D7"
P_SPAR="vr:e1-modell/vrakrang.bin:tl:budq:e1-modell/budq-s4a.bin:vakt:abmpd:$D7"
P_HOY="vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@2.5:vakt:hbmpS:$D7"
BORD=("@|$P_ADAMS|@|$P_MENN" "@|$P_GBT|@|$P_SPAR" "@|$P_HOY|@|$P_MENN")

# NAVNETABELLEN: sonden kjenner bare spekstrenger, og en rapport med rå speker er uleselig.
# Skrevet her, av de samme variablene som bygger bordene, så navn og spek ikke kan gli fra hverandre.
{
  printf 'KAND\t%s\n' "$POL"
  printf 'ADAMS\t%s\n' "$P_ADAMS"
  printf 'MENN\t%s\n' "$P_MENN"
  printf 'GBT\t%s\n' "$P_GBT"
  printf 'SPAR\t%s\n' "$P_SPAR"
  printf 'HOY\t%s\n' "$P_HOY"
} > _agT/typer.tsv

TRENKAMPER=${TRENKAMPER:-300}
HOLDKAMPER=${HOLDKAMPER:-90}

kjor() { # $1 = bånd, $2 = skard, $3 = antall kamper
  local band=$1 i=$2 kamper=$3
  node examples/mlb-trodata.ts --kamp --hukommelse --signal --sanser2 \
    --sekvens --bordmerke \
    --spek "$POL" --drivere "${BORD[$((i % 3))]}" --rotasjon \
    --band "$band" --kamper "$kamper" --skard "$i/3" \
    --ut "$UT/$band-$i.bin" > "$UT/log-$band-$i.txt" 2>&1
  echo "$(date +%FT%T) ferdig $band-$i: $(tail -2 "$UT/log-$band-$i.txt" | head -1)" >> "$UT/status.txt"
}

echo "$(date +%FT%T) START trening=$TRENKAMPER holdout=$HOLDKAMPER" >> "$UT/status.txt"
# Høyst to av gangen.
kjor trening 0 "$TRENKAMPER" & kjor trening 1 "$TRENKAMPER" & wait
kjor trening 2 "$TRENKAMPER" & kjor holdout 0 "$HOLDKAMPER" & wait
kjor holdout 1 "$HOLDKAMPER" & kjor holdout 2 "$HOLDKAMPER" & wait
echo "$(date +%FT%T) FERDIG alle skard" >> "$UT/status.txt"
