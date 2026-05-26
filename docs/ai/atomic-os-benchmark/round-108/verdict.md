# Round 108 Verdict

Status: rejected_both_lanes_atomic_policy_residue

## Task

Scale one controlled step beyond Round 107: split the extracted
`UnifiedAgentService` router/runtime cluster across two helper modules:

- `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- `backend/src/kloel/unified-agent-runtime.helpers.ts`

## Result

Do not scale further. Repeat this same complexity.

- NORMAL reached `idle_timeout`, created helper files, but did not wire the
  service. The original private methods and top-level helpers remained.
- ATOMIC completed the multi-module split and passed focused Jest, but failed
  focused ESLint and touched Kloel typecheck because the runtime helper imported
  unused `ToolArgs`.
- Both lanes are rejected as accepted task outcomes.

## Scorecard

| Metric | NORMAL | ATOMIC | Winner |
| --- | ---: | ---: | --- |
| Lane status | `idle_timeout` | `completed` | ATOMIC |
| Task-functional pass | false | false | tie |
| Focused Jest | 13/13 | 13/13 | tie |
| Focused ESLint | 9 errors | 1 error | ATOMIC |
| Touched Kloel typecheck errors | 0 | 1 | NORMAL |
| Events | 38 | 3 | ATOMIC |
| First action | 28.016s | 5.623s | ATOMIC |
| Agent time | 504.467s | 229.828s | ATOMIC |
| Commands | 0 | 1 | not meaningful |
| Failed commands | 0 | 0 | tie |
| Input tokens | 65,653 | 71,153 | NORMAL |
| Output tokens | 4,436 | 335 | ATOMIC |
| Reasoning tokens | 4,000 | 372 | ATOMIC |
| Native file tool violations | 12 | 0 | ATOMIC |
| Traces | 0 | 45 | ATOMIC |
| Service lines | 737 | 481 | not applicable |
| Runtime helper lines | 33 | 34 | not applicable |
| Router helper lines | 290 | 282 | not applicable |
| Total Kloel lines | 1,060 | 797 | not applicable |
| Source churn | 323 | 640 | not applicable |

## What NORMAL Still Beat

- Touched typecheck errors (`0` vs ATOMIC `1`), but this is not a valid task win
  because NORMAL did not remove private methods or wire the service.
- Input tokens were lower, again without a complete task outcome.

## What ATOMIC Beat

- Completed the lane.
- Preserved atomic-only discipline: zero native file tool violations and 45
  traces.
- Produced the intended two-helper shape structurally.
- Passed focused Jest and all structural scans except lint/typecheck residue.
- Beat NORMAL on convergence, events, first action, total time, output tokens and
  reasoning tokens.

## Rejection Cause

The Atomic runtime helper target header imported `ToolArgs` even though neither
runtime helper uses that type. The resulting unused import caused:

- focused ESLint exit `1`;
- touched Kloel typecheck error count `1`.

This is an operational hardcode/policy issue, not a model reasoning failure in
the main task shape.

## Decision

Reject both lanes. Do not scale complexity.

Round 109 should repeat the exact same multi-module task with one policy fix:
the runtime helper target header must be minimal and must not import `ToolArgs`.
Add an explicit validation check that
`backend/src/kloel/unified-agent-runtime.helpers.ts` does not contain
`ToolArgs`.
