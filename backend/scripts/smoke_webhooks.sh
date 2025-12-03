#!/usr/bin/env bash
set -euo pipefail

# Smoke de webhooks (genérico e pagamentos) com assinatura e idempotência.
# Requer:
#   API_BASE=https://api.example.com
#   WORKSPACE_ID=<uuid>
#   FLOW_ID=<flow id para catch>
#   HOOK_SECRET=<HOOKS_WEBHOOK_SECRET opcional>
#   PAYMENT_SECRET=<PAYMENT_WEBHOOK_SECRET opcional>
#
# Uso:
#   API_BASE=... WORKSPACE_ID=... FLOW_ID=... ./backend/scripts/smoke_webhooks.sh

if [[ -z "${API_BASE:-}" || -z "${WORKSPACE_ID:-}" || -z "${FLOW_ID:-}" ]]; then
  echo "Missing API_BASE, WORKSPACE_ID or FLOW_ID env vars." >&2
  exit 1
fi

EVENT_ID="evt-$(date +%s)"
BODY='{"phone":"+5511999999999","status":"paid","amount":197,"workspaceId":"'"${WORKSPACE_ID}"'"}'

sign_body() {
  local body="$1"
  local secret="$2"
  if [[ -z "$secret" ]]; then
    echo ""
  else
    printf "%s" "$body" | openssl dgst -sha256 -hmac "$secret" | awk '{print $2}'
  fi
}

sig=""
if [[ -n "${HOOK_SECRET:-}" ]]; then
  sig=$(sign_body "$BODY" "$HOOK_SECRET")
fi

echo "→ /hooks/catch (generic) with event-id $EVENT_ID"
curl -fsSL -X POST \
  -H "Content-Type: application/json" \
  -H "x-event-id: ${EVENT_ID}" \
  ${sig:+-H "x-webhook-signature: ${sig}"} \
  -d "$BODY" \
  "${API_BASE}/hooks/catch/${WORKSPACE_ID}/${FLOW_ID}" | jq .

echo "→ /webhook/payment (generic) with event-id $EVENT_ID"
curl -fsSL -X POST \
  -H "Content-Type: application/json" \
  -H "x-event-id: ${EVENT_ID}" \
  ${PAYMENT_SECRET:+-H "x-webhook-secret: ${PAYMENT_SECRET}"} \
  -d "$BODY" \
  "${API_BASE}/webhook/payment" | jq .

echo "✓ Smoke webhooks concluído."
