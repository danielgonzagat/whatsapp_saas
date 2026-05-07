#!/usr/bin/env bash
# Watches the PoC subagent. When .exit appears, measures dod-engine.ts findings
# AND the global total. Emits one summary line.
set -uo pipefail

RUN_ID="${1:?need runId}"
RUNDIR="/Users/danielpenin/whatsapp_saas/artifacts/opencode-fleet/${RUN_ID}"
WORKTREE="/Users/danielpenin/whatsapp_saas-onda0"
TSNODE="${WORKTREE}/backend/node_modules/.bin/ts-node"
TASK_ID="poc-dod-engine"

[[ -d "$RUNDIR" ]] || { echo "rundir not found: $RUNDIR"; exit 2; }

echo "watching=${RUN_ID}/${TASK_ID}.exit"
while [[ ! -f "$RUNDIR/${TASK_ID}.exit" ]]; do
  sleep 30
  alive="$(pgrep -f "opencode.*deepseek" | wc -l | tr -d ' ')"
  err_lines="$(wc -l < "$RUNDIR/${TASK_ID}.err" 2>/dev/null || echo 0)"
  echo "heartbeat alive=${alive} err_lines=${err_lines}"
done

EXIT_CODE="$(cat "$RUNDIR/${TASK_ID}.exit")"
echo "subagent_exit=${EXIT_CODE}"

cd "$WORKTREE" >/dev/null
"$TSNODE" --project scripts/pulse/tsconfig.json -e "
  import { auditPulseNoHardcodedReality } from './scripts/pulse/no-hardcoded-reality-audit';
  const r = auditPulseNoHardcodedReality(process.cwd());
  let dod = 0;
  const kinds: Record<string, number> = {};
  for (const f of r.findings) {
    if (f.filePath === 'scripts/pulse/dod-engine.ts') {
      dod++;
      kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    }
  }
  console.log('global_total=' + r.summary.totalFindings);
  console.log('dod_engine_findings=' + dod);
  console.log('dod_engine_byKind=' + JSON.stringify(kinds));
  console.log('dod_zeroed=' + (dod === 0));
  console.log('global_under_lockedFloor=' + (r.summary.totalFindings < 138905));
" 2>&1
cd - >/dev/null
echo "report=/tmp/fleet-task-${TASK_ID}-report.md"
[[ -f "/tmp/fleet-task-${TASK_ID}-report.md" ]] && echo "report_exists=true" || echo "report_exists=false"
