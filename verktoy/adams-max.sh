#!/usr/bin/env bash
# ADAMS MAX — KJØREREN. Ablasjon nedover fra full stakk, over begge portene.
#
# ARVIND: «du må bygge alle delene som moduler også må vi heller kjøre en
# omfattende test over samtlige deler individuelt og relasjonene mellom de.»
#
#   verktoy/adams-max.sh <merke> [giver] [kamper] [skard] [port]
#
#     port   gate2 | kamp | begge      (standard: gate2)
#
# Armene bygges av `examples/maxrigg.ts`, som også skriver armkartet. Se den
# fila for HVORFOR ablasjon nedover og ikke addisjon oppover.
#
# =================== GODKJENN DESIGNET FØR NOE STARTES ==================
#
#   node examples/maxrigg.ts --toerr --merke <merke>
#
# Den kjører ingenting. Den lister hver arm, hver spek, hver kommando og
# kostnaden — og den BYGGER hver armspek, så en skrivefeil tas nå og ikke av
# skard 7 etter fire timer. Dette skriptet kaller den først uansett og stopper
# om en spek ikke lar seg bygge.
#
# =================== VARIGE FILER, ALLTID ===============================
#
# Ingen resultater går gjennom et stdout-rør. `gate2.ts` og `kamp.ts` skriver
# selv til `--ut`; rapportene skrives av rapportverktøyene selv. Flertimers
# målinger har gått tapt på rør i dette prosjektet, og det er derfor en regel
# og ikke en vane.
#
# =================== OG HVERT FILNAVN HAR SKARDSUFFIKS ==================
#
# `-s0`, `-s1`, ... En tidligere kjøring lot alle skard skrive til samme fil.
# De sist skrevne radene overlevde, resten ble borte, og rapporten så komplett
# ut. Suffikset kommer fra `maxrigg.ts`, ett sted, ikke fra interpolasjon her.
set -u
cd "$(dirname "$0")/.."

MERKE="${1:-max}"
GIVER="${2:-1600}"
KAMPER="${3:-200}"
SKARD="${4:-16}"
PORT="${5:-gate2}"

# Ekstra flagg til `maxrigg.ts` — `--par X,Y`, `--med eks`, `--uten amu`,
# `--amu-rolle foerer`. Som miljøvariabel, så de fem posisjonsargumentene over
# holder seg lesbare:
#
#   MAX_EKSTRA="--par okt,profil --par amuv,vakt" verktoy/adams-max.sh m1
EKSTRA="${MAX_EKSTRA:-}"

KAT="analyse"
LOGG="${KAT}/max-${MERKE}-kjorelogg.txt"
mkdir -p "$KAT"
ekko() { echo "[$(date '+%m-%d %H:%M')] $*" | tee -a "$LOGG"; }

# ---------------------------------------------------------------------------
# 1. ARMKARTET. Bygger hver spek; feiler den, starter ingenting.
# ---------------------------------------------------------------------------
ekko "=== ADAMS MAX: ablasjon nedover fra full stakk, merke «${MERKE}» ==="
# shellcheck disable=SC2086  # EKSTRA skal ordsplittes; det er hele poenget.
if ! node examples/maxrigg.ts --toerr --merke "$MERKE" --katalog "$KAT" \
    --giver "$GIVER" --kamper "$KAMPER" --skard "$SKARD" $EKSTRA >> "$LOGG" 2>&1; then
  ekko "AVBRUTT: maxrigg.ts --toerr feilet. Se ${LOGG}. Ingen armer kjørt."
  exit 1
fi

ARMFIL="${KAT}/max-${MERKE}-armer.tsv"
FULLFIL="${KAT}/max-${MERKE}-full.txt"
PARAMFIL="${KAT}/max-${MERKE}-parametre.sh"
if [ ! -s "$ARMFIL" ] || [ ! -s "$FULLFIL" ] || [ ! -s "$PARAMFIL" ]; then
  ekko "AVBRUTT: fant ikke ${ARMFIL}, ${FULLFIL} eller ${PARAMFIL}."
  exit 1
fi
FULL="$(head -1 "$FULLFIL")"
# FRØENE KOMMER FRA ARMKARTET, ikke herfra. Sto de begge steder, kunne kartet
# navngi ett frøbånd mens kommandoen målte et annet — og ingenting ville feilet.
# shellcheck source=/dev/null
. "$PARAMFIL"
GIVER="$MAX_GIVER"
KAMPER="$MAX_KAMPER"
SKARD="$MAX_SKARD"
ANTALL=$(wc -l < "$ARMFIL")
ekko "${ANTALL} armer + KONTROLL. Miljø = FULL stakk."
ekko "FULL: ${FULL}"

# ---------------------------------------------------------------------------
# 2. PORT 1 — GATE 2. Alle armene i SAMME kjøring.
#
# Det er ikke en optimalisering, det er selve parringen: gate 2 spiller hver
# arm på NØYAKTIG samme (giv, sete) og skriver dem i samme rad. Splittes armene
# på ulike kjøringer, er de ikke lenger parret, og differansen mot kontrollen
# mister det meste av presisjonen sin.
#
# UMÅLBART HER: `okt`, `profil` og `amu «r»`. Friske agenter per giv, én runde.
# Rapporten sier det høyt — les den, ikke tabellen alene.
# ---------------------------------------------------------------------------
kjor_gate2() {
  ekko "--- PORT 1: gate 2, ${GIVER} giv over ${SKARD} skard ---"
  rm -f "${KAT}/max-${MERKE}-g-s"*.jsonl

  # Kandidatflaggene bygges ÉN gang, fra armfila, så skallet og armkartet ikke
  # kan komme i utakt.
  KAND=()
  while IFS=$'\t' read -r kode spek; do
    [ -z "${spek:-}" ] && continue
    KAND+=(--kandidat "$spek")
  done < "$ARMFIL"

  P=""
  for S in $(seq 0 $((SKARD - 1))); do
    nohup node examples/gate2.ts \
      "${KAND[@]}" \
      --miljo "$FULL" \
      --froe "$MAX_FROE_GATE2" --giver "$GIVER" --skard "${S}/${SKARD}" \
      --ut "${KAT}/max-${MERKE}-g-s${S}.jsonl" \
      > "${KAT}/max-${MERKE}-g-logg-s${S}.txt" 2>&1 &
    P="$P $!"
  done
  for X in $P; do wait "$X" 2>/dev/null || true; done
  ekko "gate 2 ferdig: $(cat "${KAT}/max-${MERKE}-g-s"*.jsonl 2>/dev/null | wc -l) rader"

  # gate2 skriver rapporten sin til fil selv (.txt ved siden av .jsonl).
  node examples/gate2.ts --rapport "${KAT}/max-${MERKE}-g-s*.jsonl" \
    > "${KAT}/max-${MERKE}-g-rapportlogg.txt" 2>&1
  ekko "gate2-rapport -> ${KAT}/max-${MERKE}-g-s.txt"
}

# ---------------------------------------------------------------------------
# 3. PORT 2 — KAMPBENKEN. ÉN kjøring per arm, i bølger.
#
# `kamp.ts` tar én kandidat. Armene kjøres derfor etter tur, hver over alle
# skard. Bølgene er med vilje: 13 armer x 16 skard samtidig er 208 prosesser
# på 24 kjerner, og kontensjonen (målt 67x på mettet CPU) ville spist hele
# gevinsten av parallelliteten.
#
# `--uparret`: kontrollkampen er ren overhead her. Grunnlinja er 0,2500 ved
# symmetri, og med søk i alle fire seter er kontrollkampen den dyreste av alle.
# ---------------------------------------------------------------------------
kjor_kamp() {
  ekko "--- PORT 2: kampbenken, ${KAMPER} kamper per arm over ${SKARD} skard ---"
  rm -f "${KAT}/max-${MERKE}-k-"*.jsonl
  while IFS=$'\t' read -r kode spek; do
    [ -z "${spek:-}" ] && continue
    ekko "  arm ${kode}"
    P=""
    for S in $(seq 0 $((SKARD - 1))); do
      nohup node examples/kamp.ts --uparret \
        --kandidat "$spek" --miljo "$FULL" \
        --kamper "$KAMPER" --froe "$MAX_FROE_KAMP" --skard "${S}/${SKARD}" \
        --ut "${KAT}/max-${MERKE}-k-${kode}-s${S}.jsonl" \
        > "${KAT}/max-${MERKE}-k-${kode}-logg-s${S}.txt" 2>&1 &
      P="$P $!"
    done
    for X in $P; do wait "$X" 2>/dev/null || true; done
    ekko "  arm ${kode} ferdig: $(cat "${KAT}/max-${MERKE}-k-${kode}-s"*.jsonl 2>/dev/null | wc -l) rader"
  done < "$ARMFIL"
  # KONTROLLARMEN ER MED I ARMFILA (kode «kontroll», FULL mot seg selv), så den
  # kjøres av løkka over. Her sto en EKSTRA kontrollkjøring som skrev til
  # `...-k-KONTROLL-s*.jsonl`. På Windows er filnavn ikke versalfølsomme, så den
  # la seg oppå armens egne rader og doblet dem — kontrollarmen ble målt på
  # dobbelt datagrunnlag, uten at noe feilet. Rettet ved å ikke gjøre jobben to
  # ganger.
}

case "$PORT" in
  gate2) kjor_gate2 ;;
  kamp) kjor_kamp ;;
  begge) kjor_gate2; kjor_kamp ;;
  *) ekko "Ukjent port «${PORT}» (gate2, kamp, begge)"; exit 1 ;;
esac

# ---------------------------------------------------------------------------
# 4. RAPPORTEN. Skrives til fil av leseren selv.
# ---------------------------------------------------------------------------
PY=/c/Python314/python.exe
[ -x "$PY" ] || PY=python
"$PY" verktoy/adams-max-les.py \
  --armkart "${KAT}/max-${MERKE}-armkart.json" \
  --gate2 "${KAT}/max-${MERKE}-g-s.txt" \
  --kamp "${KAT}/max-${MERKE}-k-" \
  --ut "${KAT}/max-${MERKE}-rapport.txt" \
  >> "$LOGG" 2>&1 \
  || ekko "adams-max-les.py feilet — rådata ligger i ${KAT}/max-${MERKE}-*.jsonl"

ekko "=== FERDIG ==="
ekko "RAPPORT: ${KAT}/max-${MERKE}-rapport.txt"
ekko "LES SLIK: kontrollarmen på gate 2 MÅ være 0,0000 og kampbenkens 0,2500."
ekko "Er de ikke det, er benken i stykker og ingen andre tall kan leses. Og"
ekko "en modul som er UMÅLBAR på porten bidrar ikke 0 — den kan ikke sees."
