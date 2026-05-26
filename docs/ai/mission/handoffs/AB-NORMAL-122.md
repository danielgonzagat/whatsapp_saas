# AB-NORMAL-122 Handoff

- Worker: OpenCode NORMAL lane
- Status: accepted_functional_baseline_lost_all_material_metrics
- Worktree:
  `/Users/danielpenin/kloel-ab-worktrees/kloel-ab122-normal-20260518085114`
- Branch: `ab/round122-normal-20260518085114`
- Prompt: `docs/ai/atomic-os-benchmark/round-122/opencode-normal-prompt.md`

## Objective

Use factory OpenCode mode, without Atomic OS, to repeat the six-helper
`UnifiedAgentService` split and provide a comparable baseline after the Atomic
preprompt compact-summary update.

## Files Changed

- `backend/src/kloel/unified-agent.service.ts`
- `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- `backend/src/kloel/unified-agent-runtime.helpers.ts`
- `backend/src/kloel/unified-agent-tool-parser.helpers.ts`
- `backend/src/kloel/unified-agent-cognitive-state.helpers.ts`
- `backend/src/kloel/unified-agent-incoming-message.helpers.ts`
- `backend/src/kloel/unified-agent-tool-call-processing.helpers.ts`

## Evidence

- Lane status: `completed`.
- Focused Jest: `13/13`.
- Focused ESLint: `0`.
- Touched Kloel typecheck errors: `0`.
- Diff-check: `0`.
- Protected diff: empty.
- Structural scans: clean.
- Events: `122`.
- Commands: `14`.
- Failed commands: `4`.
- Atomic traces: `0`.
- Input/output/reasoning tokens: `94.838/13.584/13.578`.
- Service/total lines: `434/923`.
- Source churn: `960`.

## Benchmark Wins

- None among material non-tie metrics in Round 122.

## Benchmark Losses / Caveats

- Lost first action, agent time, events, commands, failed commands, input
  tokens, output tokens, reasoning tokens, service lines, total Kloel lines,
  source churn and traceability.
- Used native file tools, as expected for the NORMAL baseline.
- Global backend typecheck remains red outside touched Kloel scope due shared
  non-Kloel Google Ads/Prisma noise.

## Recommendation

Use as the comparable baseline proving the six-helper tier can now be closed.
Escalate one controlled complexity step in Round 123.
