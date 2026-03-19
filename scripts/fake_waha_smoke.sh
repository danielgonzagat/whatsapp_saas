#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/docker-compose.test.yml"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-whatsapp_saas_test}"
COMPOSE=(docker compose -p "${COMPOSE_PROJECT_NAME}" -f "${COMPOSE_FILE}")

WORKSPACE_ID="${WORKSPACE_ID:-ws-fake-waha}"
WORKSPACE_NAME="${WORKSPACE_NAME:-Fake WAHA Smoke}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-password}"
POSTGRES_DB="${POSTGRES_DB:-whatsapp_saas_test}"
API_URL="${API_URL:-http://localhost:3001}"
WORKER_HEALTH_URL="${WORKER_HEALTH_URL:-http://localhost:3003/health}"
FAKE_WAHA_URL="${FAKE_WAHA_URL:-http://localhost:3300}"
WHATSAPP_PHONE="${WHATSAPP_PHONE:-5511999999999}"
WHATSAPP_CHAT_ID="${WHATSAPP_CHAT_ID:-${WHATSAPP_PHONE}@c.us}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

wait_http() {
  local url="$1"
  local name="$2"
  local attempts="${3:-90}"

  for attempt in $(seq 1 "${attempts}"); do
    if curl -sf "${url}" >/dev/null 2>&1; then
      echo "✓ ${name} OK"
      return 0
    fi
    sleep 1
  done

  echo "Timeout waiting for ${name}: ${url}" >&2
  return 1
}

json_count() {
  node -e 'const fs=require("fs"); const raw=fs.readFileSync(0,"utf8"); const parsed=JSON.parse(raw || "{}"); const items=Array.isArray(parsed)?parsed:(Array.isArray(parsed.items)?parsed.items:[]); process.stdout.write(String(items.length));'
}

require_cmd docker
require_cmd curl
require_cmd node

echo "== Building and starting integration stack =="
"${COMPOSE[@]}" up -d --build postgres redis fake-waha backend worker

wait_http "${FAKE_WAHA_URL}/health" "fake-waha"
wait_http "${API_URL}/health" "backend"
wait_http "${WORKER_HEALTH_URL}" "worker"

echo "== Seeding workspace ${WORKSPACE_ID} =="
"${COMPOSE[@]}" exec -T postgres psql \
  -v ON_ERROR_STOP=1 \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" <<SQL
INSERT INTO "Workspace" (
  id,
  name,
  "providerSettings",
  "createdAt",
  "updatedAt"
)
VALUES (
  '${WORKSPACE_ID}',
  '${WORKSPACE_NAME}',
  \$json\${
    "whatsappProvider": "whatsapp-api",
    "autopilot": { "enabled": true },
    "autonomy": {
      "mode": "LIVE",
      "reactiveEnabled": true,
      "proactiveEnabled": false,
      "autoBootstrapOnConnected": true
    },
    "whatsappApiSession": {
      "sessionName": "${WORKSPACE_ID}",
      "status": "disconnected"
    }
  }\$json\$::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  "providerSettings" = EXCLUDED."providerSettings",
  "updatedAt" = NOW();
SQL

echo "== Resetting fake WAHA outbound log =="
curl -sf -X DELETE "${FAKE_WAHA_URL}/__fake__/outbound" >/dev/null

echo "== Seeding fake WAHA backlog =="
curl -sf -X POST "${FAKE_WAHA_URL}/__fake__/seed" \
  -H "Content-Type: application/json" \
  -d @- >/dev/null <<JSON
{
  "session": "${WORKSPACE_ID}",
  "status": "WORKING",
  "clearOutbound": true,
  "me": {
    "id": "${WHATSAPP_CHAT_ID}",
    "pushName": "Fake WAHA"
  },
  "messages": {
    "${WHATSAPP_CHAT_ID}": [
      {
        "id": "seed-inbound-1",
        "from": "${WHATSAPP_CHAT_ID}",
        "to": "${WHATSAPP_CHAT_ID}",
        "body": "Oi, quero comprar agora.",
        "type": "chat",
        "fromMe": false
      }
    ]
  }
}
JSON

echo "== Emitting session.status WORKING =="
curl -sf -X POST "${FAKE_WAHA_URL}/__fake__/emit/session-status" \
  -H "Content-Type: application/json" \
  -d "{\"session\":\"${WORKSPACE_ID}\",\"status\":\"WORKING\"}" >/dev/null

echo "== Waiting for autonomous outbound =="
outbound_payload=""
for _ in $(seq 1 90); do
  outbound_payload="$(curl -sf "${FAKE_WAHA_URL}/__fake__/outbound" || true)"
  outbound_count="$(printf '%s' "${outbound_payload}" | json_count)"
  if [[ "${outbound_count}" -ge 1 ]]; then
    break
  fi
  sleep 1
done

outbound_count="$(printf '%s' "${outbound_payload}" | json_count)"
if [[ "${outbound_count}" -lt 1 ]]; then
  echo "Fake WAHA outbound was not produced in time." >&2
  exit 1
fi

ledger_count="$(
  "${COMPOSE[@]}" exec -T postgres psql \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    -Atqc "SELECT COUNT(*) FROM \"AutonomyExecution\" WHERE \"workspaceId\" = '${WORKSPACE_ID}' AND status = 'SUCCESS';"
)"
ledger_count="$(printf '%s' "${ledger_count}" | tr -d '[:space:]')"

if [[ "${ledger_count}" -lt 1 ]]; then
  echo "AutonomyExecution ledger was not persisted." >&2
  exit 1
fi

echo "== Smoke test succeeded =="
echo "Workspace: ${WORKSPACE_ID}"
echo "Outbound count: ${outbound_count}"
echo "Ledger count: ${ledger_count}"
printf '%s\n' "${outbound_payload}"
