# Atomic OS Benchmark - Round 001 Verdict

## Mission

Two Codex workers were dispatched simultaneously on the same real workspace
problem in isolated worktrees:

- Normal worker: `/private/tmp/kloel-ab-normal-20260516135731`
- Atomic worker: `/private/tmp/kloel-ab-atomic-20260516135731`

Mission:

```sh
npm --prefix worker run lint:check
```

Baseline: 88 worker lint errors on the clean snapshot.

## Result

Normal worker won Round 001 decisively.

The atomic worker did not lose because it could not express the edits. It lost
because the shared MCP server was rooted to the main worktree and could not
target the assigned worktree. This is a system-level Atomic OS failure:
multi-worktree routing was not supported safely enough for a Codex subagent A/B
benchmark.

## Scorecard

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Mission completed | yes | no | Normal |
| Lint final state in assigned worktree | pass | fail, same 88 baseline errors | Normal |
| Typecheck final state | pass | not run | Normal |
| Full worker tests | pass, 45 files / 431 tests | not run | Normal |
| Wall time to terminal result | 132s success | 944s failure | Normal |
| Minimum observed speed ratio | 7.15x faster to terminal result | baseline | Normal |
| Time-to-success ratio | finite, 132s | no success, censored/infinite | Normal |
| Assigned worktree files changed | 24 | 0 | Normal |
| Assigned worktree changed lines | 365 | 0 | Normal |
| Cross-worktree side effects | none observed | 24 files accidentally changed in main worktree | Normal |
| Protected files touched by worker | no | no | tie |
| Editing primitive discipline | used normal tools as allowed | used only atomic tools as required | tie |
| Mutation target correctness | correct worktree | wrong worktree | Normal |
| Intermediate failed validation loops | 1 autofix left 3 unused-vars | 2 lint checks still baseline | Normal |

## Formal Distance

- Completion: normal `1`, atomic `0`.
- Validation gates green: normal `3/3`, atomic `0/3`.
- Elapsed terminal time: atomic consumed `944 / 132 = 7.15x` the normal wall time
  and still did not complete.
- Assigned-worktree throughput: normal changed `365` lines in `132s`
  (`2.77 changed lines/s`) and completed; atomic changed `0` assigned-worktree
  lines in `944s` (`0 assigned changed lines/s`) and failed.
- Side-effect penalty: normal `0` cross-worktree changed files; atomic `24`
  cross-worktree changed files in the main repo.

## What Normal Wins

- End-to-end task completion.
- Speed to green.
- Validation depth.
- Correct worktree targeting.
- Operational reliability under isolated-worktree benchmarking.
- Practical throughput on mechanical lint remediation.

## What Atomic Wins

- Atomic worker obeyed the editing constraint: only shared atomic MCP mutation
  tools were used.
- Atomic operations appear to have stayed within unprotected worker lint files.
- The failure produced a precise root-cause signal: MCP repo-root routing is the
  blocker, not the specific worker lint transformation itself.

## Atomic OS Defect Opened

The shared atomic MCP must support safe per-worktree targeting for delegated
workers. Required properties:

- Every mutating operation must resolve against the worker's assigned repo root,
  not the coordinator's main worktree.
- Absolute paths inside registered worktrees must be accepted only when they are
  explicitly inside an allowed repo root.
- Path escape checks must remain strict.
- The tool response should expose `resolvedRepoRoot` and `resolvedFile` so a
  worker can verify target correctness before mutation.
- There must be a smoke test proving a temporary worktree can be targeted without
  mutating the original worktree.

## Loop Decision

Round 002 must not rerun until Atomic OS fixes the multi-worktree root-routing
failure. Repeating the same test before that fix would only reproduce the same
root mismatch and risk more wrong-worktree edits.

