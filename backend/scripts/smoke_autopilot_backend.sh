#!/usr/bin/env bash
set -euo pipefail

# Smoke básico do Autopilot (backend reativo/proativo) com foco em compliance e skips.
# Requer:
#   API_BASE=https://api.example.com
#   TOKEN=<JWT ADMIN/AGENT>
#   WORKSPACE_ID=<uuid>
#
# Opcional: STATUS_FILTER=skipped|error|executed
#
# Uso:
#   API_BASE=... TOKEN=... WORKSPACE_ID=... ./backend/scripts/smoke_autopilot_backend.sh

if [[ -z "${API_BASE:-}" || -z "${TOKEN:-}" || -z "${WORKSPACE_ID:-}" ]]; then
  echo "Missing API_BASE, TOKEN or WORKSPACE_ID env vars." >&2
  exit 1
fi

auth() { echo "Authorization: Bearer ${TOKEN}"; }

echo "→ /autopilot/status"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/status?workspaceId=${WORKSPACE_ID}" | jq .

echo "→ /autopilot/config"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/config?workspaceId=${WORKSPACE_ID}" | jq .

echo "→ /autopilot/stats (verificar skips compliance)"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/stats?workspaceId=${WORKSPACE_ID}" | jq . | sed -n '1,30p'

STATUS_FILTER_QUERY=""
if [[ -n "${STATUS_FILTER:-}" ]]; then
  STATUS_FILTER_QUERY="&status=${STATUS_FILTER}"
fi

echo "→ /autopilot/actions (últimas ações, inclui skips opt-in/24h)"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/actions?workspaceId=${WORKSPACE_ID}${STATUS_FILTER_QUERY}" | jq .

echo "→ /autopilot/money-report"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/money-report?workspaceId=${WORKSPACE_ID}" | jq .

echo "→ /autopilot/process (trigger ciclo local)"
curl -fsSL -X POST -H "$(auth)" -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"${WORKSPACE_ID}\",\"forceLocal\":true}" \
  "${API_BASE}/autopilot/process" | jq .

echo "✓ Smoke backend autopilot completo."
