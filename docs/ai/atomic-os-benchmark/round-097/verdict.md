# Round 097 Verdict

Status: `rejected_harness_validation_loss`

## Summary

Round 097 repeated the Round 096 router-cluster task with two simultaneous
OpenCode workers:

- NORMAL: `/private/tmp/kloel-ab097-normal-20260517204003`
- ATOMIC: `/private/tmp/kloel-ab097-atomic-20260517204003`

Both OpenCode lanes exited `0`, but the round is not accepted as benchmark
evidence. When the coordinator started the independent external validation, both
worktrees had disappeared and were no longer listed by `git worktree list`.

## What Counts

- Watchdog captured both event streams.
- ATOMIC preprompt exited `0`.
- NORMAL event stream self-reported final focused Jest and lint success.
- ATOMIC event stream self-reported preprompt success.
- Harness defect discovered: atomic preprompt output was growing, but the
  watchdog heartbeat only counted JSONL growth.

## What Does Not Count

- No external Jest/lint/typecheck/diff validation could be executed against the
  final files.
- No service/helper line counts are trustworthy.
- No source churn comparison is trustworthy.
- No functional winner is accepted.

## Tooling Delta

`docs/ai/atomic-os-benchmark/tools/opencode-round-watchdog.cjs` now treats
`opencode-<lane>-preprompt-output.log` growth as lane activity, preventing false
idle timeout while a preprompt macro is still writing output.

## Decision

Do not scale complexity. Repeat the same difficulty in Round 098 using
persistent worktree paths outside `/private/tmp`, then run independent external
validation before accepting any lane result.
