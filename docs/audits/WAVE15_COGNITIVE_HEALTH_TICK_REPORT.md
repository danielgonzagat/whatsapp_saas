# Wave 15 — CiaCognitiveHealthService on-tick wiring

> Authored by PI atomic subagent `w15-cognitive-health-on-tick` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Files modified

| File | Change |
|------|--------|
| `backend/src/kloel/mind/mind-bg.scheduler.ts` | Inject `CiaCognitiveHealthService` as `@Optional()`. Add env-gated `scanAndEscalate('ws-test-001')` call in `executeTick()` after the processor tick. Changed `executeTick` from `private` to package-visible for testability. |
| `backend/src/kloel/mind/mind.module.ts` | Add `forwardRef(() => CiaModule)` to imports (circular-safe since `CiaModule` imports `MindModule`). |
| `backend/src/kloel/mind/mind-bg.scheduler.spec.ts` | Extend `buildScheduler()` to accept an optional cognitive health mock and properly instantiate `MindPredictionService`. Add 5 new tests in a `cognitive health on-tick (Wave 15)` describe block. |

## 2. Test results

```
PASS  backend/src/kloel/mind/mind-bg.scheduler.spec.ts
  MindBackgroundScheduler (UTP gap B)
    ✓ does not create a BullMQ queue when KLOEL_MIND_BG_ENABLED=false
    ✓ does not create a BullMQ queue in default test mode
    ✓ registers a recurring job with the short-timescale interval
    ✓ skips startup when Redis URL is not resolved
    ✓ closes queue and worker on destroy
    cognitive health on-tick (Wave 15)
      ✓ calls scanAndEscalate when CIA_COGNITIVE_HEALTH_TICK_ENABLED=true
      ✓ does NOT call scanAndEscalate when flag is absent
      ✓ does NOT call scanAndEscalate when CIA_COGNITIVE_HEALTH_TICK_ENABLED=false
      ✓ continues tick processing when scanAndEscalate throws
      ✓ tolerates missing cognitiveHealth (undefined / not provided)

PASS  backend/src/cia/cia-cognitive-health.service.spec.ts
  CiaCognitiveHealthService
    ✓ escalates cognitive tensions with severity >= 0.7
    ✓ filters events to the target workspace
    ✓ returns escalated=0 when no tensions meet threshold
    ✓ skips non-cognitive tensions even with high severity
    ✓ survives create failure and continues escalating remaining tensions

Tests: 15 passed, 0 failed
```

## 3. Backend tsc result

```
npm --prefix backend run typecheck
> backend@0.0.1 typecheck
> tsc -p tsconfig.build.json --noEmit

(exit 0 — no errors)
```

## 4. Activation runbook

### Enable in production

Set the environment variable in your deployment platform:

```bash
CIA_COGNITIVE_HEALTH_TICK_ENABLED=true
```

### Verify activation

1. Deploy with the flag set to `true`.
2. Watch backend logs for:
   - On each tick: `scanAndEscalate: N cognitive tensions escalated for workspace ws-test-001` (only when tensions exist).
   - On service error: `Cognitive health scan failed for ws-test-001: <error message>`.
3. Verify new `kloelMemory` rows with `category = 'cognitive_health_alert'` appear in the database.
4. Confirm the CIA frontend (`CiaService.getCognitiveHighlights`) surfaces them.

### Deactivate (emergency rollback)

```bash
CIA_COGNITIVE_HEALTH_TICK_ENABLED=false
# or unset the variable entirely
```

No code deploy needed — the flag is read at each tick invocation.

### Safety properties

- **Default-off**: Flag absent or any value other than `'true'` → scan skipped.
- **Non-blocking**: try/catch around the call; service throws are logged, never propagated.
- **Optional DI**: `@Optional()` on the injection — if Nest cannot resolve `CiaCognitiveHealthService` (e.g. module wiring absent), the scheduler still starts and ticks normally.
- **Existing behavior preserved**: No production code path is affected when the flag is off.

### Known limitation

Currently hardcoded to `ws-test-001`. Multi-workspace tick scheduling is tracked in a future wave (see `registerWorkspace` / `deregisterWorkspace` stubs in the scheduler). When that lands, the cognitive health scan will iterate over all registered workspaces.
