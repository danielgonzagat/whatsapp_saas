#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
export MCP_SUITE_ROOT="${REPO_ROOT}"
export KLOEL_OS_TIER="${KLOEL_OS_TIER:-NAVIGATE}"
exec node "${REPO_ROOT}/scripts/mcp/mcp-suite-server.mjs" kloel-os "$@"
