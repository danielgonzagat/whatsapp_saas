#!/usr/bin/env bash
set -u
: "${ATOMIC_OS_FAST_COMMAND_FILE:?}"
: "${ATOMIC_OS_ROUND_DIR:?}"
lane="${ATOMIC_OS_LANE:-atomic}"
start_file="$ATOMIC_OS_ROUND_DIR/opencode-${lane}-preprompt-start-ms.txt"
end_file="$ATOMIC_OS_ROUND_DIR/opencode-${lane}-preprompt-end-ms.txt"
exit_file="$ATOMIC_OS_ROUND_DIR/opencode-${lane}-preprompt-exit.txt"
output_file="$ATOMIC_OS_ROUND_DIR/opencode-${lane}-preprompt-output.log"
timestamp_ms() { node -e 'process.stdout.write(String(Date.now()))'; }
timestamp_ms > "$start_file"
command_text="$(cat "$ATOMIC_OS_FAST_COMMAND_FILE")"
bash -lc "$command_text" > "$output_file" 2>&1
rc=$?
timestamp_ms > "$end_file"
printf '%s\n' "$rc" > "$exit_file"
printf 'ATOMIC_PREPROMPT_EXIT=%s\n' "$rc"
cat "$output_file"
exit "$rc"
