#!/usr/bin/env bash
#
# BOOTSTRAP — registered MCP entrypoint for the kloel-atomic-edit server.
# (.mcp.json / ~/.claude.json / ~/.codex/config.toml / opencode.json all point here.)
#
# ▄▄▄ DO NOT ADD LOGIC TO THIS FILE ▄▄▄
# All launch logic lives in atomic-edit-mcp-launcher-impl.sh; supervision,
# crash recovery, handshake replay, dist-lkg fallback and rescue mode live in
# atomic-edit/launcher-supervisor.mjs. This file only resolves Node, repairs a
# broken chain from atomic-edit/launcher-blessed/, and execs the supervisor.
# It is auto-restored from the blessed copy if corrupted — edits to it are
# expected to be overwritten. Edit the impl or the supervisor instead.
#
# stdout is reserved for the MCP stdio transport — diagnostics go to stderr.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # scripts/mcp
SRC_DIR="${SCRIPT_DIR}/atomic-edit"
IMPL="${SCRIPT_DIR}/atomic-edit-mcp-launcher-impl.sh"
SUPERVISOR="${SRC_DIR}/launcher-supervisor.mjs"
BLESSED="${SRC_DIR}/launcher-blessed"

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
  echo "[atomic-edit-bootstrap] REFUSED: no executable Node.js >=18 runtime found. Set ATOMIC_NODE_BIN to a valid node binary." >&2
  exit 78
}

resolve_node_bin

# Self-repair: a corrupted impl/supervisor is restored from the blessed copies
# written by the supervisor after the last fully-successful boot.
if [[ ! -f "${IMPL}" ]] || ! /bin/bash -n "${IMPL}" >&2; then
  if [[ -f "${BLESSED}/atomic-edit-mcp-launcher-impl.sh" ]]; then
    echo "[atomic-edit-bootstrap] impl missing/corrupted — restoring blessed copy" >&2
    cp "${BLESSED}/atomic-edit-mcp-launcher-impl.sh" "${IMPL}.restore.$$" && chmod 755 "${IMPL}.restore.$$" && mv "${IMPL}.restore.$$" "${IMPL}" || true
  fi
fi

if [[ ! -f "${SUPERVISOR}" ]] || ! "${NODE_BIN}" --check "${SUPERVISOR}" >&2; then
  if [[ -f "${BLESSED}/launcher-supervisor.mjs" ]]; then
    echo "[atomic-edit-bootstrap] supervisor missing/corrupted — restoring blessed copy" >&2
    cp "${BLESSED}/launcher-supervisor.mjs" "${SUPERVISOR}.restore.$$" && mv "${SUPERVISOR}.restore.$$" "${SUPERVISOR}" || true
  fi
fi

if [[ -f "${SUPERVISOR}" ]] && "${NODE_BIN}" --check "${SUPERVISOR}" >&2; then
  exec "${NODE_BIN}" "${SUPERVISOR}" "$@"
fi

# Degraded path: no usable supervisor anywhere — run the impl chain directly
# (pre-supervisor behavior; service without crash armor beats no service).
echo "[atomic-edit-bootstrap] WARN: supervisor unavailable — running impl directly (no crash armor)" >&2
exec /bin/bash "${IMPL}" "$@"
