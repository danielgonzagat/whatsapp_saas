#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)"
LAUNCHER="${REPO_ROOT}/scripts/mcp/stripe-mcp-launcher.sh"
LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/stripe-mcp-check.XXXXXX.log")"
MCP_PID=""

# shellcheck disable=SC2329
cleanup() {
  if [[ -n "${MCP_PID}" ]] && kill -0 "${MCP_PID}" >/dev/null 2>&1; then
    kill "${MCP_PID}" >/dev/null 2>&1 || true
    wait "${MCP_PID}" >/dev/null 2>&1 || true
  fi

  rm -f "${LOG_FILE}"
}

trap cleanup EXIT

if [[ ! -x "${LAUNCHER}" ]]; then
  echo "status=error" >&2
  echo "reason=launcher_not_executable" >&2
  exit 1
fi

"${LAUNCHER}" >"${LOG_FILE}" 2>&1 &
MCP_PID=$!

DEADLINE=$((SECONDS + 20))
READY_BANNER="Stripe MCP Server running on stdio"

while (( SECONDS < DEADLINE )); do
  if grep -q "${READY_BANNER}" "${LOG_FILE}"; then
    ACCOUNT_CONTEXT="platform"
    if [[ -n "${STRIPE_ACCOUNT_ID:-${STRIPE_MCP_STRIPE_ACCOUNT:-}}" ]]; then
      ACCOUNT_CONTEXT="connected_account"
    fi

    echo "status=ok"
    echo "transport=stdio"
    echo "account_context=${ACCOUNT_CONTEXT}"
    exit 0
  fi

  if ! kill -0 "${MCP_PID}" >/dev/null 2>&1; then
    echo "status=error" >&2
    echo "reason=launcher_exited_early" >&2
    cat "${LOG_FILE}" >&2
    exit 1
  fi

  sleep 1
done

echo "status=error" >&2
echo "reason=startup_timeout" >&2
cat "${LOG_FILE}" >&2
exit 1
