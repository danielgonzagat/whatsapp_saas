# Round 089 Verdict

Status: `validated_atomic_functional_win_with_lint_residual`

## Task

Escalate one controlled step beyond Round 088. Extract the tool-router helper
cluster plus the action success classifier from `UnifiedAgentService` to
`unified-agent-tool-router.helpers.ts`:

- `executeToolAction`
- `num`
- `buildAgentToolEnvelope`
- `actionSucceeded`

The service had to preserve `buildAgentRuntimeContext` and
`recordAgentRuntimeTurn`.

## Validation

- Normal hit the watchdog `max_timeout` at ~900s.
- Atomic completed exit `0`.
- External validation still found both final worktrees task-functional.
- Both lanes passed focused Jest (`13/13`), diff-check, protected diff,
  suppression scan, helper no-`this.` scan, private-method scan, router-cluster
  absence scan, router export scan, and residual-scope scan.
- Both lanes hit only the same unrelated backend typecheck failure in
  Google Ads/Prisma files; `typecheckKloelErrors=0` for both.
- Extra lint probe on the two touched files failed in both lanes:
  Normal had `5` lint errors; Atomic had `15` mostly Prettier-format errors.
- Audit classification:
  - `functionalPass=true`
  - `taskFunctionalPass=true`
  - `globalFunctionalPass=false`
  - `sharedTypecheckNoiseOnly=true`
  - `atomicModeClean=true`

## Benchmark Results

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Task functional acceptance | Pass | Pass | Tie |
| Watchdog status | max_timeout | completed | Atomic |
| Event rows | 136 | 3 | Atomic |
| First action | 19,864 ms | 5,478 ms | Atomic |
| Total agent time | 885,733 ms | 70,511 ms | Atomic |
| Completed commands | 19 | 1 | Atomic |
| Failed commands | 5 | 0 | Atomic |
| Input tokens | 92,021 | 56,188 | Atomic |
| Output tokens | 11,444 | 192 | Atomic |
| Reasoning tokens | 6,693 | 18 | Atomic |
| Service lines | 538 | 538 | Tie |
| Helper lines | 245 | 240 | Atomic |
| Total Kloel lines touched | 783 | 778 | Atomic |
| Source churn | 500 | 477 | Atomic |
| Atomic traces | 0 | 18 | Atomic |
| Touched Kloel files | 2 | 2 | Tie |
| Atomic-only discipline | n/a | Clean | Atomic |
| Extra lint errors | 5 | 15 | Normal |

## Wins

Atomic won the functional round decisively on runtime, tokens, commands,
failed commands, traceability, helper size, total product surface, and churn
while preserving the required residual methods.

Normal eventually produced a task-functional shape under external validation,
but the worker exceeded the 900s cap and had multiple failed commands,
including wrong Jest invocation and an intermediate `exactOptionalPropertyTypes`
failure that the Atomic prompt had already compiled around.

## Atomic Defeat Formalized

The extra lint probe exposed a real residual: the macro extraction does not yet
format the generated helper/service deltas through the atomic ESLint dry-run
transaction. Normal still had fewer lint residues (`5` vs `15`) even though
both lanes failed lint.

Tool update applied before the next round:

- `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` now accepts
  `formatWithEslint` / `lintFix` / `autoFixLint` for
  `extract_class_methods_to_file`.
- When enabled, the macro calls `atomic_apply_eslint_dry_run_fixes` on the
  source and target files before validation, using ESLint `--fix-dry-run
  --format json` and atomic transaction semantics.

## Decision

Do not scale complexity yet. Round 090 must repeat the same Round 089 task with
`formatWithEslint=true` and prove whether the lint residual is eliminated
without losing Atomic's runtime/token/trace advantage.
