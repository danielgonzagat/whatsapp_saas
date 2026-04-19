#!/bin/zsh
# shellcheck shell=bash
set -euo pipefail

STATUS_DIR="${KLOEL_SYNC_STATUS_DIR:-$HOME/Library/Application Support/Kloel}"
STATUS_FILE="${KLOEL_SYNC_STATUS_FILE:-$STATUS_DIR/auto-sync-status.txt}"

if [[ ! -f "$STATUS_FILE" ]]; then
  echo "Nenhum status encontrado em $STATUS_FILE"
  exit 0
fi

cat "$STATUS_FILE"
