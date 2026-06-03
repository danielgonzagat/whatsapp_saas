# AB-NORMAL-125 Handoff

- Worker: OpenCode NORMAL lane
- Status: `accepted_functional_baseline_atomic_wins_cost_only`
- Worktree:
  `/Users/danielpenin/kloel-ab-worktrees/kloel-ab125-normal-20260518101630`
- Branch: `ab/round125-normal-20260518101630`
- Prompt: `docs/ai/atomic-os-benchmark/round-125/opencode-normal-prompt.md`

## Objective

Use factory OpenCode mode, without Atomic OS, to repeat the seven-helper
`UnifiedAgentService` split and provide a complete comparable baseline after
Round 124 NORMAL timed out.

## Files Changed

- `backend/src/kloel/unified-agent.service.ts`
- `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- `backend/src/kloel/unified-agent-runtime.helpers.ts`
- `backend/src/kloel/unified-agent-tool-parser.helpers.ts`
- `backend/src/kloel/unified-agent-cognitive-state.helpers.ts`
- `backend/src/kloel/unified-agent-incoming-message.helpers.ts`
- `backend/src/kloel/unified-agent-tool-call-processing.helpers.ts`
- `backend/src/kloel/unified-agent-predecided-processing.helpers.ts`

## Evidence

- Lane status: `completed`.
- Focused Jest: `13/13`.
- Focused ESLint: `0`.
- Backend typecheck: `0`.
- Diff-check: `0`.
- Protected diff: empty.
- Suppression scan: clean.
- Helper `this.` scan: clean.
- Private/residual service scan: clean.
- Events: `160`.
- Commands: `13`.
- Failed commands: `3`.
- Atomic traces: `0`.
- Input/output/reasoning tokens: `81.394/18.914/15.508`.
- Service/total lines: `441/1.075`.
- Source churn: `1.212`.

## Benchmark Wins

- Won task-functional pass because the ATOMIC lane left `toolRouterDeps`
  residue in `unified-agent.service.ts`.

## Benchmark Losses / Caveats

- Lost first action, agent time, events, commands, failed commands, input
  tokens, output tokens, reasoning tokens, traceability, service lines, total
  touched Kloel lines and source churn.

## Recommendation

Use this as the complete NORMAL baseline for Round 126. Do not scale
complexity until ATOMIC passes the same service-residue gate with no material
losses.
