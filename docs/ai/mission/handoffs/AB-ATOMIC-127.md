# AB-ATOMIC-127

- Status: rejected_residual_cached_deps_state
- Worker: OpenCode ATOMIC, atomic-only preprompt fast-path.
- Worktree: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab127-atomic-20260518081855`
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

- Lane completed, but preprompt final validation exited `1`.
- External validation passed focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`, diff-check `0`, protected diff empty, suppression scan empty, helper `this.` scan empty.
- Rejection scan found `toolRouterDeps` in the service at property, constructor assignment, two helper parameter handoffs, and direct `executeToolAction` delegation.
- Operational metrics still beat NORMAL: events `3` vs `136`, first action `3.289s` vs `19.130s`, total agent `243.898s` vs `1,286.559s`, commands `1` vs `11`, traces `63` vs `0`, service lines `383` vs `403`.

## Decision

Rejected. Functional acceptance outranks operational speed; cached service dependency state violates the final residue contract.

## Next

Round 128 repeats the same tier with inline `executeToolActionDeps` and removal of `toolRouterDeps` before final validation.
