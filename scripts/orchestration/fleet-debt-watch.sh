#!/usr/bin/env bash
# Watches the fleet runDir for new <task-id>.exit files. As each appears,
# runs the no-hardcoded-reality auditor against the onda0 worktree, looks up
# the baseline count for the task's target file, computes delta, emits ONE
# line per new completion. Exits when all 25 .exit files exist.
#
# Output line shape (parseable by the chat as a notification):
#   task=<id> exit=<code> target=<path> baseline=<n> now=<n> delta=<sign-n> report=yes|no specs=passed|failed|skipped
set -uo pipefail

RUN_ID="${1:?need runId}"
RUNDIR="/Users/danielpenin/whatsapp_saas/artifacts/opencode-fleet/${RUN_ID}"
WORKTREE="/Users/danielpenin/whatsapp_saas-onda0"
BASELINE="/Users/danielpenin/whatsapp_saas/artifacts/baseline-debt-2026-05-04T2358.json"
MANIFEST="${RUNDIR}/manifest.json"
TSNODE="${WORKTREE}/backend/node_modules/.bin/ts-node"

[[ -d "$RUNDIR" ]] || { echo "rundir not found: $RUNDIR"; exit 2; }
[[ -f "$MANIFEST" ]] || { echo "manifest not found: $MANIFEST"; exit 2; }

seen=""

measure_file() {
  local target="$1"
  cd "$WORKTREE" >/dev/null || { echo 0; return; }
  "$TSNODE" --project scripts/pulse/tsconfig.json -e "
    import { auditPulseNoHardcodedReality } from './scripts/pulse/no-hardcoded-reality-audit';
    const r = auditPulseNoHardcodedReality(process.cwd());
    let n = 0;
    for (const f of r.findings) if (f.filePath === '${target}') n++;
    console.log(n);
  " 2>/dev/null | tail -1
  cd - >/dev/null || true
}

target_for() {
  local id="$1"
  node -e "
    const m = require('${MANIFEST}');
    const t = m.tasks.find(x => x.id === '${id}');
    if (!t) { console.log('?'); process.exit(0); }
    const p = require('fs').readFileSync(t.promptFile, 'utf8');
    const match = p.match(/- Arquivo: \`(.*?)\`/);
    console.log(match ? match[1] : '?');
  " 2>/dev/null
}

baseline_for() {
  local target="$1"
  node -e "
    const j = require('${BASELINE}');
    const e = j.top30.find(x => x.filePath === '${target}');
    console.log(e ? e.findings : 0);
  " 2>/dev/null
}

while true; do
  any_new=0
  for f in "$RUNDIR"/*.exit; do
    [[ -f "$f" ]] || continue
    bn="$(basename "$f" .exit)"
    case " $seen " in *" $bn "*) continue ;; esac
    seen="$seen $bn"
    any_new=1
    code="$(cat "$f" 2>/dev/null || echo '?')"
    target="$(target_for "$bn")"
    base="$(baseline_for "$target")"
    now="$(measure_file "$target")"
    [[ -z "$now" ]] && now=0
    delta=$(( now - base ))
    sign=""
    [[ "$delta" -lt 0 ]] && sign=""
    [[ "$delta" -gt 0 ]] && sign="+"
    report="no"
    [[ -f "/tmp/fleet-task-${bn}-report.md" ]] && report="yes"
    echo "task=${bn} exit=${code} target=${target} baseline=${base} now=${now} delta=${sign}${delta} report=${report}"
  done
  count="$(ls "$RUNDIR"/*.exit 2>/dev/null | wc -l | tr -d ' ')"
  [[ "$count" -ge 25 ]] && { echo "fleet=DONE total_completed=${count}"; break; }
  [[ "$any_new" -eq 0 ]] && sleep 20 || sleep 5
done
