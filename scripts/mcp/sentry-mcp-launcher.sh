#!/usr/bin/env bash
#
# Launch @sentry/mcp-server with credentials sourced from .env.pulse.local.
# Invoked by the "sentry" entry in ~/.claude.json mcpServers.
#
# Required in .env.pulse.local:
#   SENTRY_TOKEN=sntryu_...   (User Auth Token from Sentry → Settings → Auth Tokens)
#   SENTRY_ORG=<org-slug>     (optional, constrains all calls to one org)
#
# Contract: never print token values. Fail loudly on missing credentials.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../.env.pulse.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo >&2 "sentry-mcp: .env.pulse.local not found at $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${SENTRY_TOKEN:-}" ]]; then
  echo >&2 "sentry-mcp: SENTRY_TOKEN is not set in .env.pulse.local"
  echo >&2 "  Get it from: Sentry → Settings → Auth Tokens → New Token"
  exit 1
fi

ARGS=(--access-token="${SENTRY_TOKEN}")

if [[ -n "${SENTRY_ORG:-}" ]]; then
  ARGS+=(--organization-slug="${SENTRY_ORG}")
fi

exec npx --yes @sentry/mcp-server@latest "${ARGS[@]}"
