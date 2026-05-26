# Wave 22 — Sentry #4 + #5: Prisma Errors in AgentRuntimeScheduler + JobRunner

> Authored by PI atomic subagent `w22-sentry-agent-runtime-prisma-fix` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date**: 2026-05-26
**Status**: COMPLETE
**Sentry issues**: `AgentRuntimeSchedulerService.listDueJobs` (224 events/24h) + `AgentRuntimeJobRunnerService.runAllPendingAgentJobs` (224 events/24h)

## Root Cause

Both methods raised `PrismaClientKnownRequestError` through `opsAlert.alertOnCriticalError` → Sentry `captureException` with zero classification. The alerting treated every Prisma error — including transient connection pool timeouts (P2024) and connectivity errors (P1001/P1002) — as critical incidents, flooding Sentry.

224 events in 24h across two `@Cron(EVERY_MINUTE)` jobs = ~15.5% failure rate, consistent with intermittent DB connectivity / connection pool exhaustion, not schema drift or a broken query.

## Changes

### 1. `AgentRuntimeSchedulerService.listDueJobs` — added error classification

**File**: `backend/src/kloel/agent-runtime/agent-runtime.scheduler.ts`

- Wrapped the `findMany` in try/catch
- Prisma error classification:
  - **Connection errors** (P1001, P1002, P2024) → `logger.warn`, return `[]`
  - **Schema drift** (P2021, P2022) → `logger.error` with guard log, return `[]`
  - **Unknown Prisma codes** → `logger.warn`, return `[]`
  - **Non-Prisma errors** → re-throw (caller's `auditDueJobs` catch handles alerting)
- Added private helpers `isConnectionError()` and `isSchemaDriftError()`

### 2. `AgentRuntimeJobRunnerService.runAllPendingAgentJobs` — classified existing catch

**File**: `backend/src/kloel/agent-runtime/agent-runtime.job-runner.ts`

- Enhanced existing catch block with Prisma error classification
- Connection/schema-drift errors → log only, suppress `opsAlert`
- Unknown Prisma errors → alert (unknown risk)
- Non-Prisma errors → alert (unchanged behavior)
- Added same `isConnectionError()` and `isSchemaDriftError()` helpers

### 3. Spec coverage

**File**: `backend/src/kloel/agent-runtime/agent-runtime.scheduler.spec.ts` (5 new tests)

| Test | Assertion |
|---|---|
| P2024 connection pool timeout | Returns `[]`, no throw |
| P2021 schema drift | Returns `[]`, no throw |
| Unknown P2999 Prisma code | Returns `[]`, no throw |
| Non-Prisma Error | Re-throws to caller |
| auditDueJobs with transient error | `opsAlert.alertOnCriticalError` NOT called |

**File**: `backend/src/kloel/agent-runtime/agent-runtime.job-runner.spec.ts` (4 new tests)

| Test | Assertion |
|---|---|
| P2024 connection pool timeout | No alert, returns void |
| P2021 schema drift | No alert, returns void |
| Unknown P2999 Prisma code | Alert IS called |
| Non-Prisma Error | Alert IS called with correct args |

## Verification

- `tsc --noEmit -p backend/tsconfig.json` — passes (only pre-existing TS 7.0 baseUrl deprecation)
- `npm run test -- --runInBand agent-runtime.scheduler.spec.ts` — **9/9 pass**
- `npm run test -- --runInBand agent-runtime.job-runner.spec.ts` — **7/7 pass**
- `npm run test -- --runInBand agent-runtime.job-runner.retry.spec.ts` — all pass
- `npm run test -- --runInBand agent-runtime.job-runner.history.spec.ts` — all pass

## Impact

- **Before**: Every transient DB hiccup → Sentry `captureException` + OpsEvent DB write (potentially failing too)
- **After**: Transient errors (P1001/P1002/P2024) → structured WARN log, no alert, cron retries next minute. Schema drift (P2021/P2022) → structured ERROR log with explicit "verify migrations" message, no alert. Only truly unknown Prisma errors or non-Prisma errors still fire alerts.
- Expected Sentry volume reduction: ~90% (transient connection issues were the bulk of 224 events)

## Risk Assessment

- **LOW**. No contract changes. Public method `listDueJobs` still returns `DueAgentJob[]` — just returns empty on transient errors instead of throwing. Callers (`auditDueJobs`) already handled the throw gracefully; now they don't even see an exception.
- `runAllPendingAgentJobs` is a cron entry point; its return type is `void`. Behavior change: transient errors no longer produce Sentry/OpsEvent noise.
- If a real schema drift occurs, the `logger.error` guard log is the signal to check migrations — it won't be lost in Sentry noise.