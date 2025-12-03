#!/usr/bin/env bash
set -euo pipefail

# Runs all smoke scripts in sequence (core, autopilot, queue).
# Requires:
#   API_BASE=https://api.example.com
#   TOKEN=<JWT> (admin for /ops/queues)
#   WORKSPACE_ID=<uuid>
#
# Usage: API_BASE=... TOKEN=... WORKSPACE_ID=... ./scripts/smoke_all.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${API_BASE:-}" || -z "${TOKEN:-}" || -z "${WORKSPACE_ID:-}" ]]; then
  echo "Missing API_BASE, TOKEN or WORKSPACE_ID env vars." >&2
  exit 1
fi

echo "== Core smoke =="
"${ROOT}/scripts/smoke_core.sh"

echo "== Autopilot smoke =="
"${ROOT}/scripts/smoke_autopilot.sh"

echo "== Queue report =="
"${ROOT}/scripts/queue_report.sh"

echo "✓ All smokes completed."
