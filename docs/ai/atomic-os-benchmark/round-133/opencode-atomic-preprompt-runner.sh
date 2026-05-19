#!/usr/bin/env bash
set -u
: "${ATOMIC_OS_FAST_COMMAND_FILE:?}"
: "${ATOMIC_OS_ROUND_DIR:?}"
lane="${ATOMIC_OS_LANE:-atomic}"
worktree="${ATOMIC_OS_WORKTREE:-$PWD}"
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
output_bytes=$(wc -c < "$output_file" | tr -d " ")
printf 'ATOMIC_PREPROMPT_EXIT=%s\n' "$rc"
printf 'ATOMIC_PREPROMPT_OUTPUT_FILE=%s\n' "$output_file"
printf 'ATOMIC_PREPROMPT_OUTPUT_BYTES=%s\n' "$output_bytes"
if [ "$rc" -eq 0 ]; then
  trace_count=$(find "$worktree/.atomic/traces" -type f -name "*.json" 2>/dev/null | wc -l | tr -d " ")
  printf 'ATOMIC_PREPROMPT_VALIDATION=passed\n'
  printf 'ATOMIC_PREPROMPT_TRACE_COUNT=%s\n' "$trace_count"
  printf 'ATOMIC_PREPROMPT_SUMMARY=success output compacted; full audit remains in output file\n'
else
  printf 'ATOMIC_PREPROMPT_FAILURE_TAIL_BEGIN\n'
  tail -n 120 "$output_file"
  printf 'ATOMIC_PREPROMPT_FAILURE_TAIL_END\n'
fi
exit "$rc"
