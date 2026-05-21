#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
export SAAS_COMPILER_ROOT="${REPO_ROOT}"
exec node "${SCRIPT_DIR}/server.mjs" "$@"
