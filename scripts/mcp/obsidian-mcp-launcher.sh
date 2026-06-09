#!/usr/bin/env bash
set -euo pipefail

VAULT="${KLOEL_VAULT_ROOT:-/Users/danielpenin/Documents/Obsidian Vault}"
DATA="$VAULT/.obsidian/plugins/obsidian-local-rest-api/data.json"

if [ -z "${OBSIDIAN_API_KEY:-}" ] && [ -f "$DATA" ] && command -v jq >/dev/null 2>&1; then
  OBSIDIAN_API_KEY="$(jq -r '.apiKey // empty' "$DATA")"
  export OBSIDIAN_API_KEY
fi

export MCP_TRANSPORT_TYPE="${MCP_TRANSPORT_TYPE:-stdio}"
export MCP_LOG_LEVEL="${MCP_LOG_LEVEL:-error}"
export OBSIDIAN_BASE_URL="${OBSIDIAN_BASE_URL:-https://127.0.0.1:27124}"
export OBSIDIAN_VERIFY_SSL="${OBSIDIAN_VERIFY_SSL:-false}"

exec npx -y obsidian-mcp-server@3.2.1
