# AB-NORMAL-123 Handoff

- Worker: OpenCode NORMAL lane
- Status: `accepted_functional_baseline_lost_all_material_metrics`
- Worktree:
  `/Users/danielpenin/kloel-ab-worktrees/kloel-ab123-normal-20260518091851`
- Branch: `ab/round123-normal-20260518091851`
- Prompt: `docs/ai/atomic-os-benchmark/round-123/opencode-normal-prompt.md`

## Objective

Use factory OpenCode mode, without Atomic OS, to perform the seven-helper
`UnifiedAgentService` split and provide a comparable baseline for the
predecided-processing extraction tier.

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
- Touched Kloel typecheck errors: `0`.
- Diff-check: `0`.
- Protected diff: empty.
- Structural scans: clean, including predecided-processing scan.
- Events: `101`.
- Commands: `12`.
- Failed commands: `4`.
- Atomic traces: `0`.
- Input/output/reasoning tokens: `101.442/14.802/17.431`.
- Service/total lines: `410/1.007`.
- Source churn: `1.108`.

## Benchmark Wins

- None among material non-tie metrics in Round 123.

## Benchmark Losses / Caveats

- Lost first action, agent time, events, commands, failed commands, input
  tokens, output tokens, reasoning tokens, service lines, total Kloel lines,
  source churn and traceability.
- Used native file tools, as expected for the NORMAL baseline.
- Global backend typecheck remains red outside touched Kloel scope due shared
  non-Kloel Google Ads/Prisma noise.

## Recommendation

Use as the comparable baseline for the seven-helper tier. Do not scale beyond
this tier until Atomic repeats with clean preprompt exit.
