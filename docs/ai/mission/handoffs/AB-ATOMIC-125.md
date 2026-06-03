# AB-ATOMIC-125 Handoff

- Worker: OpenCode ATOMIC lane
- Status: `rejected_service_residue_validator_gap`
- Worktree:
  `/Users/danielpenin/kloel-ab-worktrees/kloel-ab125-atomic-20260518101630`
- Branch: `ab/round125-atomic-20260518101630`
- Prompt: `docs/ai/atomic-os-benchmark/round-125/opencode-atomic-prompt.md`

## Objective

Use Atomic OS only to repeat the seven-helper `UnifiedAgentService` split
against a complete compact NORMAL baseline.

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
- Preprompt exit: `0`.
- Focused Jest: `13/13`.
- Focused ESLint: `0`.
- Backend typecheck: `0`.
- Diff-check: `0`.
- Protected diff: empty.
- Suppression scan: clean.
- Helper `this.` scan: clean.
- Native file tool violations: `0`.
- Atomic traces: `63`.
- Events: `3`.
- Commands: `1`.
- Failed commands: `0`.
- Input/output/reasoning tokens: `62.593/124/401`.
- Service/total lines: `383/951`.
- Source churn: `1.054`.
- Rejection evidence: `toolRouterDeps` remained in
  `unified-agent.service.ts` at lines `54`, `74`, `249`, `304` and `356`.

## Benchmark Wins

- Won first action, agent time, events, commands, failed commands, input
  tokens, output tokens, reasoning tokens, traceability, service lines, total
  touched Kloel lines and source churn.

## Benchmark Losses / Caveats

- Lost the round because the task contract required eliminating cached service
  facade dependency residue; the validator did not enforce that invariant
  before claiming preprompt success.

## Recommendation

Repeat the same seven-helper tier in Round 126 after syncing the repaired
`validate_kloel_unified_agent` gate. The next ATOMIC lane must fail fast or
remove `toolRouterDeps` instead of reporting success with residue.
