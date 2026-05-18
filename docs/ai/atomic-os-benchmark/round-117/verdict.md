# Round 117 Verdict

Status: `accepted_atomic_budget_pass_repeat_for_normal_baseline`

## Task

Repeat the four-helper split of `UnifiedAgentService` with compact Atomic
parser/cognitive templates and the same shape budgets from the completed
NORMAL Round 115 baseline.

## Result

- NORMAL: `idle_timeout`, no target mutation, no completed baseline.
- ATOMIC: `completed`, preprompt exit `0`, final shape budget passed,
  external focused gates passed.
- `shapeComparisonEligible=false` because NORMAL did not complete.

## Atomic Evidence

- Focused Jest: `13/13`.
- Focused ESLint: `0`.
- Touched Kloel typecheck errors: `0`.
- Protected diff: empty.
- Suppression scan: clean.
- Helper `this.` scan: clean.
- Private-method scan: clean.
- Top-level scan: clean.
- Public API scan: `executeTool` and `buildQuotedReplyPlan` preserved.
- Atomic traces: `46`.
- `atomicModeClean=true`.

## Budget Result

- Total touched Kloel lines: `809`, budget `817`.
- Source churn: `718`, budget `730`.
- This fixed the Round 116 budget failure (`823/817`, `732/730`).

## What NORMAL Beat

- No accepted win in this round because NORMAL did not mutate the target before
  `idle_timeout`.

## What ATOMIC Beat

- Proved the Atomic compact templates can beat the completed NORMAL Round 115
  shape baseline while keeping functional gates green.
- Agent time from event span: `198.368s`.
- Events: `3`.
- Commands: `1`.
- Failed commands: `0`.
- Input/output/reasoning: `75.205/201/600`.

## Atomic OS Update

- Compact parser template now preserves original JSON parse behavior with less
  surface.
- Compact cognitive-state template keeps fallback semantics while reducing
  helper size.
- Router helper kept the `AgentToolEnvelope` alias compaction from Round 116.

## Decision

Accept as an Atomic functional/shape-budget recovery, but do not scale
complexity. Round 118 must repeat the same four-helper tier with a shorter
NORMAL prompt and longer idle window to obtain a current completed NORMAL
baseline.
