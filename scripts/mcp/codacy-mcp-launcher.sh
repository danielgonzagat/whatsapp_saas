#!/usr/bin/env bash
#
# Launch the official @codacy/codacy-mcp server with credentials sourced from
# .env.pulse.local. Invoked by the "codacy" entry in .mcp.json.
#
# Why a launcher and not inline env in .mcp.json:
#   - .mcp.json is committed. Inlining tokens would leak them.
#   - Not every shell session exports CODACY_ACCOUNT_TOKEN, so we cannot rely
#     on the parent env being populated.
#   - .env.pulse.local is gitignored (pattern .env*.local) and documented in
#     CLAUDE.md as the local-only secrets file for PULSE tooling.
#
# Contract: this script must never print token values. If CODACY_ACCOUNT_TOKEN
# is missing it fails loudly so the MCP client can surface the problem.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)"
ENV_FILE="${REPO_ROOT}/.env.pulse.local"

if [[ -f "${ENV_FILE}" ]]; then
  # Only load lines that look like VAR=value. Skip comments and blank lines.
  # Use `set -a` so each var is exported to the child process.
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ -z "${CODACY_ACCOUNT_TOKEN:-}" ]]; then
  echo "[codacy-mcp-launcher] CODACY_ACCOUNT_TOKEN is not set." >&2
  echo "[codacy-mcp-launcher] Expected it in ${ENV_FILE} or the parent shell." >&2
  exit 1
fi

exec npx -y @codacy/codacy-mcp "$@"
