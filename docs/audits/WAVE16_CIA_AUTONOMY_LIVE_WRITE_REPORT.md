# Wave 16 — CIA Autonomy Advisor: Live Write (Gap 3 Phase 2)

> Authored by PI atomic subagent `w16-cia-autonomy-live-write` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date:** 2026-05-26
**Status:** ✅ Complete

## 1. Files Modified

### `backend/src/cia/cia-autonomy-advisor.service.ts`

- **Constructor:** Added `CiaRuntimeStateService` dependency injection.
- **New method `analyzeAndApply(workspaceId)`:**
  - Calls `analyzeAndAdvise()` to get statistical recommendations (INCREASE/DECREASE/NO_CHANGE per decision type).
  - Gates on `process.env.CIA_AUTONOMY_AUTO_APPLY_ENABLED === 'true'` (default-off).
  - When enabled, maps each INCREASE → `mode: 'LIVE'`, each DECREASE → `mode: 'HUMAN_ONLY'` and calls `CiaRuntimeStateService.updateWorkspaceAutonomy()`.
  - NO_CHANGE recommendations are skipped.
  - Each application is individually try/catch-wrapped; one failure does not block others.
  - Returns `{ applied: number; reasoning: string[] }` — `applied` counts successful writes, `reasoning` is the full `analyzeAndAdvise()` output regardless of flag state.

### `backend/src/cia/cia-autonomy-advisor.service.spec.ts`

- Added `CiaRuntimeStateService` mock (`updateWorkspaceAutonomy: jest.Mock`).
- Added nested `describe('analyzeAndApply', ...)` block with 5 tests:
  1. **flag on + 2 recs → 2 applied** — asserts both `LIVE` and `HUMAN_ONLY` calls.
  2. **flag off → 0 applied, still returns reasoning** — verifies advisory-only mode.
  3. **apply throws → counted as not-applied, others still applied** — verifies resilience.
  4. **skips NO_CHANGE recommendations** — no `updateWorkspaceAutonomy` calls.
  5. **returns empty reasoning when no data exists** — edge case.
- Preserves all 6 original `analyzeAndAdvise` tests.

## 2. Test Results

```
PASS src/cia/cia-autonomy-advisor.service.spec.ts (7.151 s)
  CiaAutonomyAdvisorService
    ✓ returns zero adjustments when no closed outcomes exist
    ✓ skips decision types with fewer than 30 samples
    ✓ returns 2 adjustments with reasoning for mixed decision types
    ✓ returns NO_CHANGE for non-significant result
    ✓ correctly computes z-statistic for known proportions
    ✓ counts coupon.redeemed and conversation.handed_off as successes
    analyzeAndApply
      ✓ flag on + 2 recs → 2 applied
      ✓ flag off → 0 applied, still returns reasoning
      ✓ apply throws → counted as not-applied, others still applied
      ✓ skips NO_CHANGE recommendations
      ✓ returns empty reasoning when no data exists

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

## 3. Backend TSC

```
npm --prefix backend run typecheck  →  exit 0, no errors
```

## 4. Activation Runbook

### Enable

```bash
# Set in backend environment (Railway / .env):
CIA_AUTONOMY_AUTO_APPLY_ENABLED=true
```

Once enabled, every call to `CiaAutonomyAdvisorService.analyzeAndApply(workspaceId)` will:
1. Run the z-test over the last 14 days of `DecisionOutcome` data.
2. For each decision type with |z| ≥ 1.96 and n ≥ 30, apply the mode change via `updateWorkspaceAutonomy()`.
3. Log nothing on success; failures are silently caught (not counted toward `applied`).

**Caller integration:** Any service that currently calls `analyzeAndAdvise()` can switch to `analyzeAndApply()`. No callers are modified in this wave — integration is left to a follow-up wave.

### Verify

```sql
-- Check recent autonomy transitions:
SELECT * FROM "Workspace" WHERE "providerSettings"->'autonomy'->>'reason' LIKE 'cia_advisor_%'
  AND "providerSettings"->'autonomy'->>'lastTransitionAt' > NOW() - INTERVAL '1 hour';
```

### Rollback

```bash
# Remove or set to any value other than 'true':
CIA_AUTONOMY_AUTO_APPLY_ENABLED=false
# or unset entirely:
unset CIA_AUTONOMY_AUTO_APPLY_ENABLED
```

No database migration, no schema change, no new queue workers. The flag is read inline at call time with zero caching — setting it to `false` (or unsetting) takes effect immediately on the next invocation.

### Rollback Verification

```sql
-- Confirm no new advisor-driven transitions after rollback time:
SELECT COUNT(*) FROM "Workspace"
WHERE "providerSettings"->'autonomy'->>'reason' LIKE 'cia_advisor_%'
  AND "providerSettings"->'autonomy'->>'lastTransitionAt' > '<rollback_timestamp>';
-- Expected: 0
```

### Monitoring

- No new metrics are emitted. Monitor indirectly via `autonomy.mode` transitions in workspace `providerSettings`.
- Failures are silent (caught, not logged). Consider adding a counter metric in a follow-up wave if observability is needed.
- Recommendation: deploy with flag **off**, validate in staging with flag **on** for a single workspace, then roll to production with flag **off** until callers are integrated.
