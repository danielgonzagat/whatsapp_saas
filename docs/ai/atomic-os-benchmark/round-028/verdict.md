# Atomic OS Benchmark - Round 028 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-027. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab028-normal-20260516200514`
- Atomic OS: `/private/tmp/kloel-ab028-atomic-20260516200514`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 23.26s.
- Atomic: 45 files passed, 431 tests passed, test duration 23.09s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Agent-recorded task duration | 509s | 149s | Atomic by 360s |
| JSONL event rows | 90 | 54 | Atomic by 36 events |
| JSONL error events | 0 | 0 | Tie |
| Completed shell commands | 36 | 19 | Atomic by 17 commands |
| Unique completed shell commands | 31 | 16 | Atomic by 15 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Full diff commands | 0 | 0 | Tie |
| Input tokens | 1,324,248 | 456,895 | Atomic by 867,353 |
| Cached input tokens | 1,250,944 | 376,960 | Atomic by 873,984 |
| Output tokens | 7,580 | 5,029 | Atomic by 2,551 |
| Reasoning tokens | 3,420 | 2,829 | Atomic by 591 |
| Tool result chars | 0 | 104 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +247/-119 | 24 files, +251/-119 | Normal by 4 raw lines |
| External validation wall time | 51s | 50s | Atomic by 1s |
| External test duration | 23.26s | 23.09s | Atomic by 0.17s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic remained superior on the main operating fronts:

- one atomic analyzer transaction;
- 24 trace files;
- no built-in file-change edits;
- no full diff proof;
- far fewer commands, events, and tokens;
- faster task completion and slightly faster external validation/test timing.

Normal's only practical win was raw diff size in this round. It also still wins
the artificial raw MCP-payload metric because it emits no MCP receipt.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 028 is a dominant Atomic OS win but still not an all-front win:

- Atomic won time, commands, event rows, tokens, reasoning, external timing,
  traceability, editor discipline, and no-diff proof hygiene.
- Normal won raw worker diff size by 4 lines and raw MCP payload by emitting no
  MCP payload.

Decision: do not scale complexity yet. Investigate whether Atomic's known
residue preservation fixes can be made more diff-compact without deleting
behavior anchors or reducing trust proof.
