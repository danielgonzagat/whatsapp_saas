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
CALLER_WORKSPACE_ROOT="$(pwd -P)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # scripts/mcp
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"                # repo root
SRC_DIR="${SCRIPT_DIR}/atomic-edit"
DIST="${SRC_DIR}/dist/server.js"

cd "${REPO_ROOT}"

# Pin runtime temp/output roots before any Node helper runs. Build, broker, and
# dist-freshness probes must never fall back to /tmp under the host sandbox.
# ATOMIC_WORKSPACE_ROOT preserves the caller cwd as the default action root so
# linked worktree/sub-project workers do not resolve relative paths in REPO_ROOT.
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export CODEX_PROJECT_DIR="${REPO_ROOT}"
export ATOMIC_WORKSPACE_ROOT="${ATOMIC_WORKSPACE_ROOT:-${CALLER_WORKSPACE_ROOT}}"
export TMPDIR="${REPO_ROOT}"
export TMP="${REPO_ROOT}"
export TEMP="${REPO_ROOT}"

resolve_node_bin() {
  local node_from_path candidate probe_output
  node_from_path="$(command -v node || true)"
  for candidate in \
    "${ATOMIC_NODE_BIN:-}" \
    "${node_from_path}" \
    /opt/homebrew/opt/node@22/bin/node \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    /usr/bin/node; do
    [[ -n "${candidate}" && -x "${candidate}" ]] || continue
    if probe_output="$("${candidate}" -e 'const major = Number(process.versions.node.split(".")[0]); process.exit(major >= 18 ? 0 : 1);' 2>&1)"; then
      NODE_BIN="${candidate}"
      export NODE_BIN
      return 0
    fi
  done
  echo "[atomic-edit-launcher] REFUSED: no executable Node.js >=18 runtime found. Set ATOMIC_NODE_BIN to a valid node binary." >&2
  exit 78
}

resolve_node_bin

recover_atomic_host_from_state() {
  local state="${REPO_ROOT}/.atomic/codex-broker-current.json"
  [[ -f "${state}" ]] || return 1

  local recovered
  recovered="$(
    "${NODE_BIN}" -e '
const childProcess = require("node:child_process");
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

function realDir(value) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    fail();
  }
}
function containsPath(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
function brokerResponds(endpoint) {
  const client = path.join(repoRootReal, "scripts/mcp/atomic-edit/atomic-exec-broker-client.mjs");
  if (!fs.existsSync(client)) return false;
  const probe = childProcess.spawnSync(process.execPath, [client, endpoint], {
    cwd: repoRootReal,
    input: JSON.stringify({ command: "true", cwd: repoRootReal, effectRoot: null, timeoutMs: 1000 }),
    encoding: "utf8",
    timeout: 2500,
    maxBuffer: 1024 * 1024,
  });
  if (probe.error || probe.status !== 0) return false;
  try {
    const reply = JSON.parse(probe.stdout || "{}");
    return reply?.ok === true && reply?.exitCode === 0 && !reply?.brokerUnreachable;
  } catch {
    return false;
  }
}

if (payload?.agent !== "codex" || typeof payload?.repoRoot !== "string" || typeof payload?.socket !== "string") fail();
const repoRootReal = realDir(repoRoot);
const payloadRootReal = realDir(payload.repoRoot);
if (payloadRootReal !== repoRootReal) fail();

const endpoint = payload.socket;
if (endpoint.startsWith("file://")) {
  const dir = fileURLToPath(endpoint);
  if (!containsPath(repoRootReal, realDir(dir))) fail();
  if (!fs.existsSync(path.join(dir, "requests")) || !fs.existsSync(path.join(dir, "responses"))) fail();
} else {
  const socketPath = path.resolve(endpoint);
  if (!containsPath(repoRootReal, realDir(socketPath))) fail();
  let stat;
  try {
    stat = fs.statSync(socketPath);
  } catch {
    fail();
  }
  if (!stat.isSocket()) fail();
}
if (!brokerResponds(endpoint)) fail();

console.log("export ATOMIC_HOST_SANDBOX=" + quote("macos-sandbox-exec"));
console.log("export ATOMIC_HOST_ATOMIC_ONLY=" + quote("1"));
console.log("export ATOMIC_HOST_WRITE_ROOT=" + quote(repoRoot));
console.log("export ATOMIC_HOST_AGENT=" + quote("codex"));
console.log("export ATOMIC_EXEC_BROKER_SOCKET=" + quote(endpoint));
' "${state}" "${REPO_ROOT}"
  )" || return 1

  eval "${recovered}"
}

# ── Self-hosted mode (no sandbox-exec, no external broker) ──
# When ATOMIC_EDIT_MCP_SELF_HOSTED=1 the launcher starts the atomic MCP server
# WITHOUT the macOS sandbox boundary. The broker requirement is satisfied by a
# minimal file-based broker spawned as a background child.
# GUARANTEE LOSS DISCLOSURE: without the host sandbox, the agent process CAN
# write outside the repo root via non-atomic tools. The atomic MCP tools
# themselves still enforce syntax validation, sha256, and governance, but the
# OS-level no-bypass guarantee (whole-host action space) is absent.
# This mode exists for development/CI/OpenCode sessions where sandbox-exec is
# unavailable; do NOT use it in production Codex Code or Claude Code hosted
# sessions where the host launcher is the intended gate.

# ── Detect whether we're in host mode or need fallback ──
if [[ "${ATOMIC_EDIT_MCP_SELF_HOSTED:-}" != "1" ]]; then
  if [[ "${ATOMIC_RECOVER_HOST_FROM_STATE:-}" == "1" ]]; then
    if [[ "${ATOMIC_HOST_SANDBOX:-}" != "macos-sandbox-exec" || "${ATOMIC_HOST_ATOMIC_ONLY:-}" != "1" || "${ATOMIC_HOST_WRITE_ROOT:-}" != "${REPO_ROOT}" || -z "${ATOMIC_EXEC_BROKER_SOCKET:-}" ]]; then
      recover_atomic_host_from_state || true
    fi
  fi
  if [[ "${ATOMIC_HOST_SANDBOX:-}" != "macos-sandbox-exec" || "${ATOMIC_HOST_ATOMIC_ONLY:-}" != "1" || "${ATOMIC_HOST_WRITE_ROOT:-}" != "${REPO_ROOT}" ]]; then
    # Try the codex host launcher if available; on success it replaces this process.
    if [[ -x "${SRC_DIR}/codex-atomic-host-launcher.mjs" ]]; then
      unset ATOMIC_EDIT_MCP_SELF_HOSTED
      unset ATOMIC_EDIT_ALLOW_SELF_HOSTED
      exec "${NODE_BIN}" "${SRC_DIR}/codex-atomic-host-launcher.mjs" -- /bin/bash "${BASH_SOURCE[0]}" "$@"
    fi
    echo "[atomic-edit-launcher] REFUSED: atomic MCP requires the atomic host sandbox boundary. Set ATOMIC_EDIT_MCP_SELF_HOSTED=1 and ATOMIC_EDIT_ALLOW_SELF_HOSTED=1 only for explicit degraded-mode development/CI admission. Host mode also requires ATOMIC_EXEC_BROKER_SOCKET." >&2
    exit 79
  fi
fi

# ── Enforce self-hosted starting conditions ──
if [[ "${ATOMIC_EDIT_MCP_SELF_HOSTED:-}" == "1" ]]; then
  if [[ "${ATOMIC_EDIT_ALLOW_SELF_HOSTED:-}" != "1" ]]; then
    echo "[atomic-edit-launcher] REFUSED: self-hosted mode requires the atomic host sandbox boundary or explicit ATOMIC_EDIT_ALLOW_SELF_HOSTED=1 degraded-mode admission." >&2
    exit 79
  fi

  export ATOMIC_HOST_SANDBOX="self-hosted"
  export ATOMIC_HOST_ATOMIC_ONLY="0"
  export ATOMIC_HOST_WRITE_ROOT="${REPO_ROOT}"

  # Start a minimal file-based broker so atomic_exec works.
  if [[ -z "${ATOMIC_EXEC_BROKER_SOCKET:-}" ]]; then
    BROKER_DIR="${REPO_ROOT}/.atomic/self-hosted-broker"
    mkdir -p "${BROKER_DIR}/requests" "${BROKER_DIR}/responses"
    export ATOMIC_EXEC_BROKER_SOCKET="file://${BROKER_DIR}"
    "${NODE_BIN}" "${SRC_DIR}/atomic-exec-broker.mjs" --no-sandbox "${ATOMIC_EXEC_BROKER_SOCKET}" &
    BROKER_PID=$!
    trap "kill ${BROKER_PID} || true; rm -rf ${BROKER_DIR}" EXIT
    sleep 0.2
  fi

  echo "[atomic-edit-launcher] SELF-HOSTED mode — sandbox boundary absent; tools available, no-bypass not OS-enforced." >&2
else
  # ── Host mode (full sandbox-exec boundary) ──
  if [[ -z "${ATOMIC_EXEC_BROKER_SOCKET:-}" ]]; then
    echo "[atomic-edit-launcher] REFUSED: atomic host mode requires ATOMIC_EXEC_BROKER_SOCKET for per-command sandboxing." >&2
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
    exit 80
  fi

  if ! "${NODE_BIN}" -e '
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const repoRoot = process.argv[1];
const endpoint = process.argv[2];
const client = path.join(repoRoot, "scripts/mcp/atomic-edit/atomic-exec-broker-client.mjs");
if (!endpoint || !fs.existsSync(client)) process.exit(1);
const probe = childProcess.spawnSync(process.execPath, [client, endpoint], {
  cwd: repoRoot,
  input: JSON.stringify({ command: "true", cwd: repoRoot, effectRoot: null, timeoutMs: 1000 }),
  encoding: "utf8",
  timeout: 2500,
  maxBuffer: 1024 * 1024,
});
if (probe.error || probe.status !== 0) process.exit(1);
try {
  const reply = JSON.parse(probe.stdout || "{}");
  process.exit(reply?.ok === true && reply?.exitCode === 0 && !reply?.brokerUnreachable ? 0 : 1);
} catch {
  process.exit(1);
}
' "${REPO_ROOT}" "${ATOMIC_EXEC_BROKER_SOCKET}"; then
    echo "[atomic-edit-launcher] REFUSED: atomic host mode broker socket is stale or unreachable." >&2
    exit 80
  fi
fi

# First-run bootstrap: install the self-contained universal-engine deps
# (web-tree-sitter + tree-sitter grammar wasm). One-time network; offline after.
# Without these the dynamic import() degrades and only the universal (multi-lang)
# tools are affected — the core TS/firewall tools work regardless.
if [[ ! -d "${SRC_DIR}/node_modules/web-tree-sitter" || ! -d "${SRC_DIR}/node_modules/@modelcontextprotocol/sdk" ]]; then
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
  freshness_output="$("${NODE_BIN}" "${SRC_DIR}/dist-freshness.mjs" --check 2>&1)"
}

if needs_build || ! manifest_fresh; then
  echo "[atomic-edit-launcher] building dist (source changed or manifest stale)…" >&2
  "${NODE_BIN}" "${SRC_DIR}/build.mjs" >&2
fi

if ! manifest_fresh; then
  echo "[atomic-edit-launcher] REFUSED: dist/server.js is stale after rebuild; refusing stale Atomic MCP startup." >&2
  "${NODE_BIN}" "${SRC_DIR}/dist-freshness.mjs" --check >&2 || true
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
export ATOMIC_WORKSPACE_ROOT="${ATOMIC_WORKSPACE_ROOT:-${CALLER_WORKSPACE_ROOT}}"
export TMPDIR="${REPO_ROOT}"
export TMP="${REPO_ROOT}"
export TEMP="${REPO_ROOT}"

exec "${NODE_BIN}" "${DIST}" "$@"
