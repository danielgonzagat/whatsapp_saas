# Atomic OS Benchmark - Round 022 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-021. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab022-normal-20260516183713`
- Atomic OS: `/private/tmp/kloel-ab022-atomic-20260516183713`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 20.92s.
- Atomic: 45 files passed, 431 tests passed, test duration 21.01s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 182s | 123s | Atomic by 59s |
| JSONL event rows | 75 | 53 | Atomic by 22 events |
| Completed shell commands | 31 | 20 | Atomic by 11 commands |
| Unique completed shell commands | 27 | 17 | Atomic by 10 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Input tokens | 795,136 | 492,366 | Atomic by 302,770 |
| Cached input tokens | 717,056 | 444,416 | Atomic by 272,640 |
| Output tokens | 6,674 | 4,640 | Atomic by 2,034 |
| Reasoning tokens | 3,346 | 2,399 | Atomic by 947 |
| Tool result chars | 0 | 228 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +249/-119 | 24 files, +251/-119 | Normal by 2 raw lines |
| External validation wall time | 43s | 43s | Tie |
| External test duration | 20.92s | 21.01s | Normal by 0.09s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic retained the better preservation topology:

- it restored only OpenAI/voice env state;
- it preserved `mailEnvBackup` and `emptyDemographics`;
- it emitted 24 trace files;
- it avoided built-in file-change edits.

The raw diff loss is not a semantic loss: Normal's shorter result can be
achieved by broader env restoration, while Atomic keeps the smaller behavior
surface. Still, under the strict benchmark, raw line count remains a measured
front.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 022 is a strong Atomic OS operational win but not an all-front win:

- Atomic won time, events, commands, tokens, traceability, and editor discipline.
- Normal won raw diff by 2 lines.
- Normal won test duration by 0.09s.
- Normal has no MCP payload; Atomic reduced payload to 228 chars but still emits
  a tool receipt.

Decision: do not scale task complexity yet. Update Atomic OS again to minimize
the resolved-success receipt further while keeping the trace files as durable
proof.
