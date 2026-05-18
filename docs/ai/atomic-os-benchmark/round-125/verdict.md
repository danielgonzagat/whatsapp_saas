# Round 125 Verdict

- Status: `normal_functional_baseline_atomic_rejected_for_service_residue`
- Task: repeat the seven-helper tier from Round 124 with a complete compact
  NORMAL baseline, extracting the `predecidedActions.length > 0` branch from
  `UnifiedAgentService.processMessage` into
  `unified-agent-predecided-processing.helpers.ts`.
- Normal worktree:
  `/Users/danielpenin/kloel-ab-worktrees/kloel-ab125-normal-20260518101630`
- Atomic worktree:
  `/Users/danielpenin/kloel-ab-worktrees/kloel-ab125-atomic-20260518101630`

## Acceptance

- NORMAL completed exit `0` and passed the external task gates: focused Jest
  `13/13`, focused ESLint `0`, backend typecheck `0`, diff-check `0`,
  protected diff empty, suppression scan clean, helper `this.` scan clean and
  private/residual service scan clean.
- ATOMIC completed exit `0`, `atomicModeClean=true`, native file tool
  violations `0`, traces `63`, focused Jest `13/13`, focused ESLint `0`,
  backend typecheck `0`, diff-check `0`, protected diff empty and suppression
  scan clean.
- ATOMIC was rejected as task-functional because
  `backend/src/kloel/unified-agent.service.ts` still contained cached
  `toolRouterDeps` facade state at lines `54`, `74`, `249`, `304` and `356`.
- `shapeComparisonEligible=false` because only NORMAL passed the full external
  acceptance contract.

## Scorecard

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Lane status | `completed` | `completed` | tie |
| Task functional pass | `true` | `false` | NORMAL |
| First action | 27.763s | 3.269s | ATOMIC |
| Agent time | 1,228.031s | 227.626s | ATOMIC |
| Events | 160 | 3 | ATOMIC |
| Commands | 13 | 1 | ATOMIC |
| Failed commands | 3 | 0 | ATOMIC |
| Input tokens | 81,394 | 62,593 | ATOMIC |
| Output tokens | 18,914 | 124 | ATOMIC |
| Reasoning tokens | 15,508 | 401 | ATOMIC |
| Focused Jest | 13/13 | 13/13 | tie |
| Focused ESLint | 0 | 0 | tie |
| Backend typecheck | 0 | 0 | tie |
| Service residue scan | clean | `toolRouterDeps` present | NORMAL |
| Service lines | 441 | 383 | not accepted |
| Total touched Kloel lines | 1,075 | 951 | not accepted |
| Source churn | 1,212 | 1,054 | not accepted |
| Atomic traces | 0 | 63 | ATOMIC |

## Decision

Round 125 provides the missing complete NORMAL baseline. NORMAL wins the round
because it is the only lane that passed the full task contract.

The Atomic lane still demonstrates the expected operational margin, but it
overclaimed completion: the preprompt exited `0` because the validator did not
include the `toolRouterDeps`/service-residue invariant as a hard gate.

Do not scale complexity. The Atomic OS must repeat the same seven-helper tier
after tool-policy repair and prove that it rejects or removes service facade
residue while preserving its operational margin.

## Tooling Repair

- `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` now adds focused ESLint
  to `validate_kloel_unified_agent` and injects default hard forbidden-text
  checks for `toolRouterDeps`, `routerDeps`, `get routerDeps`,
  `validateAbiPayload`, `forEachSequential(`, `buildPredecidedActionDraft(` and
  `executePredecidedAgentActions` in `unified-agent.service.ts`.
- Post-fix probe: the repaired validator catches the Round 125 Atomic
  `toolRouterDeps` residue with exit `1`.

## Evidence

- `docs/ai/atomic-os-benchmark/round-125/audit.json`
- `docs/ai/atomic-os-benchmark/round-125/normal-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-125/atomic-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-125/typecheck-normal.log`
- `docs/ai/atomic-os-benchmark/round-125/typecheck-atomic.log`
- `docs/ai/atomic-os-benchmark/round-125/normal-postfix-atomic-validation.log`
- `docs/ai/atomic-os-benchmark/round-125/atomic-postfix-atomic-validation.log`

## Next Action

Round 126 must repeat the same seven-helper task with the repaired validator
synced into the ATOMIC worktree. Scale only after ATOMIC passes the structural
service-residue gate and beats the complete NORMAL baseline with no material
losses.
