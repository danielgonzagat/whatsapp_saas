#!/usr/bin/env bash
#
# Launch the kloel-lsp-mesh MCP server. Invoked by the "lsp-mesh" entry in
# .mcp.json (Claude Code).
#
# The router is a single-file MJS at tools/lsp-mesh/lsp-router.mjs — it
# proxies 10 LSP operations (definition/references/hover/symbols/diagnostics/
# completion/code_actions/rename/health/shutdown) across 14 language servers
# in 7 workspaces, defined in tools/lsp-mesh/lsp-mesh.json.
#
# Design: NO tsx, NO npx, NO network. The router is plain Node ESM and uses
# only built-ins. It spawns the underlying LSP processes lazily, pools them
# per (language, workspace), and shuts them all down on stdin close.
#
# stdout is reserved for the MCP stdio transport — this script prints nothing
# to stdout; diagnostics go to stderr only.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"   # scripts/mcp
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)"                # repo root
ROUTER="${REPO_ROOT}/tools/lsp-mesh/lsp-router.mjs"

if [[ ! -f "${ROUTER}" ]]; then
  echo "[lsp-mesh-launcher] router missing at ${ROUTER}" >&2
  exit 2
fi

# Surface LSP server PATH expansions to the router via inherited env.
# Many LSP binaries live under /opt/homebrew/bin which is in PATH already.
cd "${REPO_ROOT}"
exec node "${ROUTER}" "$@"
