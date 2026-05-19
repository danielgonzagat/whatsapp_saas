# Round 048 Invalidated

Status: invalidated, not benchmark evidence.

Reason: the corrected TTY/prompt-argument harness caused Codex to print
`Reading additional input from stdin...` and exit before any code refactor.

Observed worktree state after process exit:

- normal worktree: only `AGENTS.md` dirty;
- atomic worktree: only `AGENTS.md` dirty;
- no benchmark code refactor was performed by either worker.

Operational decision: rerun the same benchmark tier with the last harness known
to complete a full round: prompt via stdin, no `--ignore-*`, no parent TTY, and
exclusive round files.

Benchmark policy: no result from this round can be used to claim normal or
atomic superiority.

