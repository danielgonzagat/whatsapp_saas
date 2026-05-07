#!/usr/bin/env bash
#
# Launch railway-mcp with credentials sourced from .env.pulse.local.
# Invoked by the "railway" entry in .mcp.json.
#
# Why a launcher:
#   - .mcp.json is committed; inlining tokens would leak them.
#   - .env.pulse.local is gitignored and documented in CLAUDE.md as the
#     local-only secrets file for PULSE tooling.
#
# Contract: never print token values. Fail loudly on missing credentials.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../.env.pulse.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo >&2 "railway-mcp: .env.pulse.local not found at $ENV_FILE"
  exit 1
fi

# Source without exporting everything to the outer shell
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${RAILWAY_TOKEN:-}" ]]; then
  echo >&2 "railway-mcp: RAILWAY_TOKEN is not set in .env.pulse.local"
  exit 1
fi

export RAILWAY_TOKEN

exec npx --yes railway-mcp@latest
