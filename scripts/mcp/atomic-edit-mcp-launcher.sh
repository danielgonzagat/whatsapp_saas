#!/usr/bin/env bash
#
# Launch the kloel-atomic-edit MCP server. Invoked by the "atomic-edit" entry
# in .mcp.json. Adds the sub-line atomic action space (range/insert/delete/
# batched-TextEdit/scoped-rename/literal-swap) the built-in coarse editors lack.
#
# Why a launcher: matches the repo convention for every other MCP server, and
# pins the working directory to the repo root so repo-relative paths and the
# governance-protected-file guard resolve correctly regardless of caller CWD.
#
# Contract: stdout is reserved for the MCP stdio transport. This script must
# print nothing to stdout; tsx/server diagnostics go to stderr only.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"

cd "${REPO_ROOT}"

exec npx --yes tsx "${SCRIPT_DIR}/atomic-edit/server.ts" "$@"
