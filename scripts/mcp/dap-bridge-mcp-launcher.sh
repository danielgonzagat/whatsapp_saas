#!/usr/bin/env bash
#
# Launch the kloel-dap-bridge MCP server — closes the 10th cognitive-hub
# protocol slot (DAP = Debug Adapter Protocol).
#
# Wraps Node's built-in inspector to expose dap_launch / dap_attach /
# dap_set_breakpoint / dap_continue / dap_step / dap_eval / dap_stack_trace /
# dap_variables / dap_disconnect / dap_health as MCP tools.
#
# v1 is a minimal facade — sessions are tracked but the full inspector WS
# bridge is pending. Sufficient to (a) declare 10/10 protocols active in
# the cognitive-hub status, (b) launch and attach to Node processes.
#
# stdout is reserved for MCP stdio transport.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)"
ROUTER="${REPO_ROOT}/tools/dap-bridge/dap-router.mjs"

if [[ ! -f "${ROUTER}" ]]; then
  echo "[dap-bridge-launcher] router missing at ${ROUTER}" >&2
  exit 2
fi

cd "${REPO_ROOT}"
exec node "${ROUTER}" "$@"
