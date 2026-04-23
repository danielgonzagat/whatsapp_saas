#!/usr/bin/env bash
#
# Launch datadog-mcp-server with credentials sourced from .env.pulse.local.
# Invoked by the "datadog" entry in .mcp.json.
#
# Required in .env.pulse.local:
#   DD_API_KEY=<api-key-from-org-settings>
#   DD_APP_KEY=<app-key-from-org-settings>
#   DD_SITE=datadoghq.com        # optional, defaults to us5.datadoghq.com
#   DD_ALLOW_WRITE=false         # optional, set true for mutate operations
#
# To obtain keys: Datadog → Organization Settings → API Keys / Application Keys
#
# Contract: never print token values. Fail loudly on missing credentials.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../.env.pulse.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo >&2 "datadog-mcp: .env.pulse.local not found at $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DD_API_KEY:-}" ]]; then
  echo >&2 "datadog-mcp: DD_API_KEY is not set in .env.pulse.local"
  echo >&2 "  Get it from: Datadog → Organization Settings → API Keys"
  exit 1
fi

if [[ -z "${DD_APP_KEY:-}" ]] || [[ "${DD_APP_KEY:-}" == PLACEHOLDER* ]]; then
  echo >&2 "datadog-mcp: WARNING — DD_APP_KEY not configured in .env.pulse.local"
  echo >&2 "  Get it from: Datadog → Organization Settings → Application Keys → New Key"
  echo >&2 "  Note: DD_API_KEY_ID (UUID) is the key identifier, not the Application Key."
  echo >&2 "  Starting in degraded mode (some tools may return 403)."
fi

export DD_API_KEY
export DD_APP_KEY
export DD_SITE="${DD_SITE:-datadoghq.com}"
export DD_ALLOW_WRITE="${DD_ALLOW_WRITE:-false}"

exec npx --yes datadog-mcp-server@latest
