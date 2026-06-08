#!/usr/bin/env bash
set -euo pipefail

CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
BASE_DIR="${KLOEL_CHROME_DEVTOOLS_TMP:-$CODEX_HOME_DIR/tmp/chrome-devtools-mcp}"
HOME_DIR="${KLOEL_CHROME_DEVTOOLS_HOME:-$BASE_DIR/home}"
RUNTIME_DIR="${KLOEL_CHROME_DEVTOOLS_RUNTIME:-$BASE_DIR/runtime}"
DEFAULT_BROWSER_URL="${KLOEL_CHROME_DEVTOOLS_BROWSER_URL:-http://127.0.0.1:9222}"
BROWSER_URL="$DEFAULT_BROWSER_URL"
HAS_TARGET=0

mkdir -p "$BASE_DIR" "$HOME_DIR" "$RUNTIME_DIR"
chmod 700 "$BASE_DIR" "$HOME_DIR" "$RUNTIME_DIR" 2>/dev/null || true

export HOME="$HOME_DIR"
export TMPDIR="$RUNTIME_DIR"
export TMP="$RUNTIME_DIR"
export TEMP="$RUNTIME_DIR"
export XDG_RUNTIME_DIR="$RUNTIME_DIR"

args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  arg="${args[$i]}"
  case "$arg" in
    --browserUrl=*|--browser-url=*)
      BROWSER_URL="${arg#*=}"
      HAS_TARGET=1
      ;;
    --browserUrl|--browser-url)
      if (( i + 1 < ${#args[@]} )); then
        BROWSER_URL="${args[$((i + 1))]}"
      fi
      HAS_TARGET=1
      ;;
    --wsEndpoint=*|--ws-endpoint=*|--wsEndpoint|--ws-endpoint|--autoConnect|--auto-connect|--userDataDir=*|--userDataDir)
      HAS_TARGET=1
      ;;
  esac
done

if (( ! HAS_TARGET )); then
  args=(--browserUrl="$BROWSER_URL" "${args[@]}")
fi

# Do not spawn Chrome from the MCP server process. Codex can launch MCP servers
# inside a restricted host sandbox; child Chrome then fails to create its macOS
# ProcessSingleton socket and the MCP never finishes loading. Keep this launcher
# connect-only so the MCP boots immediately; start debuggable Chrome outside the
# MCP process when a browser target is needed.
exec /opt/homebrew/bin/chrome-devtools-mcp \
  --no-usage-statistics \
  --no-performance-crux \
  "${args[@]}"
