#!/usr/bin/env bash
# graphify-plus MCP launcher — sets GRAPHIFY_PLUS_ROOT and execs the server.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
export GRAPHIFY_PLUS_ROOT="${REPO_ROOT}"
exec node "${SCRIPT_DIR}/server.mjs" "$@"
