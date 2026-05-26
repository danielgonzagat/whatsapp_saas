# Wave 14 — CIA Gap 8: Commercial Decision Orchestrator Auto-Graduate

> Authored by PI atomic subagent `w14-cia-gap-8-shadow-auto-graduate` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Added automatic graduation from shadow-to-active for the commercial decision orchestrator pipeline, gated behind the `COMMERCIAL_ORCHESTRATOR_AUTO_GRADUATE` environment flag (default `false`).

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `backend/src/kloel/commercial-decision-orchestrator/gating.ts` | Modified | Added `evaluateAutoGraduation()` function and integrated it into `checkPipelineGate()` |
| `backend/src/kloel/commercial-decision-orchestrator/gating.spec.ts` | Created | Unit tests for auto-graduation gate |

## Test Result

```
PASS src/kloel/commercial-decision-orchestrator/gating.spec.ts
  checkPipelineGate
    ✓ returns legacy mode when pipelineState is legacy
    ✓ returns active mode when pipelineState is already active
    ✓ returns shadow when pipelineState is shadow and flag is off
    ✓ stays shadow with 29 positive-lift outcomes when flag is on
    ✓ graduates to active with 30 positive-lift outcomes when flag is on
    ✓ stays shadow with 30+ outcomes when flag is absent (default false)
    ✓ does not query decisionOutcome when pipeline is already active
    ✓ filters count by correct decision types: tom, message_format, objection_response

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

Existing `commercial-decision-orchestrator.service.spec.ts` (13 tests) also passes with no regressions.

## Backend tsc Result

```
> backend@0.0.1 typecheck
> tsc -p tsconfig.build.json --noEmit

(exit 0)
```

## Graduation Criteria Summary

| Parameter | Value |
|-----------|-------|
| Environment flag | `COMMERCIAL_ORCHESTRATOR_AUTO_GRADUATE` (default `false`) |
| Minimum positive-lift outcomes | 30 |
| Lookback window | 30 days |
| Decision types counted | `tom` (tone), `message_format`, `objection_response` |
| DB table | `RAC_DecisionOutcome` (via `prisma.decisionOutcome.count`) |
| Filter condition | `wonVsBaseline = true` AND `outcomeAt >= now - 30d` |

## Behavior Matrix

| Flag Status | Pipeline State | Positive-Lift Outcomes (30d) | Result | DB Update |
|-------------|---------------|------------------------------|--------|-----------|
| `false` / unset | `shadow` | any | stays `shadow` | none |
| `true` | `shadow` | `< 30` | stays `shadow` | none |
| `true` | `shadow` | `>= 30` | → `active` | `pipelineState.state = 'active'` |
| any | `legacy` | any | stays `legacy` | none |
| any | `active` | any | stays `active` | none (no query) |

## Implementation Detail

`checkPipelineGate()` now performs these steps:

1. Reads `pipelineState` from DB as before.
2. If mode is `legacy` → returns legacy decision immediately (unchanged).
3. If mode is `shadow` → calls `evaluateAutoGraduation()`:
   - If flag is off → returns `'shadow'` (no DB query).
   - If flag is on → counts `DecisionOutcome` rows matching the criteria above.
   - If count ≥ 30 → returns `'active'`; caller updates `pipelineState` and returns active mode.
4. If mode is `active` → returns active immediately (unchanged; no auto-graduation query).

## Deployment Safety

- **No behavior change in production**: flag defaults to `false`.
- **Read-only query on auto-graduation path**: the count query is a single aggregate (`SELECT COUNT(*)`) scoped to one workspace, three decision types, 30-day window.
- **At-most-once graduation**: once `pipelineState` is `active`, the function short-circuits before the count query.
- **No rollback mechanism**: once graduated, the workspace stays active. A manual revert to shadow can be done via the existing `pipelineState.update` path if needed.
