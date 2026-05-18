# Atomic OS Benchmark - Round 029 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-028. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab029-normal-20260516202029`
- Atomic OS: `/private/tmp/kloel-ab029-atomic-20260516202029`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 21.46s.
- Atomic: 45 files passed, 431 tests passed, test duration 21.74s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Agent-recorded task duration | 174s | 154s | Atomic by 20s |
| JSONL event rows | 73 | 50 | Atomic by 23 events |
| JSONL error events | 0 | 0 | Tie |
| Completed shell commands | 29 | 18 | Atomic by 11 commands |
| Unique completed shell commands | 27 | 15 | Atomic by 12 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Full diff commands | 0 | 0 | Tie |
| Input tokens | 1,943,212 | 1,017,247 | Atomic by 925,965 |
| Cached input tokens | 1,853,696 | 959,616 | Atomic by 894,080 |
| Output tokens | 8,421 | 5,147 | Atomic by 3,274 |
| Reasoning tokens | 4,574 | 2,569 | Atomic by 2,005 |
| Tool result chars | 0 | 104 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +249/-119 | 24 files, +247/-119 | Atomic by 2 raw lines |
| External validation wall time | 47s | 47s | Tie |
| External test duration | 21.46s | 21.74s | Normal by 0.28s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic now beats or ties every practical code-production and trust-surface
metric except external test timing variance:

- one atomic analyzer transaction;
- 24 durable trace files;
- no built-in file-change edits;
- no full diff proof;
- lower raw diff size;
- fewer commands, fewer events, and far fewer tokens.

Normal also completed correctly, but it read memory inside the worker and used
far more tokens.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 029 is another dominant Atomic OS win, including raw diff size. It still
does not satisfy the strict all-front escalation rule:

- Atomic won task duration, command count, event count, input tokens, output
  tokens, reasoning tokens, raw diff size, traceability, editor discipline, and
  proof hygiene.
- Normal won raw MCP payload because it emits no MCP proof receipt.
- Normal won external test duration by 0.28s.
- External validation wall time tied.

Decision: do not scale complexity yet. Repeat at the same complexity to
determine whether the external test-duration loss is noise. Treat the raw
MCP-payload front as a candidate non-actionable metric because eliminating the
receipt entirely would remove the proof channel the Atomic OS is designed to
provide.
