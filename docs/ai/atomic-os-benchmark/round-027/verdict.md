# Atomic OS Benchmark - Round 027 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-026. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab027-normal-20260516195641`
- Atomic OS: `/private/tmp/kloel-ab027-atomic-20260516195641`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 24.86s.
- Atomic: 45 files passed, 431 tests passed, test duration 24.59s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Agent-recorded task duration | 213s | 176s | Atomic by 37s |
| JSONL event rows | 78 | 41 | Atomic by 37 events |
| JSONL error events | 0 | 0 | Tie |
| Completed shell commands | 28 | 13 | Atomic by 15 commands |
| Unique completed shell commands | 25 | 12 | Atomic by 13 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 3 | 0 | Atomic |
| Full diff commands | 3 | 0 | Atomic |
| Input tokens | 1,420,568 | 738,311 | Atomic by 682,257 |
| Cached input tokens | 1,323,392 | 639,232 | Atomic by 684,160 |
| Output tokens | 6,890 | 4,251 | Atomic by 2,639 |
| Reasoning tokens | 3,169 | 2,023 | Atomic by 1,146 |
| Tool result chars | 0 | 139 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +251/-119 | 24 files, +251/-119 | Tie |
| External validation wall time | 50s | 49s | Atomic by 1s |
| External test duration | 24.86s | 24.59s | Atomic by 0.27s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

This is the strongest Atomic OS result so far:

- it used one atomic analyzer transaction;
- it emitted 24 durable trace files;
- it avoided built-in file-change edits;
- it avoided full code diff proof;
- it used far fewer commands, events, input tokens, output tokens, and reasoning
  tokens;
- it passed the same external validation and was slightly faster externally.

Normal completed correctly, but used three full/file-scoped diff commands and
three built-in file-change items, increasing code-review surface.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 027 is an overwhelming Atomic OS win across almost every practical front,
but still not an all-front win under the strict loop definition:

- Atomic won task duration, command count, event count, input tokens, output
  tokens, reasoning tokens, external wall time, external test duration,
  traceability, editor discipline, and no-diff proof hygiene.
- Normal still wins raw MCP payload because it does not use MCP.
- Worker diff size tied.

Decision: do not scale complexity yet. Compress the MCP success receipt further.
The remaining nonzero MCP payload front may need formal classification because a
structured-action system necessarily emits at least one proof receipt.
