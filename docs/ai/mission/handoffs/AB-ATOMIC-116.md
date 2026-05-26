# AB-ATOMIC-116 Handoff

- Worker: OpenCode ATOMIC lane
- Status: rejected_shape_budget_loss
- Worktree: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab116-atomic-20260518063955`
- Branch: `ab/round116-atomic-20260518063955`
- Prompt: `docs/ai/atomic-os-benchmark/round-116/opencode-atomic-prompt.md`

## Objective

Use Atomic OS only to repeat the four-helper split with final line/churn budget
checks active.

## Files Changed

- `backend/src/kloel/unified-agent.service.ts`
- `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- `backend/src/kloel/unified-agent-runtime.helpers.ts`
- `backend/src/kloel/unified-agent-tool-parser.helpers.ts`
- `backend/src/kloel/unified-agent-cognitive-state.helpers.ts`

## Evidence

- Watchdog lane status: `completed`.
- Preprompt exit: `1`.
- Atomic traces: `46`.
- Functional validation inside preprompt: focused Jest pass, diff check pass,
  protected diff pass, suppression scan pass, helper `this.` scans pass, public
  API scans pass, cognitive helper export check pass.
- Final budget failed:
  - total touched Kloel lines `823` / budget `817`;
  - source churn `732` / budget `730`.

## Benchmark Wins

- Atomic-only discipline held: no native file tool violations reported by the
  watchdog.
- The new budget gate correctly rejected a functionally green but still too
  large Atomic output.

## Benchmark Losses / Caveats

- Failed the explicit shape budget.
- Cannot be accepted or scaled.

## Recommendation

Repeat the same tier in Round 117 with compact parser/cognitive helper
templates. Keep the same shape budgets and Atomic-only gates.
