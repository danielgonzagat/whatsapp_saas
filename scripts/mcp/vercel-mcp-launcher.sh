#!/usr/bin/env bash
# Vercel MCP launcher — maps VERCEL_TOKEN from .env.pulse.local to vercel-mcp.
# Replaces the raw https://mcp.vercel.com HTTP endpoint with a stdio transport
# that has proper auth from our local secrets file.
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

export VERCEL_API_KEY="${VERCEL_TOKEN}"
export VERCEL_TOKEN
exec npx --yes vercel-mcp@latest
