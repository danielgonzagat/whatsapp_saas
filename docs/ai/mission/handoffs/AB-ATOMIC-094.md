# AB-ATOMIC-094 Handoff

- Status: rejected_atomic_policy_escape_failure
- Mode: OpenCode ATOMIC lane
- Worktree: `/private/tmp/kloel-ab094-atomic-20260517192409`
- Prompt received: repeat Round 093 router-cluster extraction using Atomic OS
  preprompt macro with compact final shape and type-only helper import.

## Files Read / Changed

- Partially changed:
  - `backend/src/kloel/unified-agent.service.ts`
  - `backend/src/kloel/unified-agent-tool-router.helpers.ts`
  - `.atomic/traces/**`
- No protected diff.

## Evidence

- OpenCode lane status: `completed`, but Atomic preprompt exit was `1`.
- The atomic guard rejected a syntax-breaking replacement before writing it:
  invalid escaped multiline text in the callsite replacement.
- Jest focused: failed `12/13`.
- Lint focused: failed.
- `typecheckKloelErrors=4`.
- Private router methods remained in the service.
- Metrics: events `3`, commands `1`, failed commands `1`, input/output/
  reasoning `52,012/126/281`, service/helper/total lines `738/240/978`,
  traces `6`.

## What Worked

- Atomic-only discipline stayed clean.
- Pre-write syntax regression guard prevented the invalid callsite mutation
  from reaching disk.
- Operational surface was far smaller than NORMAL.

## What Failed

- The macro did not roll back earlier helper/import edits when a later callsite
  replacement was refused.
- Cleanup steps did not run after macro failure.
- The lane did not satisfy task-functional acceptance.

## Decision

Rejected. This is an Atomic OS policy/tooling defeat, not a complexity win.

## Next

Repeat the same difficulty after using newline-safe replacement generation
and the new `decodeEscapedNewlinesInReplacements` support. No complexity
escalation.
