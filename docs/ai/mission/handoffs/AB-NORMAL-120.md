# AB-NORMAL-120 Handoff

- Worker: OpenCode NORMAL lane
- Status: accepted_functional_baseline_loss
- Worktree: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab120-normal-20260518080021`
- Branch: `ab/round120-normal-20260518080021`
- Prompt: `docs/ai/atomic-os-benchmark/round-120/opencode-normal-prompt.md`

## Objective

Use factory OpenCode mode, without Atomic OS, to repeat the same five-helper
`UnifiedAgentService` split from Round 119.

## Files Changed

- `backend/src/kloel/unified-agent.service.ts`
- `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- `backend/src/kloel/unified-agent-runtime.helpers.ts`
- `backend/src/kloel/unified-agent-tool-parser.helpers.ts`
- `backend/src/kloel/unified-agent-cognitive-state.helpers.ts`
- `backend/src/kloel/unified-agent-incoming-message.helpers.ts`

## Evidence

- Lane status: `completed`.
- Focused Jest: `13/13`.
- Focused ESLint: `0`.
- Touched Kloel typecheck errors: `0`.
- Diff-check: `0`.
- Protected diff: empty.
- Suppression/helper/private/public/incoming scans: clean.
- Events: `125`.
- Commands: `13`.
- Failed commands: `4`.
- Native writes/edits: allowed by NORMAL baseline.
- Atomic traces: `0`.
- Input/output/reasoning tokens: `82.678/14.699/9.557`.
- Service/total lines: `464/871`.
- Source churn: `820`.

## Benchmark Wins

- No material win against ATOMIC in this round.

## Benchmark Losses / Caveats

- Lost every measured non-tie benchmark: first action, agent time, events,
  commands, failed commands, input/output/reasoning tokens, service lines,
  total touched Kloel lines, source churn and traceability.
- Global backend typecheck remains red outside touched Kloel scope due shared
  pre-existing non-Kloel noise.

## Recommendation

Use this as the completed five-helper NORMAL baseline. Escalate the next round
only one controlled step.
