#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

export KAISSER_CWD="${KAISSER_CWD:-$REPO_ROOT}"
export KAISSER_BIN="${KAISSER_BIN:-$HOME/.claude/bin/kaisser}"

if [[ ! -x "$KAISSER_BIN" ]]; then
  echo >&2 "kaisser-mcp: kaisser binary not executable at $KAISSER_BIN"
  exit 1
fi

exec node "${SCRIPT_DIR}/../wrap-cl-to-nl.mjs" "${SCRIPT_DIR}/server.mjs"
