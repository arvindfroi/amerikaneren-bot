#!/usr/bin/env bash
#
# GENERATOREN SOM MATER TRENEREN DIREKTE — ett skard, MLBT på stdout.
#
#   verktoy/mlb-tro-strom.sh <skard> <antall-skard>
#
# Brukt av treneren slik:
#
#   ~/Arvind-Lora/.venv/bin/python verktoy/mlb-tro-tren.py \
#       --strom "bash verktoy/mlb-tro-strom.sh {skard} {skard_n}" --strom-skard 6 \
#       --hold <holdout.bin> --ut e1-modell/tro-ny.bin
#
# ===================== HVORFOR DETTE ER ET SKRIPT =====================
#
# Treneren kjører i WSL (CUDA), generatoren er Node på Windows — `node` finnes ikke i WSL.
# Kommandoen krysser altså WSL-grensa, og gjort inline blir sitatnivåene (bash -lc → python
# argument → sh -c → node) et sted feil oppdages først når strømmen er tom. Her står den én
# gang, og `NODE`/`SPEK`/`KAMPER`/`FRA` kan settes i miljøet.
#
# STDOUT TILHØRER RADENE. `--ut -` sender all framdrift til stderr; se `examples/mlb-trodata.ts`.
set -euo pipefail

SKARD="${1:-0}"
ANTALL="${2:-1}"
NODE="${NODE:-/mnt/c/Program Files/nodejs/node.exe}"
KAMPER="${KAMPER:-16000000}"
FRA="${FRA:-0}"
BAND="${BAND:-trening}"
SJANSE="${SJANSE:-0.5}"

args=(--kamp --hukommelse --signal --sanser2
      --kamper "$KAMPER" --fra "$FRA" --skard "$SKARD/$ANTALL"
      --band "$BAND" --sjanse "$SJANSE" --ut -)
# Uten --spek bruker driveren ADAMS_MAALT, som før.
if [ -n "${SPEK:-}" ]; then args+=(--spek "$SPEK"); fi
if [ -n "${DRIVERE:-}" ]; then args+=(--drivere "$DRIVERE" --rotasjon); fi

exec "$NODE" examples/mlb-trodata.ts "${args[@]}"
