# Atomic OS Benchmark - Round 024 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-023. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab024-normal-20260516185845`
- Atomic OS: `/private/tmp/kloel-ab024-atomic-20260516185845`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 29.46s.
- Atomic: 45 files passed, 431 tests passed, test duration 29.59s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Agent-recorded task duration | 200s | 131s | Atomic by 69s |
| JSONL event rows | 82 | 45 | Atomic by 37 events |
| JSONL error events | 4 | 0 | Atomic |
| Completed shell commands | 29 | 16 | Atomic by 13 commands |
| Unique completed shell commands | 25 | 13 | Atomic by 12 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 2 | 0 | Atomic |
| Input tokens | 910,939 | 435,800 | Atomic by 475,139 |
| Cached input tokens | 862,720 | 389,760 | Atomic by 472,960 |
| Output tokens | 6,203 | 4,656 | Atomic by 1,547 |
| Reasoning tokens | 2,441 | 2,704 | Normal by 263 |
| Tool result chars | 0 | 237 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +253/-128 | 24 files, +251/-119 | Atomic by 11 raw lines |
| External validation wall time | 86s | 86s | Tie |
| External test duration | 29.46s | 29.59s | Normal by 0.13s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic showed the intended operating model more clearly in this round:

- it used one atomic analyzer transaction for the code changes;
- it emitted 24 durable traces;
- it avoided built-in file-change edits;
- it avoided the full-diff reingestion that harmed round 023;
- it preserved `mailEnvBackup`, `envBackup`, and `emptyDemographics`;
- its receipt was report-ready: `proof via stat/name-only/traces; no full diff
  needed`.

Normal completed the same behavior but used more commands, more event rows, more
tokens, two built-in file-change items, and then hit four stream reconnect error
events before `turn.completed`. The wrapper had to be killed after the completed
turn because the process remained stuck.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 024 is a major Atomic OS win, but still not an all-front win:

- Atomic won task duration, events, stream stability, commands, input tokens,
  output tokens, traceability, editor discipline, and raw diff size.
- Normal still won reasoning tokens, external test duration by 0.13s, and the
  raw `0` MCP payload front.
- External validation wall time tied.

Decision: do not scale complexity yet. The next Atomic OS update should reduce
the model's reasoning burden and further compress success receipts without
losing the report-ready proof that prevented full-diff reingestion.
