# AB-NORMAL-119 Handoff

- Worker: OpenCode NORMAL lane
- Status: accepted_functional_baseline_partial_wins
- Worktree: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab119-normal-20260518073232`
- Branch: `ab/round119-normal-20260518073232`
- Prompt: `docs/ai/atomic-os-benchmark/round-119/opencode-normal-prompt.md`

## Objective

Use factory OpenCode mode, without Atomic OS, to perform the same five-helper
`UnifiedAgentService` split as the ATOMIC lane: router, runtime, parser,
cognitive-state and incoming-message helpers.

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
- Events: `100`.
- Commands: `12`.
- Failed commands: `3`.
- Native writes/edits: allowed by NORMAL baseline.
- Atomic traces: `0`.
- Input/output/reasoning tokens: `79.907/13.142/14.019`.
- Service/total lines: `445/846`.
- Source churn: `799`.

## Benchmark Wins

- Won input tokens by 2,086 tokens against ATOMIC.
- Won total touched Kloel lines by 3 lines against ATOMIC.

## Benchmark Losses / Caveats

- Lost first action, agent time, event rows, commands, failed commands,
  output tokens, reasoning tokens, service facade lines, source churn and
  traceability.
- Global backend typecheck remains red outside touched Kloel scope due shared
  pre-existing non-Kloel noise.

## Recommendation

Keep this as the Round 119 five-helper baseline. Round 120 should repeat the
same complexity after compacting the Atomic incoming-helper/input policy.
