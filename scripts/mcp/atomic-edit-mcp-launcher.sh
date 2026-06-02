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

recover_atomic_host_from_state() {
  local state="${REPO_ROOT}/.atomic/codex-broker-current.json"
  [[ -f "${state}" ]] || return 1

  local recovered
  recovered="$(
    node -e '
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const statePath = process.argv[1];
const repoRoot = process.argv[2];
function fail() {
  process.exit(1);
}
function quote(value) {
  return JSON.stringify(String(value));
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(statePath, "utf8"));
} catch {
  fail();
}

if (payload?.agent !== "codex" || payload?.repoRoot !== repoRoot || typeof payload?.socket !== "string") fail();

const endpoint = payload.socket;
if (endpoint.startsWith("file://")) {
  const dir = fileURLToPath(endpoint);
  if (!dir.startsWith(repoRoot + path.sep)) fail();
  if (!fs.existsSync(path.join(dir, "requests")) || !fs.existsSync(path.join(dir, "responses"))) fail();
} else {
  const socketPath = path.resolve(endpoint);
  if (!socketPath.startsWith(repoRoot + path.sep)) fail();
  let stat;
  try {
    stat = fs.statSync(socketPath);
  } catch {
    fail();
  }
  if (!stat.isSocket()) fail();
}

console.log("export ATOMIC_HOST_SANDBOX=" + quote("macos-sandbox-exec"));
console.log("export ATOMIC_HOST_ATOMIC_ONLY=" + quote("1"));
console.log("export ATOMIC_HOST_WRITE_ROOT=" + quote(repoRoot));
console.log("export ATOMIC_HOST_AGENT=" + quote("codex"));
console.log("export ATOMIC_EXEC_BROKER_SOCKET=" + quote(endpoint));
' "${state}" "${REPO_ROOT}"
  )" || return 1

  eval "${recovered}"
}

if [[ "${ATOMIC_HOST_SANDBOX:-}" != "macos-sandbox-exec" || "${ATOMIC_HOST_ATOMIC_ONLY:-}" != "1" || "${ATOMIC_HOST_WRITE_ROOT:-}" != "${REPO_ROOT}" || -z "${ATOMIC_EXEC_BROKER_SOCKET:-}" ]]; then
  recover_atomic_host_from_state || true
fi

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
