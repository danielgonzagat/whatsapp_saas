#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-status}"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
BASE_DIR="${KLOEL_CHROME_DEVTOOLS_TMP:-$CODEX_HOME_DIR/tmp/chrome-devtools-mcp}"
HOME_DIR="${KLOEL_CHROME_DEVTOOLS_HOME:-$BASE_DIR/home}"
RUNTIME_DIR="${KLOEL_CHROME_DEVTOOLS_RUNTIME:-$BASE_DIR/runtime}"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
CHROME_APP="${CHROME_APP:-/Applications/Google Chrome.app}"
LAUNCH_MODE="${KLOEL_CHROME_DEVTOOLS_LAUNCH_MODE:-auto}"
PORTS=(9222 9223 9333)
if [[ -n "${KLOEL_CHROME_DEVTOOLS_PORTS:-}" ]]; then
  PORTS=()
  for port in ${KLOEL_CHROME_DEVTOOLS_PORTS}; do
    PORTS+=("$port")
  done
fi

mkdir -p "$BASE_DIR" "$HOME_DIR" "$RUNTIME_DIR"
chmod 700 "$BASE_DIR" "$HOME_DIR" "$RUNTIME_DIR" 2>/dev/null || true

export HOME="$HOME_DIR"
export TMPDIR="$RUNTIME_DIR"
export TMP="$RUNTIME_DIR"
export TEMP="$RUNTIME_DIR"
export XDG_RUNTIME_DIR="$RUNTIME_DIR"

pid_file() {
  printf '%s/chrome-cdp-%s.pid' "$BASE_DIR" "$1"
}

profile_dir() {
  printf '%s/cdp-profile-%s' "$BASE_DIR" "$1"
}

log_file() {
  printf '%s/chrome-cdp-%s.log' "$BASE_DIR" "$1"
}

cleanup_profile_singleton() {
  local profile="$1"
  rm -f "$profile/SingletonCookie" "$profile/SingletonLock" "$profile/SingletonSocket"
}

is_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

terminate_pid() {
  local pid="$1"
  local label="$2"
  local attempt
  if ! is_running "$pid"; then
    return 0
  fi
  kill "$pid" 2>/dev/null || true
  for attempt in {1..20}; do
    if ! is_running "$pid"; then
      return 0
    fi
    sleep 0.25
  done
  if is_running "$pid"; then
    kill -9 "$pid" 2>/dev/null || true
    printf 'force-stopped %s pid=%s\n' "$label" "$pid"
  fi
}

pid_for_port() {
  local port="$1"
  if [[ "${KLOEL_CHROME_DEVTOOLS_ALLOW_PS:-1}" != "1" ]]; then
    return 1
  fi
  ps ax -o pid= -o command= 2>/dev/null \
    | awk -v needle="--remote-debugging-port=${port}" '
        index($0, needle) && index($0, "Google Chrome") && !index($0, "Helper") {
          print $1;
          exit;
        }
      ' \
    || true
}

wait_ready() {
  local port="$1"
  local deadline=$((SECONDS + 15))
  while (( SECONDS < deadline )); do
    if curl -fsS "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

launch_chrome() {
  local port="$1"
  local profile="$2"
  local log="$3"
  local pid_path="$4"
  local os_name pid

  os_name="$(uname -s 2>/dev/null || printf unknown)"
  # `open -na "Google Chrome"` can fail under automation or route to an
  # existing user session. Use it only when explicitly requested; the direct
  # binary path is the default because it honors --user-data-dir and binds CDP.
  if [[ "${KLOEL_CHROME_DEVTOOLS_ALLOW_OPEN:-0}" == "1" && "$LAUNCH_MODE" == "open" && "$os_name" == "Darwin" && -d "$CHROME_APP" && -x /usr/bin/open ]]; then
    : >"$log"
    /usr/bin/open -na "$CHROME_APP" --args \
      --remote-debugging-address=127.0.0.1 \
      --remote-debugging-port="$port" \
      --user-data-dir="$profile" \
      --profile-directory=Default \
      --no-first-run \
      --no-default-browser-check \
      about:blank >>"$log" 2>&1 &
    pid="$!"
    sleep 0.5
    pid="$(pid_for_port "$port" || true)"
    printf '%s\n' "$pid" >"$pid_path"
    return 0
  fi

  : >"$log"
  nohup "$CHROME_BIN" \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="$port" \
    --user-data-dir="$profile" \
    --profile-directory=Default \
    --no-first-run \
    --no-default-browser-check \
    --disable-crash-reporter \
    --disable-crashpad \
    --disable-breakpad \
    --disable-dev-shm-usage \
    --headless=new \
    about:blank </dev/null >>"$log" 2>&1 &
  pid="$!"
  printf '%s\n' "$pid" >"$pid_path"
}

start_one() {
  local port="$1"
  local pid_path profile log pid
  pid_path="$(pid_file "$port")"
  profile="$(profile_dir "$port")"
  log="$(log_file "$port")"

  if curl -fsS "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1; then
    pid="$(pid_for_port "$port" || true)"
    [[ -n "$pid" ]] && printf '%s\n' "$pid" >"$pid_path"
    printf 'chrome-devtools CDP %s ready pid=%s\n' "$port" "${pid:-unknown}"
    return 0
  fi

  if [[ -f "$pid_path" ]]; then
    pid="$(cat "$pid_path" 2>/dev/null || true)"
    if is_running "$pid" && curl -fsS "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1; then
      printf 'chrome-devtools CDP %s already running pid=%s\n' "$port" "$pid"
      return 0
    fi
    if is_running "$pid"; then
      terminate_pid "$pid" "stale chrome-devtools CDP ${port}"
    fi
  fi

  pid="$(pid_for_port "$port" || true)"
  if is_running "$pid"; then
    terminate_pid "$pid" "stale chrome-devtools CDP ${port}"
  fi

  mkdir -p "$profile"
  cleanup_profile_singleton "$profile"
  launch_chrome "$port" "$profile" "$log" "$pid_path"
  pid="$(cat "$pid_path" 2>/dev/null || true)"

  if wait_ready "$port"; then
    pid="$(pid_for_port "$port" || true)"
    [[ -n "$pid" ]] && printf '%s\n' "$pid" >"$pid_path"
    printf 'chrome-devtools CDP %s ready pid=%s\n' "$port" "${pid:-unknown}"
  else
    printf 'chrome-devtools CDP %s did not become ready; see %s\n' "$port" "$log" >&2
    return 1
  fi
}

stop_one() {
  local port="$1"
  local pid_path pid
  pid_path="$(pid_file "$port")"
  pid=""
  [[ -f "$pid_path" ]] && pid="$(cat "$pid_path" 2>/dev/null || true)"
  if ! is_running "$pid"; then
    pid="$(pid_for_port "$port" || true)"
  fi
  if is_running "$pid"; then
    terminate_pid "$pid" "chrome-devtools CDP ${port}"
    printf 'stopped chrome-devtools CDP %s pid=%s\n' "$port" "$pid"
  else
    printf 'chrome-devtools CDP %s pid=%s not running\n' "$port" "${pid:-unknown}"
  fi
  rm -f "$pid_path"
}

status_one() {
  local port="$1"
  local pid_path pid
  pid_path="$(pid_file "$port")"
  pid=""
  [[ -f "$pid_path" ]] && pid="$(cat "$pid_path" 2>/dev/null || true)"
  if ! is_running "$pid"; then
    pid="$(pid_for_port "$port" || true)"
  fi
  if curl -fsS "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1; then
    [[ -n "$pid" ]] && printf '%s\n' "$pid" >"$pid_path"
    printf 'chrome-devtools CDP %s running pid=%s\n' "$port" "${pid:-unknown}"
  else
    printf 'chrome-devtools CDP %s stopped\n' "$port"
  fi
}

case "$CMD" in
  start)
    for port in "${PORTS[@]}"; do
      start_one "$port"
    done
    ;;
  stop)
    for port in "${PORTS[@]}"; do
      stop_one "$port"
    done
    ;;
  restart)
    for port in "${PORTS[@]}"; do
      stop_one "$port"
    done
    for port in "${PORTS[@]}"; do
      start_one "$port"
    done
    ;;
  status)
    for port in "${PORTS[@]}"; do
      status_one "$port"
    done
    ;;
  *)
    printf 'usage: %s {start|stop|restart|status}\n' "$0" >&2
    exit 2
    ;;
esac
