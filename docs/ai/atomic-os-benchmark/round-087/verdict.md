# Round 087 Verdict

Status: `validated_atomic_zero_loss_router_bounded_tier`

## Task

Repeat the bounded router extraction from Rounds 085/086: extract only
`UnifiedAgentService.executeToolAction` to
`unified-agent-tool-router.helpers.ts`, preserving `private num` and
`private buildAgentToolEnvelope` in `UnifiedAgentService`.

This round tested the new Atomic dependency-builder shape with
`postRemovalReplacements` and a compact predecided callsite.

## Validation

- Normal completed exit `0`.
- Atomic completed exit `0`.
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
| Event rows | 114 | 3 | Atomic |
| First action | 24,601 ms | 7,438 ms | Atomic |
| Total agent time | 811,633 ms | 65,986 ms | Atomic |
| Completed commands | 14 | 1 | Atomic |
| Failed commands | 5 | 0 | Atomic |
| Input tokens | 72,417 | 53,093 | Atomic |
| Output tokens | 10,141 | 116 | Atomic |
| Reasoning tokens | 11,206 | 175 | Atomic |
| Service lines | 585 | 562 | Atomic |
| Total Kloel lines touched | 796 | 783 | Atomic |
| Helper lines | 211 | 221 | Normal |
| Source churn | 453 | 432 | Atomic |
| Atomic traces | 0 | 8 | Atomic |
| Touched Kloel files | 2 | 2 | Tie |
| Atomic-only discipline | n/a | Clean | Atomic |

## Wins

Atomic closed the router-bounded tier with zero material losses. Both lanes
produced an equivalent focused behavior and preserved the non-target private
helpers, but Atomic won service size, total product surface, churn, time,
commands, failed commands, tokens, traceability, and atomic-only discipline.

Normal produced a smaller helper file, but that did not compensate for larger
service size, larger total touched Kloel surface, larger churn, five failed
commands, and no trace.

## Decision

The current router-bounded tier can scale one step. The next round should
increase complexity in a controlled way, not jump to the full 20-50 worker
swarm: keep two isolated OpenCode lanes, preserve the same external validation,
and choose the smallest harder task that stresses router decomposition without
opening unrelated product scope.
