#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
export CODEBODY_NAV_ROOT="${REPO_ROOT}"

# Source local env (optional) for codegraph location / API keys.
ENV_FILE="${REPO_ROOT}/.env.pulse.local"
if [ -f "${ENV_FILE}" ]; then
  while IFS= read -r line; do
    case "${line}" in
      ''|\#*) continue ;;
      ANTHROPIC_API_KEY=*|DEEPSEEK_API_KEY=*|OPENAI_API_KEY=*|CODEBODY_NAV_STATE=*)
        export "${line}"
        ;;
    esac
  done < "${ENV_FILE}"
fi

exec node "${SCRIPT_DIR}/server.mjs" "$@"
