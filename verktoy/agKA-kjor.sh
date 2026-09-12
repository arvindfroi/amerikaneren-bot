#!/usr/bin/env bash
# HELE RESTEN AV MAALINGEN, i rekkefoelge og med ETT tungt steg om gangen.
# Hvert steg skriver sitt eget spor til fil (aldri gjennom et stdout-roer), saa en
# avbrutt oekt ikke koster maalingen.
set -u
cd /d/amb-agKA || exit 1
S=kk/kjor-status.txt
logg() { echo "$(date +%FT%T) $*" >> "$S"; }
: > "$S"

# ---------------------------------------------------------------- 1. vent paa korpuset
logg "VENTER paa korpusparet"
until grep -q "ALT FERDIG" kk/gen-status.txt 2>/dev/null; do sleep 20; done
logg "KORPUS ferdig: $(ls kk/abs-tren-*.bin kk/abs-hold-*.bin | wc -l) filer per arm"

# ---------------------------------------------------------------- 2. sha1: standardveien er uroert
# Kravet: uten --kanonisk skal hver rad vaere byte-identisk med foer endringene mine.
# kk/abs-hold-0.bin ble laget FOER redigeringen av examples/mlb-trodata.ts; samme kall
# paa dagens kode maa gi samme sha1.
POL="okt:vr:e1-modell/vrak-7.bin@e1-modell/etterlyst-7.bin:telrd:profil:budq:e1-modell/budq-7.bin:vakt:abmp:e1:e1-modell/kort-7.bin"
D7="e1:e1-modell/d7alle.bin"
B0="@|vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-vant.json@-3.0:vakt:abmpf:$D7|@|vr:e1-modell/vrakrang.bin:telrd:budm:e1-modell/bud-menneske.json:vakt:abmp:$D7"
node examples/mlb-trodata.ts --kamp --hukommelse --signal --sanser2 --spek "$POL" --drivere "$B0" --rotasjon \
  --band holdout --fra 600 --kamper 650 --sjanse 0.5 --skard 0/1 \
  --ut D:/amb-agKA/kk/sha-kontroll.bin > kk/log-sha.txt 2>&1
A=$(sha1sum kk/abs-hold-0.bin | cut -d' ' -f1)
B=$(sha1sum kk/sha-kontroll.bin | cut -d' ' -f1)
if [ "$A" = "$B" ]; then logg "SHA1 OK: standardveien uendret ($A)"; else logg "SHA1 AVVIK: $A != $B — standardveien er IKKE byte-identisk"; fi
rm -f kk/sha-kontroll.bin

# ---------------------------------------------------------------- 3. GPU-porten
# Regelen: ikke roer GPU-en mens loekka staar mellom «DATA kort» og «FERDIG trening».
ST=/d/amb-grp/loop/status.txt
port_apen() {
  local siste
  siste=$(grep -aE "DATA kort|FERDIG trening" "$ST" | tail -1)
  case "$siste" in *"FERDIG trening"*) return 0 ;; *) return 1 ;; esac
}
until port_apen; do logg "GPU opptatt av loekka — venter"; sleep 120; done
logg "GPU-porten aapen"

# ---------------------------------------------------------------- 4. de fire armene + parvis K8
bash verktoy/agKA-tren.sh
logg "TRENING: $(tail -2 kk/tren-status.txt | tr '\n' ' ')"

# ---------------------------------------------------------------- 5. symmetrien
# KONTROLL: samme froe og kamper som agent X, absolutte farger — reproduserer 0,0978/31,7 %.
node examples/agX-fargesymmetri.ts --kamper 24 --froe 770000000 \
  --tro e1-modell/tro-7.bin --kort e1-modell/kort-7.bin \
  --ut analyse/agKA-sym-abs.jsonl > kk/log-sym-abs.txt 2>&1
logg "SYM absolutt ferdig"
# RESTLEDDET: det KANONISKE nettet, lest paa kanoniserte stillinger. Skal vaere ~0.
node examples/agX-fargesymmetri.ts --kamper 24 --froe 770000000 --kanonisk \
  --tro analyse/agKA-tro-B0.bin --kort e1-modell/kort-7.bin \
  --ut analyse/agKA-sym-kan.jsonl > kk/log-sym-kan.txt 2>&1
logg "SYM kanonisk ferdig"
logg "ALT FERDIG"
