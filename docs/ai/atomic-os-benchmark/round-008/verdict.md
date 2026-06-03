# Atomic OS A/B Benchmark - Round 008

Date: 2026-05-16

## Task

Same-complexity repeat of the worker lint-debt mission after the Round 007
Atomic OS analyzer update.

Both agents ran in isolated worktrees from the same repository HEAD.

## Worktrees

- Normal CLI: `/private/tmp/kloel-ab8-normal-20260516155940`
- Atomic OS: `/private/tmp/kloel-ab8-atomic-20260516155940`

## Outcome

Both lanes completed the task and passed the same external verification:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test` (`45` files / `431` tests)
- `npm --prefix worker run build`

## Metrics

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Wall-clock worker time | 151s | 190s | Normal CLI |
| Event log lines | 75 | 100 | Normal CLI |
| Command executions | 56 | 58 | Normal CLI |
| MCP calls | 0 | 26 | Normal CLI on overhead, Atomic OS on traceability |
| Input tokens | 1,410,695 | 1,354,912 | Atomic OS |
| Cached input tokens | 1,335,680 | 1,263,488 | Atomic OS |
| Output tokens | 6,654 | 9,415 | Normal CLI |
| Reasoning tokens | 3,088 | 4,832 | Normal CLI |
| Files changed | 24 | 24 | Tie |
| Insertions | 235 | 246 | Normal CLI |
| Deletions | 134 | 119 | Atomic OS |
| Total changed lines | 369 | 365 | Atomic OS |
| Final verification | Pass | Pass | Tie |

## What Atomic OS Won

- Slightly lower input-token surface: `1,354,912` versus `1,410,695`
  (`4.0%` lower).
- Slightly lower changed-line surface: `365` versus `369`.
- Fewer deletions: `119` versus `134`.
- Better preservation of test intent:
  - preserved and used `mailEnvBackup` via `afterEach`;
  - preserved and used `envBackup` via `afterEach`;
  - preserved and used `emptyDemographics` as an assertion fixture.
- The analyzer update worked: the Atomic worker reported following
  `recommendedVerification` and `lintResidueGuidance`.
- All code writes stayed on the atomic surface.

## What Normal CLI Still Won

- Faster completion: `151s` versus `190s` (`25.8%` faster).
- Lower event/log surface: `75` versus `100`.
- Lower output tokens: `6,654` versus `9,415` (`29.3%` lower).
- Lower reasoning tokens: `3,088` versus `4,832` (`36.1%` lower).
- Slightly fewer command-execution items: `56` versus `58`.
- Fewer insertions: `235` versus `246`.

## Formal Verdict

Round 008 is a meaningful Atomic OS improvement over Round 007, but it is not
the required overwhelming victory.

Atomic OS now wins on intent preservation, input tokens, deletion discipline,
and slightly smaller total diff surface. Normal CLI still wins important
operational benchmarks: speed, output tokens, reasoning tokens, event surface,
and command count.

## Loop Decision

Do not scale task complexity.

Remain at the current complexity level. The next Atomic OS update should target
the remaining overhead:

- reduce manual residue-fix tool calls after analyzer transactions;
- make analyzer residue guidance produce directly actionable atomic edit plans
  for common unused test fixtures/backups;
- reduce JSON output surface for large analyzer transactions without losing
  traceability.
