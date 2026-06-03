# AB-ATOMIC-128

- Status: rejected_ambiguous_expected_count_partial_state
- Worker: OpenCode ATOMIC, atomic-only preprompt fast-path.
- Worktree: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab128-atomic-20260518114443`
- Mission: split `unified-agent.service.ts` into seven helpers using Atomic OS only.

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

- Lane completed and stayed atomic-only: `atomicModeClean=true`, native file tool violations `0`, worktree escapes `0`.
- Preprompt exit `1`; failure occurred at `atomic-inline-deps-helper-param-args.json`.
- MCP error: ambiguous `oldText` had two occurrences; the wrapper had `expectedCount: 2`, but did not expand that into occurrence-specific atomic calls.
- External validation failed: focused Jest `2` failing tests, focused ESLint `1`, backend typecheck `1` with two Kloel errors, service residue scan found `toolRouterDeps`.
- Operational metrics still beat NORMAL: events `3` vs `213`, first action `2.900s` vs `18.289s`, total agent `203.469s` vs `1,501.568s`, commands `1` vs `15`, failed commands `1` vs `5`, traces `62` vs `0`, total Kloel lines `944` vs `994`, source churn `1,047` vs `1,469`.

## Decision

Rejected. Functional acceptance outranks operational speed; partial fast-path state is not accepted.

## Next

Round 129 repeats the same tier with `atomic-call.cjs` expanding `expectedCount` into verified sequential occurrence replacements and `round-audit.cjs` parsing bracket-style external logs.
