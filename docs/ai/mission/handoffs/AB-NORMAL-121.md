# AB-NORMAL-121 Handoff

- Worker: OpenCode NORMAL lane
- Status: accepted_functional_baseline_partial_win
- Worktree:
  `/Users/danielpenin/kloel-ab-worktrees/kloel-ab121-normal-20260518082636`
- Branch: `ab/round121-normal-20260518082636`
- Prompt: `docs/ai/atomic-os-benchmark/round-121/opencode-normal-prompt.md`

## Objective

Use factory OpenCode mode, without Atomic OS, to complete the six-helper
`UnifiedAgentService` split, including extraction of the LLM tool-call loop to
`processUnifiedAgentToolCalls`.

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
- Commands: `12`.
- Failed commands: `4`.
- Atomic traces: `0`.
- Input/output/reasoning tokens: `77.601/15.467/6.749`.
- Service/total lines: `424/922`.
- Source churn: `949`.

## Benchmark Wins

- Won input tokens against Atomic: `77.601` vs `96.974`.

## Benchmark Losses / Caveats

- Lost events, first action, agent time, commands, failed commands, output
  tokens, reasoning tokens, service lines, total Kloel lines, source churn and
  traceability.
- Used native file tools, as expected for the NORMAL baseline.
- Global backend typecheck remains red outside touched Kloel scope due shared
  non-Kloel Google Ads/Prisma noise.

## Recommendation

Use as the comparable six-helper baseline. Do not scale complexity until Atomic
also defeats this lane on input tokens.
