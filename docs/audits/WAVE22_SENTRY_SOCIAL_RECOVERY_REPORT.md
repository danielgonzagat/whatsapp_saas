# Wave 22 — Sentry #10 — PrismaClientKnownRequestError in CheckoutSocialRecoveryService

> Authored by PI atomic subagent `w22-sentry-checkout-social-recovery-fix` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date:** 2026-05-26
**Sentry Issue:** #10 — `PrismaClientKnownRequestError` in `CheckoutSocialRecoveryService.recoverAbandonedLeads`
**Volume:** 50 events / 24h (~1 failure every 29 min)
**Severity:** Medium (checkout recovery cron, smaller volume but revenue-critical)

---

## 1. Root Cause Analysis

### 1.1 The Error Chain

The `recoverAbandonedLeads` cron (every 10 min) processes up to 200 leads sequentially via `forEachSequential`. **No per-lead error isolation existed** — any single-lead exception aborted the entire batch, leaving remaining leads unprocessed and Sentry reporting the crash.Three specific failure points were identified:

| # | Location | Prisma Code | Trigger | Severity |
|---|----------|-------------|---------|----------|
| 1 | `dispatchEmailRecovery` rollback `update` | P2025 | Lead deleted between transaction commit and `recoveryEmailSentAt: null` rollback | **Critical** — no error handling |
| 2 | `dispatchWhatsAppRecovery` transaction `update` | P2025 | Lead deleted between `findUnique` and `update` inside `$transaction` | High — transaction catches some cases, but `update` itself can fail |
| 3 | `markAbandonedIfEligible` non-P2025 errors | Various | Re-thrown upward, aborting entire batch | Medium — P2025 was caught, everything else propagated |### 1.2 Why 50 events / 24h

The cron runs every 10 min = 144 invocations/day. Each invocation processes up to 200 leads. The P2025 race window exists between the outer `findMany` and inner transactional writes. In a system with frequent lead creation/deletion, a ~33% failure rate per invocation (50/144) is consistent with a narrow race window affecting a small fraction of leads.

### 1.3 Why it matters

- **Revenue impact:** Abandoned checkout recovery emails/WhatsApp messages not sent → lost conversions
- **Observability:** Silent failures in `markAbandonedIfEligible` (P2025 was caught but not logged as a decision)
- **Cascade:** One bad lead kills the entire batch; retry only happens 10 min later---

## 2. Changes Applied

### 2.1 Per-lead error isolation (`recoverAbandonedLeads`)

Wrapped the `forEachSequential` callback body in `try/catch`. Each lead now fails independently — the remaining leads continue processing.

### 2.2 P-code → decision mapping (`resolveRecoveryError`)

New private method that maps known Prisma error codes to typed recovery decisions:

| P-code | Decision | Log Level | Action |
|--------|----------|-----------|--------|
| P2025 (`Record not found`) | `SKIP_RECORD_NOT_FOUND` | `warn` | Skip lead silently (it was deleted) |
| P2002 (`Unique constraint`) | `SKIP_DUPLICATE` | `warn` | Skip lead (concurrent recovery already processed it) |
| P2028 (`Transaction API error`) | `RETRY_LATER` | `warn` | Skip lead (next cron run will retry naturally) |
| Other Prisma error | `ALERT_AND_SKIP` | `error` | Alert OpsAlert + skip lead |
| Non-Prisma error | `ALERT_AND_SKIP` | `error` | Alert OpsAlert + skip lead |### 2.3 Rollback-update hardening (`dispatchEmailRecovery`)

Wrapped the `recoveryEmailSentAt: null` rollback `update` in a try/catch that silently swallows P2025:

- If the rollback update fails with P2025 → log warning, continue
- If it fails with any other error → rethrow (caught by per-lead isolation)

### 2.4 Type definition

Added `RecoveryDecision` union type (`'SKIP_RECORD_NOT_FOUND' | 'SKIP_DUPLICATE' | 'RETRY_LATER' | 'ALERT_AND_SKIP'`) for compile-time safety of the decision map.

---

## 3. Test Coverage

Added 5 new tests to `checkout-social-recovery.service.spec.ts`:

| Test | What it covers |
|------|---------------|
| P2025 in markAbandonedIfEligible | Batch continues to process remaining leads |
| P2025 in WhatsApp dispatch transaction | WhatsApp failure doesn't block email recovery of subsequent leads |
| Non-Prisma error → ALERT_AND_SKIP | Network error in one lead doesn't kill the batch |
| P2025 in email rollback | Email send failure + rollback P2025 doesn't crash |

All 15 tests pass (10 existing + 5 new).---

## 4. Verification

```
✅ tsc --noEmit: 0 errors in checkout-social-recovery.service.ts
✅ Jest: 15/15 tests pass (2 suites)
✅ No checkout idempotency changes
✅ No protected files touched
```

---

## 5. Files Changed

| File | Change |
|------|--------|
| `backend/src/checkout/checkout-social-recovery.service.ts` | +47 lines: per-lead error isolation, P-code mapping, rollback hardening |
| `backend/src/checkout/checkout-social-recovery.service.spec.ts` | +110 lines: 5 error resilience tests |

---

## 6. Expected Sentry Impact

After deployment, the 50 events/24h from `PrismaClientKnownRequestError` in `recoverAbandonedLeads` should drop to **zero** for P2025/P2002/P2028 codes. Any residual `ALERT_AND_SKIP` events will be surfaced through OpsAlert (with structured metadata including leadId, decision, and prismaCode) rather than as bare cron failures.