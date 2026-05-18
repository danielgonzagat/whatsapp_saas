# Round 072 Verdict

Status: `rejected_atomic_worktree_escape`

Task: repeat Round 069 method extraction from
`backend/src/kloel/unified-agent.service.ts` into
`backend/src/kloel/unified-agent-action.helpers.ts`.

What happened:

- Normal lane completed cleanly under factory OpenCode isolation.
- Atomic lane used the macro operator, but the OpenCode shell executed from the
  coordinator repo instead of the atomic worktree.
- The coordinator contamination was repaired without `git restore`: the
  accidental helper was removed and `unified-agent.service.ts` returned to zero
  diff.
- The watchdog and round auditor were hardened to detect future
  `atomic-call.cjs` invocations that are not pinned to the atomic worktree.

Measured but rejected:

- Normal: 53 event rows, 10 shell commands, 66,606 input tokens, 2,688 output
  tokens, 897 reasoning tokens.
- Atomic: 6 event rows, 1 shell command, 62,798 input tokens, 698 output tokens,
  598 reasoning tokens.
- Atomic cannot claim victory because `atomicWorktreeEscapeCount=1`.

Decision:

This is not an Atomic win. It is an isolation defect converted into a benchmark
invariant: Atomic must execute inside the assigned worktree, and any escape
invalidates the round.

Next action:

Repeat the same task in Round 073 with the Atomic command pinned to the atomic
worktree using `cd <atomic-worktree>` plus
`ATOMIC_OS_REPO_ROOT=<atomic-worktree>`.
