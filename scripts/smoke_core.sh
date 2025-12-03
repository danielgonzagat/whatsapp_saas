#!/usr/bin/env bash
set -euo pipefail

# Core API smoke: health, flows, campaigns, inbox.
# Requires:
#   API_BASE=https://api.example.com
#   TOKEN=<JWT>
#   WORKSPACE_ID=<uuid>
#
# Usage: API_BASE=... TOKEN=... WORKSPACE_ID=... ./scripts/smoke_core.sh

if [[ -z "${API_BASE:-}" || -z "${TOKEN:-}" || -z "${WORKSPACE_ID:-}" ]]; then
  echo "Missing API_BASE, TOKEN or WORKSPACE_ID env vars." >&2
  exit 1
fi

auth() { echo "Authorization: Bearer ${TOKEN}"; }

echo "→ GET /health"
curl -fsSL -H "$(auth)" "${API_BASE}/health" | jq .

echo "→ GET /flows/${WORKSPACE_ID}/executions?limit=5"
curl -fsSL -H "$(auth)" "${API_BASE}/flows/${WORKSPACE_ID}/executions?limit=5" | jq .

echo "→ GET /campaigns?workspaceId=${WORKSPACE_ID}"
curl -fsSL -H "$(auth)" "${API_BASE}/campaigns?workspaceId=${WORKSPACE_ID}" | jq .

echo "→ GET /inbox/${WORKSPACE_ID}/conversations (limit default)"
curl -fsSL -H "$(auth)" "${API_BASE}/inbox/${WORKSPACE_ID}/conversations" | jq .

echo "✓ Core smoke completed."
