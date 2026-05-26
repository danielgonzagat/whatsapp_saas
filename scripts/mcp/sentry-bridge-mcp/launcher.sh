#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
# Load Sentry tokens from .env.pulse.local via eval (process substitution
# unreliable across bash versions when piped under MCP stdio).
ENV_FILE="${REPO_ROOT}/.env.pulse.local"
if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      SENTRY_PERSONAL_TOKEN|SENTRY_AUTH_TOKEN|SENTRY_ORG|SENTRY_PROJECT|SENTRY_PROJECT_ID_NODE|SENTRY_PROJECT_ID_NEXTJS)
        export "$key=$value"
        ;;
    esac
  done < <(grep -E '^SENTRY_' "$ENV_FILE")
fi
exec node "${SCRIPT_DIR}/server.mjs" "$@"
