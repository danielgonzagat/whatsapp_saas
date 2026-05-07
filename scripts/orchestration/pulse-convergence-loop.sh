#!/usr/bin/env bash
# Autonomous PULSE convergence loop
#
# Iterates K (kernel enrichment) + E (liquefaction) waves until auditor=0.
#
# - Runs in background via `nohup`. Survives Monitor timeouts.
# - Each iteration: dispatch fleet → wait for all .exit → CEO-commit successful tasks → repeat.
# - K waves run on iterations 1, 3, 5, ... (odd) — adds new kernel primitives.
# - E waves run on iterations 2, 4, 6, ... (even) — liquefies with current kernel.
# - Stops when: auditor=0, OR 50 iterations reached, OR explicit STOP file present.
#
# Usage:
#   nohup bash scripts/orchestration/pulse-convergence-loop.sh > artifacts/pulse-liquefaction/convergence-loop.log 2>&1 &

set -u

REPO=/Users/danielpenin/whatsapp_saas-onda0
ART=$REPO/artifacts/pulse-liquefaction
mkdir -p $ART

cd $REPO || exit 1

run_auditor() {
  ./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e \
    'process.stdout.write(""+require("./scripts/pulse/no-hardcoded-reality-audit").auditPulseNoHardcodedReality(process.cwd()).findings.length)' 2>/dev/null
}

ceo_process_fleet() {
  local fleet_dir="$1"
  local label="$2"
  local commits=0
  local skips=0
  for f in "$fleet_dir"/*.exit; do
    [ -f "$f" ] || continue
    local tid=$(basename "$f" .exit)
    local out=$(tail -200 "$fleet_dir/$tid.out" 2>/dev/null)
    local file=$(echo "$out" | grep -oE '"file":\s*"scripts/pulse/[^"]+"' | head -1 | grep -oE 'scripts/pulse/[^"]+')
    local b=$(echo "$out" | grep -oE '"auditorBefore"[^0-9]*[0-9]+' | grep -oE '[0-9]+$' | head -1)
    local a=$(echo "$out" | grep -oE '"auditorAfter"[^0-9]*[0-9]+' | grep -oE '[0-9]+$' | head -1)
    local smoke=$(echo "$out" | grep -oE '"smokeImport":\s*"[^"]+"' | head -1 | grep -oE '"[^"]+"$' | tr -d '"')
    if [ -n "$file" ] && [ -n "$b" ] && [ -n "$a" ] && [ "$smoke" = "ok" ] && [ "$a" -lt "$b" ]; then
      local d=$((b - a))
      git add "$file" >/dev/null 2>&1
      if git commit -m "refactor(pulse-liquefy): $(basename $file) -$d ($label auto)" >/dev/null 2>&1; then
        commits=$((commits + 1))
        echo "[$(date)] COMMIT $tid -$d" >&2
      fi
    elif [ -n "$file" ] && [ -n "$(git diff --name-only -- $file)" ]; then
      git show HEAD:"$file" > /tmp/p-$$ 2>/dev/null && mv /tmp/p-$$ "$file" 2>/dev/null
      skips=$((skips + 1))
    fi
  done
  echo "[$(date)] $label processed: commits=$commits reverts=$skips" >&2
}

dispatch_fleet_and_wait() {
  local manifest="$1"
  local label="$2"
  local logbase="$ART/$(basename ${manifest%-manifest.json})-fleet"
  local task_count=$(jq '.tasks | length' "$manifest")
  local fleet_dir="$REPO/artifacts/opencode-fleet/$(jq -r '.runId' "$manifest")"

  echo "[$(date)] DISPATCH $label tasks=$task_count manifest=$manifest" >&2
  nohup node scripts/orchestration/opencode-fleet.mjs "$manifest" > "$logbase.log" 2> "$logbase.err" &
  local pid=$!

  # Wait for all .exit files to appear (with safety cap)
  local waited=0
  local max_wait=7200  # 2h max per wave
  while :; do
    local exits=0
    if [ -d "$fleet_dir" ]; then
      exits=$(ls "$fleet_dir"/*.exit 2>/dev/null | wc -l | tr -d ' ')
    fi
    if [ "${exits:-0}" -ge "$task_count" ]; then
      break
    fi
    if [ "$waited" -gt "$max_wait" ]; then
      echo "[$(date)] TIMEOUT $label exits=$exits/$task_count after ${max_wait}s" >&2
      break
    fi
    sleep 60
    waited=$((waited + 60))
  done
  echo "[$(date)] $label DONE waited=${waited}s exits=$exits/$task_count" >&2

  # CEO-process the outputs (commits or reverts)
  ceo_process_fleet "$fleet_dir" "$label"
}

i=1
MAX_ITER=50
START_AUD=$(run_auditor)
echo "[$(date)] LOOP START auditor=$START_AUD" >&2

while [ "$i" -le "$MAX_ITER" ]; do
  if [ -f "$ART/STOP" ]; then
    echo "[$(date)] STOP file detected, exiting" >&2
    break
  fi

  AUD=$(run_auditor)
  echo "[$(date)] ITER=$i auditor=$AUD" >&2
  if [ "${AUD:-1}" = "0" ]; then
    echo "[$(date)] AUDITOR ZERO REACHED — DONE" >&2
    break
  fi

  if [ $((i % 2)) -eq 1 ]; then
    # ODD iteration: K (kernel enrichment)
    LABEL="K-iter$i"
    node scripts/orchestration/pulse-kernel-enrichment-fleet.mjs > /dev/null 2>&1
    if [ -f "$ART/wave-K3-manifest.json" ]; then
      mv "$ART/wave-K3-manifest.json" "$ART/wave-${LABEL}-manifest.json"
      python3 -c "
import json
m=json.load(open('$ART/wave-${LABEL}-manifest.json'))
m['runId']='pulse-loop-${LABEL}-'+__import__('time').strftime('%Y-%m-%dT%H-%M-%S')
m['concurrency']=20
m['tasks']=[{**t,'id':t['id'].replace('k3-','k${i}-')} for t in m['tasks']]
json.dump(m,open('$ART/wave-${LABEL}-manifest.json','w'),indent=2)
" 2>/dev/null
      dispatch_fleet_and_wait "$ART/wave-${LABEL}-manifest.json" "$LABEL"

      # Also commit any kernel additions + kernel re-exports
      cd $REPO
      if [ -n "$(git status --short scripts/pulse/__kernel_additions__/ scripts/pulse/dynamic-reality-kernel.ts 2>/dev/null)" ]; then
        git add scripts/pulse/__kernel_additions__/ scripts/pulse/dynamic-reality-kernel.ts >/dev/null 2>&1
        git commit -m "feat(pulse-kernel): $LABEL +primitives via stage files" >/dev/null 2>&1
        echo "[$(date)] $LABEL kernel committed" >&2
      fi
      # Cleanup any other uncommitted (debris from K subagents)
      for f in $(git diff --name-only scripts/pulse/ 2>/dev/null); do
        git show HEAD:"$f" > /tmp/clean-$$ 2>/dev/null && mv /tmp/clean-$$ "$f" 2>/dev/null
      done
    fi
  else
    # EVEN iteration: E (liquefaction)
    LABEL="E-iter$i"
    node scripts/orchestration/pulse-liquefy-edit-only.mjs --top-n=80 --concurrency=20 > /dev/null 2>&1
    if [ -f "$ART/wave-E-manifest.json" ]; then
      mv "$ART/wave-E-manifest.json" "$ART/wave-${LABEL}-manifest.json"
      python3 -c "
import json
m=json.load(open('$ART/wave-${LABEL}-manifest.json'))
m['runId']='pulse-loop-${LABEL}-'+__import__('time').strftime('%Y-%m-%dT%H-%M-%S')
m['concurrency']=20
m['tasks']=[{**t,'id':t['id'].replace('edit-','editi${i}-')} for t in m['tasks']]
json.dump(m,open('$ART/wave-${LABEL}-manifest.json','w'),indent=2)
" 2>/dev/null
      dispatch_fleet_and_wait "$ART/wave-${LABEL}-manifest.json" "$LABEL"
    fi
  fi

  AUD_AFTER=$(run_auditor)
  echo "[$(date)] ITER=$i COMPLETE auditor_after=$AUD_AFTER" >&2
  i=$((i + 1))
  sleep 30
done

FINAL=$(run_auditor)
echo "[$(date)] LOOP_END iter=$i auditor=$FINAL" >&2
