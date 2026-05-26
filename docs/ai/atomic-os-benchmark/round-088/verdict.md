# Round 088 Verdict

Status: `validated_atomic_zero_loss_router_cluster_tier`

## Task

Escalate one controlled step beyond Round 087. Extract the complete
tool-router helper cluster from `UnifiedAgentService` to
`unified-agent-tool-router.helpers.ts`:

- `executeToolAction`
- `num`
- `buildAgentToolEnvelope`

The service had to preserve `actionSucceeded`, `buildAgentRuntimeContext`, and
`recordAgentRuntimeTurn`.

## Validation

- Normal completed exit `0`.
- Atomic completed exit `0`.
- Normal passed focused Jest.
- Atomic passed focused Jest.
- Both lanes passed diff-check, protected diff, suppression scan, helper
  no-`this.` scan, private-method scan, router-cluster absence scan, router
  export scan, and residual-scope scan.
- Both lanes hit only the same unrelated backend typecheck failure in
  Google Ads/Prisma files.
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
| Event rows | 112 | 3 | Atomic |
| First action | 23,804 ms | 6,217 ms | Atomic |
| Total agent time | 652,667 ms | 73,333 ms | Atomic |
| Completed commands | 12 | 1 | Atomic |
| Failed commands | 1 | 0 | Atomic |
| Input tokens | 73,895 | 55,827 | Atomic |
| Output tokens | 11,225 | 201 | Atomic |
| Reasoning tokens | 5,874 | 522 | Atomic |
| Service lines | 568 | 544 | Atomic |
| Helper lines | 234 | 232 | Atomic |
| Total Kloel lines touched | 802 | 776 | Atomic |
| Source churn | 497 | 459 | Atomic |
| Atomic traces | 0 | 15 | Atomic |
| Touched Kloel files | 2 | 2 | Tie |
| Atomic-only discipline | n/a | Clean | Atomic |

## Wins

Atomic won every measured material metric while matching the functional
acceptance. The dependency-builder macro scaled from a single router method to
the router helper cluster without losing service size, total product surface,
source churn, command count, token cost, or traceability.

Normal found and repaired the `exactOptionalPropertyTypes` issue in its manual
path, but the Atomic shape avoided Kloel typecheck errors under external
validation as well.

## Decision

Scale one more controlled step. Round 089 should keep the two-worker A/B
structure and choose a harder real decomposition of the same organism, but not
increase local worker count. Do not jump to 20-50 workers on this host.
