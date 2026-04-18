#!/usr/bin/env bash
#
# Launch the official @stripe/mcp server with credentials sourced from
# .env.pulse.local. Invoked by the "stripe" entry in .mcp.json.
#
# Why a launcher and not inline env in .mcp.json:
#   - .mcp.json is committed. Inlining tokens would leak them.
#   - Not every shell session exports STRIPE_SECRET_KEY, so we cannot rely
#     on the parent env being populated.
#   - .env.pulse.local is gitignored (pattern .env*.local) and documented in
#     CLAUDE.md as the local-only secrets file for PULSE tooling.
#
# Scope:
#   - Operates on the platform account itself (no --stripe-account flag).
#   - Test mode is enforced by using an sk_test_ / rk_test_ key; refuse
#     anything that does not start with one of those prefixes so a live
#     key cannot leak in by accident.
#
# Contract: this script must never print token values. If STRIPE_SECRET_KEY
# is missing or obviously wrong it fails loudly so the MCP client can
# surface the problem.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)"
ENV_FILE="${REPO_ROOT}/.env.pulse.local"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

# Trim surrounding whitespace/newlines — copy-paste from dashboards often
# introduces a stray \n or trailing space which makes the key "look right"
# but fails auth in confusing ways.
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY#"${STRIPE_SECRET_KEY%%[![:space:]]*}"}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY%"${STRIPE_SECRET_KEY##*[![:space:]]}"}"

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  echo "[stripe-mcp-launcher] STRIPE_SECRET_KEY is not set." >&2
  echo "[stripe-mcp-launcher] Expected it in ${ENV_FILE} or the parent shell." >&2
  exit 1
fi

case "${STRIPE_SECRET_KEY}" in
  sk_test_*|rk_test_*)
    ;;
  sk_live_*|rk_live_*)
    echo "[stripe-mcp-launcher] Refusing to start: STRIPE_SECRET_KEY is a LIVE key." >&2
    echo "[stripe-mcp-launcher] This launcher is test-mode only. Use an sk_test_/rk_test_ key." >&2
    exit 2
    ;;
  *)
    echo "[stripe-mcp-launcher] STRIPE_SECRET_KEY has an unexpected prefix." >&2
    echo "[stripe-mcp-launcher] Expected sk_test_... or rk_test_..." >&2
    exit 3
    ;;
esac

if ! command -v npx >/dev/null 2>&1; then
  echo "[stripe-mcp-launcher] 'npx' not found on PATH. Install Node.js >= 18." >&2
  exit 4
fi

# Pin the MCP package version so a silent upstream release cannot change
# tool shapes or argument parsing between sessions. Bump deliberately after
# reviewing release notes for @stripe/mcp.
STRIPE_MCP_VERSION="${STRIPE_MCP_VERSION:-0.3.3}"

# Note: the legacy --tools=all flag was removed from @stripe/mcp. Tool
# permissions now derive from the API key itself (sk_* = full, rk_* =
# whatever scopes the restricted key was created with).
STRIPE_ACCOUNT_ID="${STRIPE_ACCOUNT_ID:-${STRIPE_MCP_STRIPE_ACCOUNT:-}}"
STRIPE_ACCOUNT_ID="${STRIPE_ACCOUNT_ID#"${STRIPE_ACCOUNT_ID%%[![:space:]]*}"}"
STRIPE_ACCOUNT_ID="${STRIPE_ACCOUNT_ID%"${STRIPE_ACCOUNT_ID##*[![:space:]]}"}"

STRIPE_MCP_ARGS=()

if [[ -n "${STRIPE_ACCOUNT_ID}" ]]; then
  case "${STRIPE_ACCOUNT_ID}" in
    acct_*)
      STRIPE_MCP_ARGS+=("--stripe-account=${STRIPE_ACCOUNT_ID}")
      ;;
    *)
      echo "[stripe-mcp-launcher] STRIPE_ACCOUNT_ID has an unexpected format." >&2
      echo "[stripe-mcp-launcher] Expected acct_... when targeting a connected account." >&2
      exit 5
      ;;
  esac
fi

if (( ${#STRIPE_MCP_ARGS[@]} > 0 )); then
  exec npx -y "@stripe/mcp@${STRIPE_MCP_VERSION}" \
    --api-key="${STRIPE_SECRET_KEY}" \
    "${STRIPE_MCP_ARGS[@]}" \
    "$@"
fi

exec npx -y "@stripe/mcp@${STRIPE_MCP_VERSION}" --api-key="${STRIPE_SECRET_KEY}" "$@"
