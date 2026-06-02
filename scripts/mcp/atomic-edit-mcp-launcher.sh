#!/usr/bin/env bash
#
# Launch the kloel-atomic-edit MCP server. Invoked by the "atomic-edit" entry
# in .mcp.json (Claude Code) and the "atomic-edit" mcp entry in opencode.json
# / ~/.config/opencode/opencode.json (every OpenCode agent + subagent).
#
# Permanent design: NO tsx, NO npx. Network only on first run, to install the
# self-contained universal-engine deps (web-tree-sitter + grammars); offline
# forever after. The server graph is compiled
# once to dist/ with the already-installed `typescript`, then run as plain
# `node dist/server.js` (sub-second cold start, deterministic, upgrade-proof).
# It self-rebuilds ONLY when a source .ts is newer than dist/server.js, so it
# always reflects the latest source without a manual build step.
#
# stdout is reserved for the MCP stdio transport — this script prints nothing
# to stdout; build/diagnostic output goes to stderr only.

set -euo pipefail

# launcher lives at scripts/mcp/atomic-edit-mcp-launcher.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # scripts/mcp
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"                # repo root
SRC_DIR="${SCRIPT_DIR}/atomic-edit"
DIST="${SRC_DIR}/dist/server.js"

cd "${REPO_ROOT}"

if [[ "${ATOMIC_HOST_SANDBOX:-}" != "macos-sandbox-exec" || "${ATOMIC_HOST_ATOMIC_ONLY:-}" != "1" || "${ATOMIC_HOST_WRITE_ROOT:-}" != "${REPO_ROOT}" ]]; then
  echo "[atomic-edit-launcher] REFUSED: atomic-edit MCP requires the atomic host sandbox boundary." >&2
  echo "[atomic-edit-launcher] Relaunch the agent through: node scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs -- <agent-command>" >&2
  exit 79
fi

if [[ -z "${ATOMIC_EXEC_BROKER_SOCKET:-}" ]]; then
  echo "[atomic-edit-launcher] REFUSED: atomic host mode requires ATOMIC_EXEC_BROKER_SOCKET for per-command sandboxing." >&2
  echo "[atomic-edit-launcher] Relaunch the agent through: node scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs -- <agent-command>" >&2
  exit 80
fi

if [[ "${ATOMIC_EXEC_BROKER_SOCKET}" == file://* ]]; then
  BROKER_FILE_DIR="${ATOMIC_EXEC_BROKER_SOCKET#file://}"
  if [[ ! -d "${BROKER_FILE_DIR}/requests" || ! -d "${BROKER_FILE_DIR}/responses" ]]; then
    echo "[atomic-edit-launcher] REFUSED: file broker endpoint is not ready." >&2
    exit 80
  fi
elif [[ ! -S "${ATOMIC_EXEC_BROKER_SOCKET}" ]]; then
  echo "[atomic-edit-launcher] REFUSED: atomic host mode broker socket is not ready." >&2
  echo "[atomic-edit-launcher] Relaunch the agent through: node scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs -- <agent-command>" >&2
  exit 80
fi

# First-run bootstrap: install the self-contained universal-engine deps
# (web-tree-sitter + tree-sitter grammar wasm). One-time network; offline after.
# Without these the dynamic import() degrades and only the universal (multi-lang)
# tools are affected — the core TS/firewall tools work regardless.
if [[ ! -d "${SRC_DIR}/node_modules/web-tree-sitter" ]]; then
  echo "[atomic-edit-launcher] installing universal-engine deps (first run)…" >&2
  (cd "${SRC_DIR}" && npm install --no-audit --no-fund --silent >&2) \
    || echo "[atomic-edit-launcher] WARN: dep install failed — universal tools degrade, core tools still work" >&2
fi

needs_build() {
  [[ ! -f "${DIST}" ]] && return 0
  local newest
  if newest="$(find "${SRC_DIR}" -maxdepth 1 -name '*.ts' -newer "${DIST}" -print -quit 2>&1)"; then
    [[ -n "${newest}" ]]
  else
    return 0
  fi
}

manifest_fresh() {
  local freshness_output
  freshness_output="$(node "${SRC_DIR}/dist-freshness.mjs" --check 2>&1)"
}

if needs_build || ! manifest_fresh; then
  echo "[atomic-edit-launcher] building dist (source changed or manifest stale)…" >&2
  node "${SRC_DIR}/build.mjs" >&2
fi

if ! manifest_fresh; then
  echo "[atomic-edit-launcher] REFUSED: dist/server.js is stale after rebuild; refusing stale Atomic MCP startup." >&2
  node "${SRC_DIR}/dist-freshness.mjs" --check >&2 || true
  exit 81
fi

# The entrypoint contract reads CODEX_PROJECT_DIR + TMPDIR/TMP/TEMP on THIS
# (server) process to confirm the repo-root pin (hostEnvOk, gates/
# codex-entrypoint-contract.proof.mjs). Host launchers differ on whether they
# pin these; export them here so the atomic MCP server is self-expansion-capable
# regardless of which host launcher started the agent — no launcher-specific
# dependency. Repo-root TMPDIR matches the host write-root; once self-expansion
# is live the temp-root contract can be generalized to "within the write-root".
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export CODEX_PROJECT_DIR="${REPO_ROOT}"
export TMPDIR="${REPO_ROOT}"
export TMP="${REPO_ROOT}"
export TEMP="${REPO_ROOT}"

exec node "${DIST}" "$@"
