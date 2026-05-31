#!/usr/bin/env bash
# Vercel MCP launcher — connects to the OFFICIAL Vercel MCP server
# (https://mcp.vercel.com) using a personal access token (VERCEL_TOKEN) via an
# Authorization bearer header, instead of the interactive OAuth browser flow.
# This lets the server auto-connect headless and persist across sessions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.pulse.local"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo >&2 "vercel-mcp: VERCEL_TOKEN is not set in .env.pulse.local"
  exit 1
fi

exec npx -y mcp-remote@latest https://mcp.vercel.com --header "Authorization:Bearer ${VERCEL_TOKEN}"
