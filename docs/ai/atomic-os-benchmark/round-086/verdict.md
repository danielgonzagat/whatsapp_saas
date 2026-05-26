# Round 086 Verdict

Status: `accepted_atomic_repeat_win_one_service_metric_loss`

## Task

Repeat the bounded router extraction from Round 085 with an explicit
scope-preservation gate: extract only `executeToolAction` to
`unified-agent-tool-router.helpers.ts`, while preserving `private num` and
`private buildAgentToolEnvelope` in `UnifiedAgentService`.

## Validation

- Normal passed focused Jest: `13/13`.
- Atomic passed focused Jest: `13/13`.
- Both lanes passed diff-check, protected diff, suppression scan, helper
  no-`this.` scan, private-method removal scan, and scope-preservation scan.
- Both lanes hit the same unrelated backend typecheck failure in
  Google Ads/Prisma files.
- Audit classification:
  - `functionalPass=true`
  - `taskFunctionalPass=true`
  - `globalFunctionalPass=false`
  - `sharedTypecheckNoiseOnly=true`
  - `normalScopePreservationPass=true`
  - `atomicScopePreservationPass=true`
  - `atomicModeClean=true`

## Benchmark Results

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Task functional acceptance | Pass | Pass | Tie |
| Scope preservation | Pass | Pass | Tie |
| Event rows | 112 | 3 | Atomic |
| First action | 31,586 ms | 5,221 ms | Atomic |
| Total agent time | 748,290 ms | 65,755 ms | Atomic |
| Completed commands | 13 | 1 | Atomic |
| Failed commands | 0 | 0 | Tie |
| Input tokens | 68,965 | 53,003 | Atomic |
| Output tokens | 9,492 | 126 | Atomic |
| Reasoning tokens | 7,449 | 455 | Atomic |
| Service lines | 565 | 584 | Normal |
| Total Kloel lines touched | 847 | 792 | Atomic |
| Source churn | 498 | 445 | Atomic |
| Atomic traces | 0 | 7 | Atomic |
| Touched Kloel files | 2 | 2 | Tie |
| Atomic-only discipline | n/a | Clean | Atomic |

## Wins

Atomic repeated the bounded-router win against a now-valid normal baseline:
scope preservation tied, but Atomic won time, commands, tokens, total product
surface, churn, traceability, and atomic-only discipline.

Normal still won the `serviceLines` metric by grouping router dependencies in a
private `toolRouterDeps()` method. That is a legitimate shape advantage, even
though Atomic still produced fewer total lines and less churn.

## Tooling Update

`atomic-call.cjs` now supports:

- `requiredTextChecks` in embedded validation, to prove preserved anchors remain.
- `postRemovalReplacements` for `extract_class_methods_to_file`, enabling the
  macro to insert compact service-side adapters after removing the source method.

A disposable probe confirmed the dependency-builder shape passes focused Jest,
preserves `private num` and `private buildAgentToolEnvelope`, and reduces the
Atomic output to `570` service lines / `791` total lines.

## Decision

Do not scale complexity yet. Round 087 should repeat the same tier using the new
dependency-builder shape plus a compact predecided callsite, aiming to eliminate
the remaining `serviceLines` loss while preserving all Atomic wins.
