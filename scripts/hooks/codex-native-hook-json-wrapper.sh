#!/usr/bin/env bash
set -u

HOOK_SCRIPT="/opt/homebrew/lib/node_modules/oh-my-codex/dist/scripts/codex-native-hook.js"

fallback_tmp_dir=""
make_temp() {
  local file
  fallback_tmp_dir="${PWD}/.codex-hook-tmp"
  if mkdir -p "$fallback_tmp_dir"; then
    mktemp "$fallback_tmp_dir/tmp.XXXXXX"
    return
  fi

  if file="$(mktemp)"; then
    printf '%s' "$file"
    return 0
  fi

  return 1
}

input_file="$(make_temp)"
stdout_file="$(make_temp)"
stderr_file="$(make_temp)"
trap 'rm -f "$input_file" "$stdout_file" "$stderr_file"; if [ -n "${fallback_tmp_dir:-}" ]; then rmdir "$fallback_tmp_dir" 2>/dev/null || true; fi' EXIT

cat >"$input_file"

event_name="$(
  node -e 'const fs=require("fs"); try { const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")||"{}"); process.stdout.write(String(p.hook_event_name||p.hookEventName||p.event||p.name||"Unknown")); } catch { process.stdout.write("Unknown"); }' "$input_file"
)"

# Codex PreToolUse receives the Bash command before the shell expands inline
# environment prefixes. Mirror the documented escape hatch into the hook env.
tool_command="$(
  node -e 'const fs=require("fs"); try { const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")||"{}"); const input=p.tool_input||p.toolInput||{}; process.stdout.write(String(input.command||input.cmd||p.command||p.cmd||"").trimStart()); } catch { process.stdout.write(""); }' "$input_file"
)"
case "$tool_command" in
  ATOMIC_EXEC_MANDATORY=0*|env\ ATOMIC_EXEC_MANDATORY=0*)
    export ATOMIC_EXEC_MANDATORY=0
    ;;
  *)
    if grep -q 'ATOMIC_EXEC_MANDATORY=0' "$input_file"; then
      export ATOMIC_EXEC_MANDATORY=0
    fi
    ;;
esac

node "$HOOK_SCRIPT" <"$input_file" >"$stdout_file" 2>"$stderr_file"
status=$?

stdout_text="$(cat "$stdout_file")"
stderr_text="$(cat "$stderr_file")"

if [ -n "$stderr_text" ]; then
  printf '%s\n' "$stderr_text" >&2
fi

if [ -z "$stdout_text" ]; then
  if [ "$status" -eq 0 ]; then
    printf '{}\n'
    exit 0
  fi
  node -e 'const eventName=process.argv[1]||"Unknown"; const detail=process.argv[2]||"native hook failed without stdout"; console.log(JSON.stringify({decision:"block",reason:"OMX native hook failed before emitting valid JSON.",hookSpecificOutput:{hookEventName:eventName,additionalContext:detail}}));' "$event_name" "$stderr_text"
  exit 0
fi

if node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' <<<"$stdout_text" >/dev/null 2>&1; then
  printf '%s\n' "$stdout_text"
  exit 0
fi

node -e 'const eventName=process.argv[1]||"Unknown"; const detail=process.argv[2]||"native hook emitted invalid JSON"; console.log(JSON.stringify({decision:"block",reason:"OMX native hook emitted invalid JSON.",hookSpecificOutput:{hookEventName:eventName,additionalContext:detail}}));' "$event_name" "$stdout_text"
