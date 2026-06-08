#!/usr/bin/env bash
set -euo pipefail

CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
BASE_DIR="${KLOEL_CHROME_DEVTOOLS_TMP:-$CODEX_HOME_DIR/tmp/chrome-devtools-mcp}"
HOME_DIR="${KLOEL_CHROME_DEVTOOLS_HOME:-$BASE_DIR/home}"
RUNTIME_DIR="${KLOEL_CHROME_DEVTOOLS_RUNTIME:-$BASE_DIR/runtime}"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
DEFAULT_BROWSER_URL="${KLOEL_CHROME_DEVTOOLS_BROWSER_URL:-http://127.0.0.1:9222}"
BROWSER_URL="$DEFAULT_BROWSER_URL"
TARGET_MODE="browser-url"
HAS_TARGET=0
PASSTHROUGH_ONLY=0

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
    --help|--version)
      PASSTHROUGH_ONLY=1
      ;;
    --browserUrl=*|--browser-url=*)
      BROWSER_URL="${arg#*=}"
      HAS_TARGET=1
      TARGET_MODE="browser-url"
      ;;
    --browserUrl|--browser-url)
      if (( i + 1 < ${#args[@]} )); then
        BROWSER_URL="${args[$((i + 1))]}"
      fi
      HAS_TARGET=1
      TARGET_MODE="browser-url"
      ;;
    --wsEndpoint=*|--ws-endpoint=*|--wsEndpoint|--ws-endpoint|--autoConnect|--auto-connect|--userDataDir=*|--user-data-dir=*|--userDataDir|--user-data-dir)
      HAS_TARGET=1
      TARGET_MODE="external"
      ;;
  esac
done

if (( PASSTHROUGH_ONLY )); then
  exec /opt/homebrew/bin/chrome-devtools-mcp \
    --no-usage-statistics \
    --no-performance-crux \
    "${args[@]}"
fi

if (( ! HAS_TARGET )); then
  args=(--browserUrl="$BROWSER_URL" "${args[@]}")
  HAS_TARGET=1
  TARGET_MODE="browser-url"
fi

port_from_url() {
  printf '%s' "$1" | sed -E 's#^https?://[^:/]+:([0-9]+).*#\1#'
}

is_ready() {
  /usr/bin/curl -fsS "$BROWSER_URL/json/version" >/dev/null 2>&1
}

start_cdp_browser() {
  local port profile log pid_path pid
  port="$(port_from_url "$BROWSER_URL")"
  case "$port" in
    ''|*[!0-9]*)
      printf 'Could not parse Chrome DevTools port from %s\n' "$BROWSER_URL" >&2
      return 2
      ;;
  esac

  profile="$BASE_DIR/cdp-profile-$port"
  log="$BASE_DIR/chrome-cdp-$port.log"
  pid_path="$BASE_DIR/chrome-cdp-$port.pid"
  mkdir -p "$profile"

  if [[ -f "$pid_path" ]]; then
    pid="$(cat "$pid_path" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && is_ready; then
      return 0
    fi
    rm -f "$pid_path"
  fi

  if is_ready; then
    return 0
  fi

  "$CHROME_BIN" \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="$port" \
    --user-data-dir="$profile" \
    --no-first-run \
    --no-default-browser-check \
    --disable-crash-reporter \
    --disable-crashpad \
    --disable-breakpad \
    --disable-dev-shm-usage \
    --headless=new \
    about:blank >"$log" 2>&1 &
  pid="$!"
  printf '%s\n' "$pid" >"$pid_path"

  for _ in {1..80}; do
    is_ready && return 0
    sleep 0.25
  done

  printf 'Chrome DevTools endpoint did not become ready at %s; see %s\n' "$BROWSER_URL" "$log" >&2
  return 1
}

if [[ "$TARGET_MODE" == "browser-url" ]]; then
  start_cdp_browser || true
fi

exec /opt/homebrew/bin/chrome-devtools-mcp \
  --no-usage-statistics \
  --no-performance-crux \
  "${args[@]}"
