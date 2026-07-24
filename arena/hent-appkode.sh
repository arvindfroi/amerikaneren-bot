#!/usr/bin/env bash
#
# Kopierer motor- og AI-kildene fra Amerikaneren-App-repoet inn i adapteren,
# slik at arenaen alltid kompilerer mot nøyaktig den appkoden som testes.
# Filene sjekkes ikke inn her (se .gitignore) – kjør skriptet på nytt etter
# endringer i app-repoet.
#
#   ./arena/hent-appkode.sh /sti/til/Amerikaneren-App

set -euo pipefail

APP="${1:?Bruk: hent-appkode.sh <sti-til-Amerikaneren-App-repoet>}"
DEST="$(cd "$(dirname "$0")" && pwd)/adapter/Sources/adapter/appkode"

FILER=(
  Engine/GameEngine.swift
  Engine/Bid.swift
  Engine/Card.swift
  AI/MesterAI.swift
  AI/MesterSolver.swift
  AI/MesterVerden.swift
  AI/AIPlayer.swift
  AI/AIPersonality.swift
  AI/NevroNett.swift
  AI/NevroVekter.swift
)

mkdir -p "$DEST"
for fil in "${FILER[@]}"; do
  kilde="$APP/Amerikaneren/$fil"
  [ -f "$kilde" ] || { echo "Fant ikke $kilde" >&2; exit 1; }
  cp "$kilde" "$DEST/"
done

echo "Kopierte ${#FILER[@]} filer til $DEST"
