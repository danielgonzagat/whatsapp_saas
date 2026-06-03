# Atomic OS Benchmark - Round 023 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-022. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab023-normal-20260516184618`
- Atomic OS: `/private/tmp/kloel-ab023-atomic-20260516184618`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 21.19s.
- Atomic: 45 files passed, 431 tests passed, test duration 21.21s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 243s | 414s | Normal by 171s |
| JSONL event rows | 70 | 55 | Atomic by 15 events |
| Completed shell commands | 26 | 20 | Atomic by 6 commands |
| Unique completed shell commands | 22 | 17 | Atomic by 5 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Input tokens | 677,872 | 814,902 | Normal by 137,030 |
| Cached input tokens | 621,184 | 758,912 | Normal by 137,728 |
| Output tokens | 5,802 | 4,768 | Atomic by 1,034 |
| Reasoning tokens | 2,789 | 2,164 | Atomic by 625 |
| Tool result chars | 0 | 157 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +247/-119 | 24 files, +251/-119 | Normal by 4 raw lines |
| External validation wall time | 45s | 44s | Atomic by 1s |
| External test duration | 21.19s | 21.21s | Normal by 0.02s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic retained the stronger preservation and proof posture:

- it used the atomic ESLint analyzer transaction as the only code-write surface;
- it emitted 24 durable trace files;
- it avoided built-in file-change edits;
- it preserved the env reset and `emptyDemographics` anchors instead of deleting
  behavior anchors;
- it reduced the successful MCP receipt from 228 chars in round 022 to 157 chars.

However, the round also exposed a serious runtime efficiency regression:

- Atomic took much longer internally despite fewer commands and fewer event rows;
- Atomic consumed more input and cached-input tokens;
- stderr recorded an MCP transport-channel error during the run, though the
  worker recovered and completed successfully.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 023 is not an all-front Atomic OS win:

- Atomic won command count, event count, output tokens, reasoning tokens, trace
  evidence, editor discipline, and external validation wall time by 1s.
- Normal won internal duration, input tokens, cached input tokens, raw diff,
  external test duration, and zero MCP payload.

Decision: do not scale task complexity. The next Atomic OS update must target
runtime efficiency and token re-ingestion, not only receipt size. The atomic
transaction already solves correctly; the remaining gap is making the result
path cheap, stable, and non-stalling under Codex CLI MCP transport.
