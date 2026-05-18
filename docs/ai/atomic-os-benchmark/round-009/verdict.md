# Atomic OS A/B Benchmark - Round 009

Date: 2026-05-16

## Task

Same-complexity repeat of the worker lint-debt mission after the Round 008
Atomic OS analyzer output compaction update.

Both agents ran in isolated worktrees from the same repository HEAD.

## Worktrees

- Normal CLI: `/private/tmp/kloel-ab9-normal-20260516161034`
- Atomic OS: `/private/tmp/kloel-ab9-atomic-20260516161034`

## Outcome

Both lanes completed the task and passed the same independent external
verification:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test` (`45` files / `431` tests)
- `npm --prefix worker run build`

## Metrics

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Wall-clock worker time | 131s | 252s | Normal CLI |
| Event log lines | 65 | 111 | Normal CLI |
| Command execution event items | 48 | 56 | Normal CLI |
| Completed / failed shell commands | 22 / 2 | 26 / 2 | Normal CLI |
| MCP event items | 0 | 36 | Normal CLI on overhead, Atomic OS on traceability |
| Completed / failed MCP calls | 0 / 0 | 17 / 1 | Normal CLI |
| Input tokens | 696,717 | 2,397,725 | Normal CLI |
| Cached input tokens | 632,192 | 2,239,360 | Normal CLI |
| Output tokens | 4,958 | 10,708 | Normal CLI |
| Reasoning tokens | 2,153 | 5,889 | Normal CLI |
| Files changed | 24 | 24 | Tie |
| Insertions | 235 | 247 | Normal CLI |
| Deletions | 134 | 119 | Atomic OS |
| Total changed lines | 369 | 366 | Atomic OS |
| Final verification | Pass | Pass | Tie |

## What Atomic OS Won

- Fewer deletions: `119` versus `134`.
- Slightly lower total changed-line surface: `366` versus `369`.
- Better preservation of test intent:
  - preserved and used `mailEnvBackup` via `afterEach`;
  - preserved and used `envBackup` via `beforeEach` / `afterEach`;
  - preserved and used `emptyDemographics` as an assertion fixture.
- The Round 008 analyzer compaction worked mechanically:
  - `filesTotal=23`;
  - `filesOmitted=13`;
  - `aggregateMetrics` was available;
  - trace summary omitted `18` trace refs instead of printing all of them.

## What Normal CLI Won

- Faster completion: `131s` versus `252s`.
- Lower event/log surface: `65` versus `111`.
- Lower shell-command surface: `48` event items versus `56`.
- Lower output tokens: `4,958` versus `10,708`.
- Lower reasoning tokens: `2,153` versus `5,889`.
- Much lower input tokens: `696,717` versus `2,397,725`.
- Fewer insertions: `235` versus `247`.
- No MCP-call failure; Atomic had one failed `code_read_symbol` call for a
  local fixture symbol that `code_outline` did not expose.

## Formal Verdict

Round 009 is a Normal CLI win on the majority of important operational
benchmarks.

Atomic OS still produced the more behavior-preserving test cleanup, but the
operational overhead was too high. The biggest observed regression is that
Atomic read-side tooling returned far too much file content during exploration:
`code_outline` calls for test files included full file text even though the
contract says it should be a token-cheap structural summary. That inflated
input/output tokens and forced extra manual navigation. The failed
`code_read_symbol(emptyDemographics)` also shows that local fixture discovery is
not yet strong enough for test-residue work.

## Loop Decision

Do not scale task complexity.

Remain at the current complexity level. The next Atomic OS update must target:

- make `code_outline` truly outline-only by default, with no full file text;
- add a separate explicit full-text read surface if needed, not hidden inside
  outline;
- improve local variable/fixture discovery or provide analyzer residue targets
  with exact file/line/rule metadata;
- reduce manual residue-fix exploration after analyzer transactions.
