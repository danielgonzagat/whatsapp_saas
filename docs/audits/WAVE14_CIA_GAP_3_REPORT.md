# Wave 14 — CIA Gap 3: Autonomy Advisor (Slice: Service Creation)

> Authored by PI atomic subagent `w14-cia-gap-3-autonomy-advisor` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Files Modified

| File | Change |
|------|--------|
| `backend/src/kloel/decision-outcome.service.ts` | Added `findAllClosedSinceForWorkspace(workspaceId, since)` for workspace-scoped outcome queries |
| `backend/src/cia/cia-autonomy-advisor.service.ts` | **Created** — `CiaAutonomyAdvisorService` with `analyzeAndAdvise(workspaceId)` |
| `backend/src/cia/cia-autonomy-advisor.service.spec.ts` | **Created** — 6 unit tests covering empty data, min-sample gating, mixed-signal adjustment, non-significant NO_CHANGE, z-statistic correctness, and weighted success classification |
| `backend/src/cia/cia.module.ts` | Registered `CiaAutonomyAdvisorService` in providers + exports |

## 2. Test Results

```
PASS src/cia/cia-autonomy-advisor.service.spec.ts
  ✓ returns zero adjustments when no closed outcomes exist
  ✓ skips decision types with fewer than 30 samples
  ✓ returns 2 adjustments with reasoning for mixed decision types
  ✓ returns NO_CHANGE for non-significant result (z in (-1.96, 1.96))
  ✓ correctly computes z-statistic for known proportions
  ✓ counts coupon.redeemed and conversation.handed_off as successes

Tests: 6 passed, 6 total
```

Also verified: existing `decision-outcome.service.spec.ts` still passes (no regressions).

## 3. Backend tsc Result

```
PASS — tsc -p tsconfig.build.json --noEmit completed with exit code 0
```

## 4. Advisor Decision Matrix

**Formula:**
- `successRate = successCount / total` where success = outcome weight ≥ 0.3
- `SE = sqrt(0.5 × 0.5 / n)`  (standard error under H₀: p = 0.5)
- `z = (successRate − 0.5) / SE`

**Thresholds:**
- `MIN_SAMPLES = 30` per decision type
- `Z_THRESHOLD = 1.96` (95% confidence, two-tailed)

**Decision rules:**

| Condition | Action |
|-----------|--------|
| `successRate > 0.5` AND `z ≥ 1.96` | **INCREASE** aggressiveness by one step (capped at max) |
| `successRate < 0.5` AND `z ≤ −1.96` | **DECREASE** aggressiveness by one step |
| `n < 30` | **SKIP** — not enough samples |
| Otherwise | **NO_CHANGE** — result not statistically significant |

**Example threshold calibrations** (minimum success rate needed for INCREASE at various n):

| n | Min successRate for z ≥ 1.96 |
|---|------------------------------|
| 30 | 67.9% |
| 50 | 63.9% |
| 100 | 59.8% |
| 200 | 56.9% |
| 500 | 54.4% |

**Outcome weight classification** (canonical from `MindLiftReportService`):

| Outcome Name | Weight | Counts as Success? |
|-------------|--------|-------------------|
| `payment.succeeded` | 1.0 | ✓ |
| `coupon.redeemed` | 0.7 | ✓ |
| `conversation.handed_off` | 0.6 | ✓ |
| `inbound.received` | 0.5 | ✓ |
| `checkout.abandoned` | −0.3 | ✗ |
| `inbound.silent_24h` | −0.1 | ✗ |
| `payment.refunded` | −0.5 | ✗ |
| `subscription.canceled` | −0.8 | ✗ |
| `contact.opted_out` | −1.0 | ✗ |

## 5. Scope Limitation (This Slice)

- Advisory only — does **NOT** call `CiaRuntimeStateService.updateWorkspaceAutonomy()`.
- Next slice will wire the advisor into the CIA execution loop, implementing the actual mode transitions.
