#!/usr/bin/env bash
# Wrapper para o Hermes MCP client — modo self-hosted
set -euo pipefail

export ATOMIC_EDIT_MCP_SELF_HOSTED=1
export ATOMIC_EDIT_ALLOW_SELF_HOSTED=1
export ATOMIC_WORKSPACE_ROOT="${ATOMIC_WORKSPACE_ROOT:-/Users/danielpenin/kloel}"

exec bash /Users/danielpenin/kloel/scripts/mcp/atomic-edit-mcp-launcher.sh "$@"
