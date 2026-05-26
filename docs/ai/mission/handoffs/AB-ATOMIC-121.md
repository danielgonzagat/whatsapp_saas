# AB-ATOMIC-121 Handoff

- Worker: OpenCode ATOMIC lane
- Status: accepted_strong_atomic_with_input_loss
- Worktree:
  `/Users/danielpenin/kloel-ab-worktrees/kloel-ab121-atomic-20260518082636`
- Branch: `ab/round121-atomic-20260518082636`
- Prompt: `docs/ai/atomic-os-benchmark/round-121/opencode-atomic-prompt.md`

## Objective

Use Atomic OS only to complete the six-helper `UnifiedAgentService` split,
including extraction of the LLM tool-call loop to
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
- Preprompt exit: `0`.
- Focused Jest: `13/13`.
- Focused ESLint: `0`.
- Touched Kloel typecheck errors: `0`.
- Diff-check: `0`.
- Protected diff: empty.
- Structural scans: clean.
- Events: `3`.
- Commands: `1`.
- Failed commands: `0`.
- Native file tool violations: `0`.
- Atomic traces: `56`.
- Input/output/reasoning tokens: `96.974/204/299`.
- Service/total lines: `413/888`.
- Source churn: `899`.

## Benchmark Wins

- Won functionality, first action, agent time, events, commands, failed
  commands, output tokens, reasoning tokens, service lines, total Kloel lines,
  source churn and traceability.
- Preserved Atomic-only discipline.

## Benchmark Losses / Caveats

- Lost input tokens to NORMAL: `96.974` vs `77.601`.
- Root cause: successful `preprompt-shell` returned the full Atomic macro log
  (`136,518` bytes) to the model even though the full log was already persisted
  on disk.
- Global backend typecheck remains red outside touched Kloel scope due shared
  non-Kloel Google Ads/Prisma noise.

## Recommendation

Repeat the same six-helper tier after the watchdog compact-summary update. Do
not scale complexity until Atomic also wins input tokens.
