#!/usr/bin/env bash
# Codecov MCP launcher for KLOEL.
# Sources env vars, then delegates to the persistent Node server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.pulse.local"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# Normalize token env var. Codecov uses different tokens for upload vs API.
# Priority: CODECOV_API_KEY > CODECOV_STATIC_TOKEN > CODECOV_TOKEN
# Upload tokens (CODECOV_TOKEN) do NOT work for API v2 — you need an API token
# from https://app.codecov.io/account/gh/<user>/api-tokens
if [[ -z "${CODECOV_API_KEY:-}" ]]; then
  if [[ -n "${CODECOV_STATIC_TOKEN:-}" ]]; then
    export CODECOV_API_KEY="${CODECOV_STATIC_TOKEN}"
  elif [[ -n "${CODECOV_TOKEN:-}" ]]; then
    export CODECOV_API_KEY="${CODECOV_TOKEN}"
  fi
fi

# Defaults
export GIT_URL="${GIT_URL:-https://github.com/danielgonzagat/whatsapp_saas.git}"
export GITHUB_OWNER="${GITHUB_OWNER:-danielgonzagat}"
export GITHUB_REPO="${GITHUB_REPO:-whatsapp_saas}"
export GITHUB_SERVICE="${GITHUB_SERVICE:-github}"

exec node "${SCRIPT_DIR}/codecov-mcp-server.mjs"
