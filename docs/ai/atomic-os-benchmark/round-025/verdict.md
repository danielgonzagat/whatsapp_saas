# Atomic OS Benchmark - Round 025 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-024. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab025-normal-20260516192046`
- Atomic OS: `/private/tmp/kloel-ab025-atomic-20260516192046`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 24.11s.
- Atomic: 45 files passed, 431 tests passed, test duration 23.97s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Agent-recorded task duration | 776s | 270s | Atomic by 506s |
| JSONL event rows | 67 | 50 | Atomic by 17 events |
| JSONL error events | 0 | 0 | Tie |
| Completed shell commands | 24 | 18 | Atomic by 6 commands |
| Unique completed shell commands | 20 | 14 | Atomic by 6 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Input tokens | 1,101,356 | 984,476 | Atomic by 116,880 |
| Cached input tokens | 1,035,264 | 923,392 | Atomic by 111,872 |
| Output tokens | 5,977 | 4,935 | Atomic by 1,042 |
| Reasoning tokens | 2,560 | 2,497 | Atomic by 63 |
| Tool result chars | 0 | 201 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +255/-119 | 24 files, +251/-119 | Atomic by 4 raw lines |
| External validation wall time | 49s | 49s | Tie |
| External test duration | 24.11s | 23.97s | Atomic by 0.14s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic won nearly every performance and quality front:

- one atomic analyzer transaction solved the code changes;
- 24 trace files were emitted;
- no built-in file-change edits were used;
- raw diff surface was smaller;
- token usage and command count were lower;
- external test duration was slightly better.

But it regressed on the non-technical trust principle: after receiving a compact
proof receipt, the Atomic worker still ran a full `git diff` over the three
residue files. That reintroduced code-review surface into the report path. It
did not break the code, but it is an operational loss against the Atomic OS
principle.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 025 is the strongest Atomic OS benchmark win so far, but not an all-front
win:

- Atomic won task duration, command count, event count, input tokens, output
  tokens, reasoning tokens, traceability, editor discipline, raw diff size, and
  external test duration.
- Normal still won raw MCP payload because it emits no MCP receipt.
- External validation wall time tied.
- Atomic lost the trust-surface discipline by re-opening full code diff.

Decision: do not scale complexity yet. The next update must harden the Atomic OS
lane against full-diff proof seeking and compress the success receipt further.
