#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
export SAAS_COMPILER_ROOT="${REPO_ROOT}"

# Source LLM API keys from the gitignored local env file so that every CLI
# agent (Claude/Codex/OpenCode/Hermes) spawning this MCP server has them
# available. Lines must be plain KEY=VALUE; comments are ignored.
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
