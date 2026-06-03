# Atomic OS Benchmark - Round 026 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-025. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab026-normal-20260516193806`
- Atomic OS: `/private/tmp/kloel-ab026-atomic-20260516193806`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 35.39s.
- Atomic: 45 files passed, 431 tests passed, test duration 35.81s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Agent-recorded task duration | 236s | 143s | Atomic by 93s |
| JSONL event rows | 69 | 48 | Atomic by 21 events |
| JSONL error events | 0 | 0 | Tie |
| Completed shell commands | 26 | 17 | Atomic by 9 commands |
| Unique completed shell commands | 22 | 14 | Atomic by 8 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Input tokens | 672,159 | 445,475 | Atomic by 226,684 |
| Cached input tokens | 617,600 | 400,000 | Atomic by 217,600 |
| Output tokens | 6,118 | 4,392 | Atomic by 1,726 |
| Reasoning tokens | 2,960 | 2,314 | Atomic by 646 |
| Tool result chars | 0 | 167 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +251/-119 | 24 files, +251/-119 | Tie |
| External validation wall time | 78s | 78s | Tie |
| External test duration | 35.39s | 35.81s | Normal by 0.42s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic fixed the trust-surface regression from round 025:

- it did not open full code diff for proof;
- it used stat/status/trace count instead;
- it used one atomic analyzer transaction;
- it emitted 24 durable trace files;
- it avoided built-in file-change edits;
- it used materially fewer commands, events, and tokens.

The remaining loss is not correctness. Both results are green. The remaining
loss is benchmark strictness: Normal emits no MCP result payload, and external
test timing still fluctuated slightly in Normal's favor.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 026 is a strong Atomic OS win and a trust-surface recovery, but still not
an all-front win:

- Atomic won task duration, command count, event count, input tokens, output
  tokens, reasoning tokens, traceability, editor discipline, and proof hygiene.
- Normal still won raw MCP payload and external test duration by 0.42s.
- Worker diff and external wall time tied.

Decision: do not scale complexity yet. Compress the successful MCP receipt
again and rerun the same complexity until Atomic wins every measurable front or
the remaining fronts are formally reclassified as non-actionable measurement
artifacts.
