#!/usr/bin/env bash
set -euo pipefail

# Queue health summary (main + DLQ) via /ops/queues.
# Requires ADMIN JWT:
#   API_BASE=https://api.example.com
#   TOKEN=<JWT with ADMIN role>
#
# Usage: API_BASE=... TOKEN=... ./scripts/queue_report.sh

if [[ -z "${API_BASE:-}" || -z "${TOKEN:-}" ]]; then
  echo "Missing API_BASE or TOKEN env vars." >&2
  exit 1
fi

auth() { echo "Authorization: Bearer ${TOKEN}"; }

echo "→ GET /ops/queues"
curl -fsSL -H "$(auth)" "${API_BASE}/ops/queues" | jq .

echo "✓ Queue report completed."
