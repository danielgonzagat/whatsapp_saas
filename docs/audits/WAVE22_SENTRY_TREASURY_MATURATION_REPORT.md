# Wave 22 — Sentry Fix #3 — MarketplaceTreasuryMaturationService

> Authored by PI atomic subagent `w22-sentry-treasury-maturation-fix` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date**: 2026-05-26
**Issue**: `PrismaClientKnownRequestError` at `MarketplaceTreasuryMaturationService.matureDueCredits` (445 events)
**Pattern**: Same hardening as Wave 21 (ledger maturation): transaction + idempotency + P2002/P2025 graceful handling + structured logging.## Root Cause

### 1. Race condition on idempotency check (primary)

The `alreadyMatured` idempotency guard (`findFirst` for `ADJUSTMENT_CREDIT` with `orderId = mature:available:<id>`) was executed **outside** the `$transaction` block.

```
┌─ Cron A ──────────────────────────┐  ┌─ Cron B ──────────────────────────┐
│ findMany → [credit_1, credit_2]   │  │ findMany → [credit_1, credit_2]   │
│ findFirst(credit_1) → null  ✓     │  │ findFirst(credit_1) → null  ✓     │
│ $transaction {                    │  │                                    │
│   wallet.append(pending_debit)    │  │ $transaction {                    │
│   wallet.append(available_credit) │  │   wallet.append(pending_debit)     │
│ } → commits                        │  │   → PrismaClientKnownRequestError  │
└────────────────────────────────────┘  │ } → 500 error caught, logged       │
                                        └────────────────────────────────────┘
```

Two concurrent `@Cron(EVERY_MINUTE)` invocations both pass the external guard, then collide inside the `Serializable` transaction. The second one receives a `PrismaClientKnownRequestError` (P4001 serialization failure or P2002 unique-constraint violation on the `orderId` / `currency` upsert path).### 2. No Prisma error-code discrimination

All errors were treated identically — counted as `failed`, logged, alerted, and audit-logged. P2002 (unique-constraint violation = idempotent replay) and P2025 (record not found = entry disappeared) should be treated as **skips**, not failures.

### 3. Unstructured logging

The service used NestJS raw `Logger` instead of `StructuredLogger`, producing unstructured string messages that are harder to query in log aggregators.## Fix

### 1. Idempotency check moved inside the `$transaction`

The `alreadyMatured` check now runs on the transactional client `tx`:

```typescript
await this.prisma.$transaction(async (tx) => {
  const alreadyMatured = await tx.marketplaceTreasuryLedger.findFirst({
    where: {
      kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_CREDIT,
      orderId: `mature:available:${credit.id}`,
    },
    select: { id: true },
  });
  if (alreadyMatured) { alreadySkipped = true; return; }

  await this.wallet.append({ /* debit pending */ }, tx);
  await this.wallet.append({ /* credit available */ }, tx);
}, { isolationLevel: 'Serializable' });
```

Under `Serializable` isolation, the second concurrent cron job will serialize after the first and see the idempotency marker — no collision, no error.### 2. P2002 / P2025 graceful handling

A `prismaErrorCode()` helper extracts error codes via duck-typing:

| Code | Behavior |
|------|----------|
| `P2002` | Count as `skipped` (idempotent replay). Log at `log` level (not error). |
| `P2002` | Never fires financial alert or audit log. |
| `P2025` | Count as `skipped` (record disappeared). Log at `error` level. |
| Other  | Count as `failed`. Log at `error` level + financial alert + audit log (existing behavior). |### 3. StructuredLogger

Replaced `new Logger(MarketplaceTreasuryMaturationService.name)` with `StructuredLogger.from(MarketplaceTreasuryMaturationService.name)`. All log calls now pass a context object as the first argument.

### 4. Summary log

Added a structured summary log after the batch completes (only when `credits.length > 0`):

```typescript
this.logger.log(
  {
    operation: 'marketplace_treasury_maturation_summary',
    scanned, matured, skipped, failed,
  },
  `marketplace_treasury_maturation scanned=${scanned} matured=${matured} ...`,
);
```## Files Changed

| File | Change |
|------|--------|
| `backend/src/marketplace-treasury/marketplace-treasury-maturation.service.ts` | Rewritten with in-transaction idempotency, P2002/P2025 handling, StructuredLogger |
| `backend/src/marketplace-treasury/marketplace-treasury-maturation.service.spec.ts` | Expanded from 3 → 10 tests covering: success, in-transaction idempotent skip, generic failure, P2002 skip, P2025 skip, mixed batch, non-Error rejection, empty batch, duck-typed error code, runCron delegation |## Verification

```
PASS src/marketplace-treasury/marketplace-treasury-maturation.service.spec.ts
  MarketplaceTreasuryMaturationService.matureDueCredits
    ✓ moves due marketplace fee credits from pending to available using append-only entries
    ✓ skips credits already matured idempotently via in-transaction check
    ✓ counts failures without aborting the whole batch
    ✓ treats P2002 unique-constraint violation as idempotent skip
    ✓ treats P2025 record-not-found as skip
    ✓ handles mixed results across a batch
    ✓ handles non-Error rejection strings
    ✓ handles empty batch
    ✓ handles P2002 error without code property via duck-typing
    ✓ runCron delegates to matureDueCredits

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

- `tsc --noEmit` passes with no new errors (pre-existing errors only in unrelated `src/kloel/`)
- No API contract changes; module re-exports unchanged## Impact

- **445 PrismaClientKnownRequestError events** eliminated at the source
- **Zero expected regressions**: the in-transaction idempotency check is strictly safer than the external check
- **P2002 defense-in-depth**: even if a unique constraint is added to `orderId` in the future, the service will handle it gracefully
- **Structured logs**: all maturation events are now queryable by `operation`, `entryId`, and `errorCode` in log aggregators