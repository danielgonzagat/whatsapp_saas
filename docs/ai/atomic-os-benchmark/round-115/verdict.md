# Round 115 Verdict

Status: `accepted_atomic_comparable_win_repeat_same_complexity`

## Task

Repeat the four-helper split of `UnifiedAgentService`: router, runtime,
parser, and cognitive-state helpers. This round increased only the watchdog
ceiling to obtain a completed NORMAL baseline; Atomic gates stayed unchanged.

## Result

- NORMAL: `completed`, focused Jest `13/13`, focused ESLint `0`, touched Kloel
  typecheck errors `0`, structural scans clean, protected diff empty.
- ATOMIC: `completed`, preprompt exit `0`, focused Jest `13/13`, focused
  ESLint `0`, touched Kloel typecheck errors `0`, structural scans clean,
  protected diff empty, `atomicModeClean=true`, and 45 isolated traces.
- Global backend typecheck remained red in both lanes only due pre-existing
  non-Kloel noise; touched Kloel typecheck errors were `0` in both logs.

## Scorecard

| Metric | NORMAL | ATOMIC | Winner |
| --- | ---: | ---: | --- |
| Lane status | `completed` | `completed` | tie |
| First action | 19.564s | 5.376s | ATOMIC |
| Agent time | 1,130.540s | 215.375s | ATOMIC |
| Events | 171 | 3 | ATOMIC |
| Commands | 22 | 1 | ATOMIC |
| Failed commands | 4 | 0 | ATOMIC |
| Input tokens | 81.226 | 73.695 | ATOMIC |
| Output tokens | 16.947 | 168 | ATOMIC |
| Reasoning tokens | 11.380 | 1.188 | ATOMIC |
| Native file tool violations | allowed | 0 | ATOMIC |
| Traces | 0 | 45 | ATOMIC |
| Focused Jest | 13/13 | 13/13 | tie |
| Focused ESLint | pass | pass | tie |
| Service lines | 460 | 456 | ATOMIC |
| Total touched Kloel lines | 817 | 831 | NORMAL |
| Source churn | 730 | 740 | NORMAL |

## What NORMAL Beat

- Lower total touched Kloel line count: `817` vs ATOMIC `831`.
- Lower source churn: `730` vs ATOMIC `740`.
- These are accepted as real shape losses for ATOMIC because this round is
  finally `shapeComparisonEligible=true`.

## What ATOMIC Beat

- Same functional gates with much lower operational surface.
- First action improved by 72.52%.
- Agent time improved by 80.95%.
- Event rows improved by 98.25%.
- Completed commands improved by 95.45%.
- Failed commands improved by 100%.
- Output tokens improved by 99.01%; reasoning tokens by 89.56%; input tokens
  by 9.27%.
- Service facade was 4 lines smaller while preserving public API.
- Produced 45 traces with zero native file-tool violation in the ATOMIC lane.

## Atomic OS Update

- `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` gained synthetic
  `lineBudgetChecks` and `sourceChurnBudgetChecks` in the validation profile.
  This converts the Round 115 shape losses into enforceable macro-operator
  feedback for the next run.

## Decision

Accept Round 115 as a comparable ATOMIC operational win, but do not scale
complexity yet. Because NORMAL beat ATOMIC in total touched Kloel lines and
source churn, Round 116 must repeat the same four-helper tier with shape budget
checks active and no relaxation of Atomic-only gates.
