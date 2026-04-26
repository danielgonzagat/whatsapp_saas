#!/usr/bin/env bash
#
# Launch the official @modelcontextprotocol/server-github with credentials
# sourced from .env.pulse.local. Invoked by the "github" entry in .mcp.json.
#
# Required in .env.pulse.local:
#   GITHUB_TOKEN=ghp_... or github_pat_...
#
# Contract: never print token values. Fail loudly on missing credentials.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../.env.pulse.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo >&2 "github-mcp: .env.pulse.local not found at $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo >&2 "github-mcp: GITHUB_TOKEN is not set in .env.pulse.local"
  echo >&2 "  Get it from: GitHub → Settings → Developer settings → Personal access tokens"
  exit 1
fi

export GITHUB_PERSONAL_ACCESS_TOKEN="${GITHUB_TOKEN}"

exec npx --yes @modelcontextprotocol/server-github@latest
