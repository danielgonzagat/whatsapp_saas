#!/usr/bin/env bash
#
# Launch codecov-mcp-server with credentials sourced from .env.pulse.local.
# Invoked by the "codecov" entry in .mcp.json.
#
# Required in .env.pulse.local:
#   CODECOV_TOKEN=<token>      (from app.codecov.io → Settings → Access Tokens)
#   GITHUB_OWNER=<owner>       (GitHub org or user slug)
#   GITHUB_REPO=<repo>         (repository name)
#
# Contract: never print token values. Fail loudly on missing credentials.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../.env.pulse.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo >&2 "codecov-mcp: .env.pulse.local not found at $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${CODECOV_TOKEN:-}" ]]; then
  echo >&2 "codecov-mcp: CODECOV_TOKEN is not set in .env.pulse.local"
  echo >&2 "  Get it from: app.codecov.io → Settings → Access Tokens"
  exit 1
fi

export CODECOV_TOKEN
export GITHUB_OWNER="${GITHUB_OWNER:-}"
export GITHUB_REPO="${GITHUB_REPO:-}"

exec npx --yes codecov-mcp-server@latest
