# Round 047 Invalidated

Status: invalidated, not benchmark evidence.

Reason: both Codex worker processes exited before code edits with internal
runner errors:

`write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open`

Observed worktree state after process exit:

- normal worktree: only `AGENTS.md` dirty;
- atomic worktree: only `AGENTS.md` dirty;
- no benchmark code refactor was performed by either worker.

Operational decision: rerun the same benchmark tier with a corrected harness.
The next launch must pass each prompt as a command argument instead of stdin and
must run the parent shell with a TTY so the child Codex runtime keeps stdin
available for its internal command tool.

Benchmark policy: no result from this round can be used to claim normal or
atomic superiority.

