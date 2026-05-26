#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

ENV_FILE="${REPO_ROOT}/.env.pulse.local"
if [ -f "${ENV_FILE}" ]; then
  while IFS= read -r line; do
    case "${line}" in
      ''|\#*) continue ;;
      MERCADOPAGO_PUBLIC_KEY=*|MERCADOPAGO_ACCESS_TOKEN=*|MERCADOPAGO_CLIENT_ID=*|MERCADOPAGO_CLIENT_SECRET=*|MERCADO_PAGO_ACCESS_TOKEN=*)
        export "${line}"
        ;;
    esac
  done < "${ENV_FILE}"
fi

ACCESS_TOKEN="${MERCADOPAGO_ACCESS_TOKEN:-${MERCADO_PAGO_ACCESS_TOKEN:-}}"
if [ -z "${ACCESS_TOKEN}" ]; then
  echo "MERCADOPAGO_ACCESS_TOKEN is not configured" >&2
  exit 1
fi

exec npx -y mcp-remote@latest https://mcp.mercadopago.com/mcp --header "Authorization:Bearer ${ACCESS_TOKEN}"
