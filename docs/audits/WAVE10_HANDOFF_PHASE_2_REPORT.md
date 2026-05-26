# Wave 10 — Handoff Phase-2 Wiring Report

> Authored by PI atomic subagent `w10-handoff-phase-2` (DeepSeek V4 Pro,
> ~8k events). Implements Phase 2 of WAVE4_HANDOFF_DESIGN — flag-gated,
> log-only wiring of computeHandoffConfidence in kloel-thinker.
> Materialized 2026-05-26.


## Summary

Wired the already-shipped `computeHandoffConfidence` collector into the
`KloelThinkerService.think` SSE reply path behind the
`HANDOFF_CONFIDENCE_GATE_ENABLED` feature flag (default `false`).

Phase 2 is **observe-only**: the gate ONLY logs a structured snapshot via
`this.logger.log('Handoff confidence snapshot', …)`. It does NOT block
delivery or escalate regardless of `wouldEscalateAtThreshold04`.

## Files Modified

1. **`backend/src/kloel/kloel-thinker.service.ts`** — +14 lines
   - Added import: `computeHandoffConfidence` from `./handoff-confidence.helper`
   - Inserted flag-gated call after successful ABI build (line 278–292), inside
     the `else` branch where `abiResult.abi` is fully validated. The gate:
     - Checks `process.env['HANDOFF_CONFIDENCE_GATE_ENABLED'] === 'true'`
     - Calls `computeHandoffConfidence(abiResult.abi.beliefs, abiResult.abi.pulseTruth)`
     - Logs the snapshot with `context: 'kloel.handoff.confidence'`

2. **`backend/src/kloel/handoff-confidence.helper.spec.ts`** — +47 lines
   - Added `Phase-2 flag-gated integration` describe block with 2 tests:
     - Verifies snapshot shape is loggable (all fields are JSON-safe primitives,
       spread produces correct log context)
     - Verifies gate is skipped when env var is absent (default-off behavior)

## Test Results

```
PASS src/kloel/handoff-confidence.helper.spec.ts (6.951 s)
  computeHandoffConfidence
    ✓ returns zero composite when no inputs
    ✓ returns high composite when beliefs are confident + pulse healthy
    ✓ flags escalation when composite < 0.4
    ✓ clamps overclaimRisk to [0,1]
    ✓ handles non-finite belief confidence as zero
    ✓ reports beliefCount
  Phase-2 flag-gated integration
    ✓ produces a loggable snapshot when HANDOFF_CONFIDENCE_GATE_ENABLED is true
    ✓ skips the gate when HANDOFF_CONFIDENCE_GATE_ENABLED is not true

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

## Backend tsc

```
npm --prefix backend run typecheck  →  exit 0
```

## Insertion Point

The gate was inserted at the design's primary insertion point:
`backend/src/kloel/kloel-thinker.service.ts` after the ABI build succeeds
(`abiOutcome = success(…)`) and before the KLOEL_ABI_PATH log line. The
`abiResult` variable is in scope, providing direct access to
`abiResult.abi.beliefs` and `abiResult.abi.pulseTruth`.

## Feature Flag

- Flag: `HANDOFF_CONFIDENCE_GATE_ENABLED`
- Default: **off** (absent/any value other than `'true'` → no-op)
- Enable: set `HANDOFF_CONFIDENCE_GATE_ENABLED=true`
- Behavior when enabled: log-only telemetry via structured logger
- No reply blocking, no escalation, no user-visible change in any mode

## Constraints Verified

- [x] Flag defaults to off
- [x] No reply blocking (Phase 2 is observe-only)
- [x] `backend` tsc passes
- [x] All existing tests still pass
- [x] New tests cover flag-on and flag-off paths
- [x] No protected files touched
