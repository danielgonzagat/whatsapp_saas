# Atomic OS Benchmark - Round 030 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-029. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab030-normal-20260516202658`
- Atomic OS: `/private/tmp/kloel-ab030-atomic-20260516202658`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 24.17s.
- Atomic: 45 files passed, 431 tests passed, test duration 24.08s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Agent-recorded task duration | 165s | 150s | Atomic by 15s |
| JSONL event rows | 65 | 50 | Atomic by 15 events |
| JSONL error events | 0 | 0 | Tie |
| Completed shell commands | 24 | 16 | Atomic by 8 commands |
| Unique completed shell commands | 21 | 13 | Atomic by 8 commands |
| MCP calls | 0 | 2 | Atomic trace path, but second call was avoidable |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Full diff commands | 0 | 0 | Tie |
| Input tokens | 1,222,087 | 567,474 | Atomic by 654,613 |
| Cached input tokens | 1,154,816 | 520,448 | Atomic by 634,368 |
| Output tokens | 6,609 | 4,463 | Atomic by 2,146 |
| Reasoning tokens | 3,109 | 2,302 | Atomic by 807 |
| Tool result chars | 0 | 333 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +263/-119 | 24 files, +247/-119 | Atomic by 16 raw lines |
| External validation wall time | 52s | 52s | Tie |
| External test duration | 24.17s | 24.08s | Atomic by 0.09s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic won almost every practical front again:

- lower task duration;
- fewer events and commands;
- fewer tokens;
- lower raw diff;
- no full diff;
- no built-in file-change edits;
- trace proof.

The regression was an avoidable first MCP call: the worker passed `eslint` as the
first analyzer arg, so the tool treated it as a file pattern and returned an ESLint
status-2 error before the worker retried correctly.

## Verdict

Round 030 remains a strong Atomic OS win, but not an all-front win:

- Atomic won time, commands, event rows, input tokens, output tokens, reasoning,
  raw diff, external test duration, traceability, and proof hygiene.
- Normal won raw MCP payload, and external validation wall time tied.
- Atomic wasted one MCP call because the tool did not normalize a common
  `eslint . --fix-dry-run --format json` argument shape.

Decision: do not scale complexity yet. Update the analyzer operator to strip a
leading `eslint` token from args before invoking ESLint, preserving validation
and all-or-nothing semantics.
