#!/usr/bin/env bash
#
# Launch the kloel-atomic-edit MCP server. Invoked by the "atomic-edit" entry
# in .mcp.json (Claude Code) and the "atomic-edit" mcp entry in opencode.json
# / ~/.config/opencode/opencode.json (every OpenCode agent + subagent).
#
# Permanent design: NO tsx, NO npx, NO network. The server graph is compiled
# once to dist/ with the already-installed `typescript`, then run as plain
# `node dist/server.js` (sub-second cold start, deterministic, upgrade-proof).
# It self-rebuilds ONLY when a source .ts is newer than dist/server.js, so it
# always reflects the latest source without a manual build step.
#
# stdout is reserved for the MCP stdio transport — this script prints nothing
# to stdout; build/diagnostic output goes to stderr only.

set -euo pipefail

# launcher lives at scripts/mcp/atomic-edit-mcp-launcher.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"   # scripts/mcp
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)"                # repo root
SRC_DIR="${SCRIPT_DIR}/atomic-edit"
DIST="${SRC_DIR}/dist/server.js"

cd "${REPO_ROOT}"

needs_build() {
  [[ ! -f "${DIST}" ]] && return 0
  local newest
  newest="$(find "${SRC_DIR}" -maxdepth 1 -name '*.ts' -newer "${DIST}" -print -quit 2>/dev/null || true)"
  [[ -n "${newest}" ]]
}

if needs_build; then
  echo "[atomic-edit-launcher] building dist (source changed)…" >&2
  node "${SRC_DIR}/build.mjs" >&2
fi

exec node "${DIST}" "$@"
