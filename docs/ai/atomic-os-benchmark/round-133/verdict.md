# Round 133 Verdict - OpenCode Normal vs Atomic

Date: 2026-05-18T15:11:05Z

## Mission

Repeat the Round 132 seven-helper topology-aware unified-agent extraction after
compacting the successful Atomic preprompt output. Same task, isolated
worktrees, two simultaneous OpenCode workers:

- NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab133-normal-20260518114512`
- ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab133-atomic-20260518114512`

## External Gates

Both lanes completed the OpenCode process with exit 0 and passed:

- focused Jest: `src/kloel/unified-agent.service.spec.ts`
- focused ESLint on the 8 touched Kloel files
- backend typecheck
- `git diff --check -- backend/src/kloel`
- protected diff empty
- suppression scan empty

The decisive gate is the topology-aware final validation:

- NORMAL: `final_validation_status=1`
- ATOMIC: `final_validation_status=0`

NORMAL failed the required final topology contract because runtime turn
recording and full incoming orchestration remained in the service/incomplete
helper topology. ATOMIC passed the full required contract.

## Benchmark Metrics

| Metric | NORMAL | ATOMIC | Winner |
| --- | ---: | ---: | --- |
| Final validation | 1 | 0 | ATOMIC |
| Agent time | 1,253,180 ms | 270,649 ms | ATOMIC |
| First action | 18,453 ms | 3,881 ms | ATOMIC |
| Event rows | 153 | 3 | ATOMIC |
| Commands | 13 | 1 | ATOMIC |
| Failed commands | 3 | 0 | ATOMIC |
| Native file tool violations | 47 | 0 | ATOMIC |
| Input tokens | 83,761 | 52,006 | ATOMIC |
| Output tokens | 17,705 | 132 | ATOMIC |
| Reasoning tokens | 17,423 | 115 | ATOMIC |
| Atomic traces | 0 | 76 | ATOMIC |
| Service lines | 304 | 184 | ATOMIC |
| Protected diff | empty | empty | tie |

Raw total lines/churn were not scored as NORMAL wins because shape comparison is
not eligible when NORMAL fails final validation. Its smaller raw product line
count came from not completing the mandatory topology.

## Tooling Update

Round 133 exposed an audit defect: `round-audit.cjs` was not treating
`final_validation_status` as functional authority, so it initially reported
NORMAL as task-functional despite `atomic-call` returning final validation
failure. The auditor was updated so final validation status participates in
`validationPass`.

Validation after the update:

- `node --check docs/ai/atomic-os-benchmark/tools/round-audit.cjs`
- regenerated `docs/ai/atomic-os-benchmark/round-133/audit.json`

## Conclusion

ATOMIC wins Round 133 decisively on the real functional contract and all
material operational metrics. The Round 132 input-token defeat was fixed:
ATOMIC moved from 145,910 input tokens in Round 132 to 52,006 in Round 133 and
now beats NORMAL input tokens by 31,755.

Do not escalate complexity yet. Repeat once more at the same tier after the
auditor fix to prove the result is stable under the corrected scorecard.
