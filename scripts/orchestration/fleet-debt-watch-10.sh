#!/usr/bin/env bash
# Watches a single-task fleet (10-files-in-1) for completion.
# When .exit appears, measures each of the 10 target files via the auditor
# and emits one line per file: file=<path> baseline=<n> now=<n> delta=<sign-n> zeroed=<true|false>
# Then emits a summary line: fleet=DONE total_baseline=<n> total_final=<n> total_delta=<n> zeroed=<n>/10
set -uo pipefail

RUN_ID="${1:?need runId}"
RUNDIR="/Users/danielpenin/whatsapp_saas/artifacts/opencode-fleet/${RUN_ID}"
WORKTREE="/Users/danielpenin/whatsapp_saas-onda0"
TOP10="/tmp/baseline-top10.json"
TSNODE="${WORKTREE}/backend/node_modules/.bin/ts-node"

[[ -d "$RUNDIR" ]] || { echo "rundir not found: $RUNDIR"; exit 2; }
[[ -f "$TOP10" ]] || { echo "top10 baseline not found: $TOP10"; exit 2; }

# Wait for the .exit file
echo "watching=${RUN_ID}/t1-zero-10.exit"
while [[ ! -f "$RUNDIR/t1-zero-10.exit" ]]; do
  sleep 30
  alive="$(pgrep -f "opencode.*run" | wc -l | tr -d ' ')"
  prompt_lines="$(wc -l < "$RUNDIR/t1-zero-10.err" 2>/dev/null || echo 0)"
  echo "heartbeat alive=${alive} err_lines=${prompt_lines}"
done

EXIT_CODE="$(cat "$RUNDIR/t1-zero-10.exit")"
echo "subagent_exit=${EXIT_CODE}"

# Single auditor run, then read counts for the 10 files
cd "$WORKTREE" >/dev/null
"$TSNODE" --project scripts/pulse/tsconfig.json -e "
  import { auditPulseNoHardcodedReality } from './scripts/pulse/no-hardcoded-reality-audit';
  import { readFileSync } from 'fs';
  const r = auditPulseNoHardcodedReality(process.cwd());
  const map = new Map<string, number>();
  for (const f of r.findings) map.set(f.filePath, (map.get(f.filePath) || 0) + 1);
  const top10 = JSON.parse(readFileSync('${TOP10}', 'utf8')).top10ByTotal;
  let totalBaseline = 0, totalFinal = 0, zeroed = 0;
  for (const t of top10) {
    const now = map.get(t.filePath) || 0;
    const delta = now - t.total;
    totalBaseline += t.total;
    totalFinal += now;
    if (now === 0) zeroed++;
    const sign = delta < 0 ? '' : delta > 0 ? '+' : '';
    console.log('file=' + t.filePath + ' baseline=' + t.total + ' now=' + now + ' delta=' + sign + delta + ' zeroed=' + (now === 0));
  }
  const sumDelta = totalFinal - totalBaseline;
  const sumSign = sumDelta < 0 ? '' : sumDelta > 0 ? '+' : '';
  console.log('global_total_findings=' + r.summary.totalFindings);
  console.log('fleet=DONE total_baseline=' + totalBaseline + ' total_final=' + totalFinal + ' total_delta=' + sumSign + sumDelta + ' zeroed=' + zeroed + '/10');
" 2>&1
cd - >/dev/null
