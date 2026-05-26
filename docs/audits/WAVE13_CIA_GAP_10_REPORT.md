# Wave 13 — CIA Gap 10: MIND Tick Registration on CIA Bootstrap

> Authored by PI atomic subagent `w13-cia-gap-10-tick-registration` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Added `registerWorkspace`/`deregisterWorkspace` entry points to `MindBackgroundScheduler` as no-op stubs. `CiaBootstrapService.run()` now calls `registerWorkspace` after successful bootstrap, and `CiaRuntimeService.pauseAutonomy()` calls `deregisterWorkspace`. Both calls are wrapped in try/catch and are resilience-safe.

## Files Modified

| File | Change |
|---|---|
| `backend/src/kloel/mind/mind-bg.scheduler.ts` | Added `registerWorkspace(wsId)` and `deregisterWorkspace(wsId)` public no-op stub methods |
| `backend/src/kloel/mind/mind.module.ts` | Exported `MindBackgroundScheduler` from `MindModule` |
| `backend/src/cia/cia.module.ts` | Added `MindModule` to imports |
| `backend/src/cia/cia-bootstrap.service.ts` | Injected `MindBackgroundScheduler` (`@Optional`), added try/catch `registerWorkspace` call before success return in `run()` |
| `backend/src/cia/cia-runtime.service.ts` | Injected `MindBackgroundScheduler` (`@Optional`), added try/catch `deregisterWorkspace` call at top of `pauseAutonomy()` |
| `backend/src/cia/cia-runtime.service.fixtures.ts` | Updated `makeCiaBootstrapMock` to accept optional `mindScheduler` parameter |
| `backend/src/cia/cia-bootstrap.service.spec.ts` | Added tests: `registerWorkspace` called on bootstrap success; NOT called on bootstrap failure |
| `backend/src/cia/cia-runtime.service.spec.ts` | Added `mindScheduler` mock; added test: `deregisterWorkspace` called on `pauseAutonomy` |

## Test Results

```
PASS  backend/src/cia/cia-bootstrap.service.spec.ts    (7 tests)
PASS  backend/src/cia/cia-runtime.service.spec.ts       (12 tests)
PASS  backend/src/kloel/mind/mind-bg.scheduler.spec.ts  (5 tests)
```

All existing tests continue to pass; new tests cover the registration and deregistration paths.

## Backend tsc

```
npm --prefix backend run typecheck
  → exitCode: 0, no errors
```

## Scheduler Method Status

Both `registerWorkspace` and `deregisterWorkspace` were **added as no-op stubs** on `MindBackgroundScheduler`. The scheduler did not previously expose either method. The stubs follow the pattern:

- `registerWorkspace(_workspaceId: string): void` — no-op, policy TBD in future wave
- `deregisterWorkspace(_workspaceId: string): void` — no-op, policy TBD in future wave

The next wave (actual scheduling policy) can wire these to `executeTick()` filtering or per-workspace repeatable jobs without changing any caller.

## Design Decisions

- **`@Optional()` injection**: Both services accept the scheduler optionally. In test environments where `MindModule` is not imported, the scheduler is `undefined` and the `?.` operator safely skips calls. This avoids breaking existing test setups that don't wire the full mind subsystem.
- **try/catch on every call**: Registration/deregistration failures must never block bootstrap or pause operations. Failures are logged as warnings.
- **Placement**: `registerWorkspace` is called only after the full bootstrap success path (after `persistRuntimeSnapshot`, after `agentEvents.publish` for `autopilot_total`). It is NOT called on the early-return failure path (`!status.connected`).
- **Module export**: `MindBackgroundScheduler` was not previously exported from `MindModule`. Added to exports to make it injectable from `CiaModule`.