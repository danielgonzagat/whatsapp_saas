# AB-NORMAL-118 Handoff

- Worker: OpenCode NORMAL lane
- Status: accepted_functional_baseline_loss
- Worktree: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab118-normal-20260518070102`
- Branch: `ab/round118-normal-20260518070102`
- Prompt: `docs/ai/atomic-os-benchmark/round-118/opencode-normal-prompt.md`

## Objective

Use factory OpenCode mode to repeat the four-helper split of
`UnifiedAgentService` with a compact prompt and a longer idle window.

## Files Changed

- `backend/src/kloel/unified-agent.service.ts`
- `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- `backend/src/kloel/unified-agent-runtime.helpers.ts`
- `backend/src/kloel/unified-agent-tool-parser.helpers.ts`
- `backend/src/kloel/unified-agent-cognitive-state.helpers.ts`

## Evidence

- Lane status: `completed`.
- Focused Jest: `13/13`.
- Focused ESLint: `0`.
- Touched Kloel typecheck errors: `0`.
- Diff-check: `0`.
- Protected diff: empty.
- Suppression/helper/private/public scans: clean.
- Events: `154`.
- Commands: `9`.
- Failed commands: `3`.
- Input/output/reasoning tokens: `98.317/15.017/11.616`.
- Service/total lines: `468/825`.
- Source churn: `746`.
- Atomic traces: `0`.

## Benchmark Wins

- None material. NORMAL completed and is accepted as a valid baseline, but lost
  every measured efficiency, traceability and shape metric to ATOMIC.

## Benchmark Losses / Caveats

- Higher time, events, commands, failed commands, tokens, service lines, total
  Kloel lines and churn.
- No traceability.

## Recommendation

Use this as the completed baseline proving Round 118 is
`shapeComparisonEligible=true`. Escalate only one controlled step.
