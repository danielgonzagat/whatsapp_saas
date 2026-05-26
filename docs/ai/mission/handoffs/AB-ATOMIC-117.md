# AB-ATOMIC-117 Handoff

- Worker: OpenCode ATOMIC lane
- Status: accepted_atomic_budget_pass_repeat_for_normal_baseline
- Worktree: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab117-atomic-20260518064807`
- Branch: `ab/round117-atomic-20260518064807`
- Prompt: `docs/ai/atomic-os-benchmark/round-117/opencode-atomic-prompt.md`

## Objective

Use Atomic OS only to repeat the four-helper split with compact templates and
shape budget checks active.

## Files Changed

- `backend/src/kloel/unified-agent.service.ts`
- `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- `backend/src/kloel/unified-agent-runtime.helpers.ts`
- `backend/src/kloel/unified-agent-tool-parser.helpers.ts`
- `backend/src/kloel/unified-agent-cognitive-state.helpers.ts`

## Evidence

- Watchdog lane status: `completed`.
- Preprompt exit: `0`.
- Events: `3`.
- Commands: `1`.
- Failed commands: `0`.
- Atomic traces: `46`.
- Focused Jest: `13/13`.
- Focused ESLint: `0`.
- Touched Kloel typecheck errors: `0`.
- Final line budget: `809/817`.
- Final source churn budget: `718/730`.

## Benchmark Wins

- Fixed the Round 116 shape loss.
- Beat the completed NORMAL Round 115 shape baseline on total lines and churn.
- Preserved Atomic-only discipline and traceability.

## Benchmark Losses / Caveats

- No current completed NORMAL lane in this round, so no full A/B shape
  comparison.

## Recommendation

Repeat the same tier in Round 118 with current NORMAL baseline recovery. Do not
scale complexity yet.
