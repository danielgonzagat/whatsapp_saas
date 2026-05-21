#!/usr/bin/env bash
# graphify-plus MCP launcher — sets GRAPHIFY_PLUS_ROOT and execs the server.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
export GRAPHIFY_PLUS_ROOT="${REPO_ROOT}"

ENV_FILE="${REPO_ROOT}/.env.pulse.local"
if [ -f "${ENV_FILE}" ]; then
  while IFS= read -r line; do
    case "${line}" in
      ''|\#*) continue ;;
      ANTHROPIC_API_KEY=*|DEEPSEEK_API_KEY=*|OPENAI_API_KEY=*)
        export "${line}"
        ;;
    esac
  done < "${ENV_FILE}"
fi

exec node "${SCRIPT_DIR}/server.mjs" "$@"
