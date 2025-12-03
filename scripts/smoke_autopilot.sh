#!/usr/bin/env bash
set -euo pipefail

# Basic smoke for Autopilot/Money Machine endpoints.
# Requires:
#   API_BASE=https://api.example.com
#   TOKEN=<JWT>
#   WORKSPACE_ID=<workspace uuid>
#
# Usage: API_BASE=... TOKEN=... WORKSPACE_ID=... ./scripts/smoke_autopilot.sh

if [[ -z "${API_BASE:-}" || -z "${TOKEN:-}" || -z "${WORKSPACE_ID:-}" ]]; then
  echo "Missing API_BASE, TOKEN or WORKSPACE_ID env vars." >&2
  exit 1
fi

auth() { echo "Authorization: Bearer ${TOKEN}"; }

echo "→ GET /autopilot/status"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/status?workspaceId=${WORKSPACE_ID}" | jq .

echo "→ GET /autopilot/config"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/config?workspaceId=${WORKSPACE_ID}" | jq .

echo "→ POST /autopilot/config (dry example, no state change)"
curl -fsSL -X POST -H "$(auth)" -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"${WORKSPACE_ID}\",\"conversionFlowId\":null}" \
  "${API_BASE}/autopilot/config" | jq .

echo "→ GET /autopilot/queue"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/queue" | jq .

echo "→ GET /autopilot/money-report"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/money-report?workspaceId=${WORKSPACE_ID}" | jq .

echo "→ GET /autopilot/revenue-events"
curl -fsSL -H "$(auth)" "${API_BASE}/autopilot/revenue-events?workspaceId=${WORKSPACE_ID}&limit=5" | jq .

echo "→ POST /autopilot/process (local cycle trigger)"
curl -fsSL -X POST -H "$(auth)" -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"${WORKSPACE_ID}\",\"forceLocal\":true}" \
  "${API_BASE}/autopilot/process" | jq .

echo "✓ Smoke completed."
