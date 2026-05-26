# Wave 19 — Decompose wallet.service.ts

> Authored by PI atomic subagent `w19-decompose-wallet` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted read-only balance and transaction-history queries from `wallet.service.ts` (572 LOC → 529 LOC) into a sibling `wallet.read.helpers.ts` (97 LOC).

### Extraction rationale

`getBalance` and `getTransactionHistory` are pure read queries — they have:
- No `$transaction` boundaries
- No idempotency keys
- No ledger writes (`appendWithinTx`)
- No balance mutations

They depend only on `PrismaService`, making them safe, self-contained extraction targets.

## 1. Lines extracted + new LOC

| File | Before | After | Delta |
|------|--------|-------|-------|
| `wallet.service.ts` | 572 LOC | 529 LOC | −43 |
| `wallet.read.helpers.ts` | — | 97 LOC | +97 |
| **Total** | 572 | 626 | **+54** (includes types, JSDoc, file header) |

Extracted logic:

- `getWalletBalance(prisma, workspaceId)` — calls `kloelWallet.upsert` (same semantics as old `getOrCreateWallet`), returns `{ available, pending, blocked, total }`
- `getWalletTransactionHistory(prisma, workspaceId, page, limit, type)` — paginated `kloelWalletTransaction.findMany` + `.count`, returns `{ transactions, total }`

Both now live as pure exported functions in `wallet.read.helpers.ts`. The `WalletService` methods `getBalance` and `getTransactionHistory` are one-line delegators.

Removed from `WalletService`:

- `private getOrCreateWallet(workspaceId)` — logic moved into `getWalletBalance` (its sole caller).

## 2. Files created

- `backend/src/kloel/wallet.read.helpers.ts` — new module with two exported functions and two interface types (`WalletBalance`, `WalletTransactionHistoryResult`).

Files modified:

- `backend/src/kloel/wallet.service.ts` — import added, two methods replaced with delegation calls, `getOrCreateWallet` removed.

## 3. Backend tsc result

```
npm --prefix backend run typecheck
→ Exit code 0, no errors
```

## 4. Spec results

All 6 wallet spec suites pass (34 tests total):

```
PASS src/kloel/wallet-confirm-payment.service.spec.ts
PASS src/kloel/wallet-withdrawal.service.spec.ts
PASS src/kloel/wallet-ledger.service.spec.ts
PASS src/kloel/wallet.controller.spec.ts
PASS src/kloel/wallet.service.spec.ts
PASS src/kloel/wallet.service.reconciliation.spec.ts

Test Suites: 6 passed, 6 total
Tests:       34 passed, 34 total
```

### Withdrawal spec (`wallet-withdrawal.service.spec.ts`)

- `requestWithdrawal` path untouched — its `$transaction`, optimistic lock (`updatedAt`), `BigInt` dual-write, and `appendWithinTx` remain verbatim.
- `getTransactionHistory` tests pass through the delegation layer (same input/output contract).

### Idempotency spec (`wallet-confirm-payment.service.spec.ts`)

- `confirmPayment` path untouched — `updateMany WHERE status = 'pending'` guard, `ForbiddenException` on cross-tenant, atomic status flip, and dual ledger entries all unchanged.

### Ledger spec (`wallet-ledger.service.spec.ts`)

- Zero changes to `wallet-ledger.service.ts` or its spec.

### Reconciliation spec (`wallet.service.reconciliation.spec.ts`)

- Cron handler, per-tx `$transaction`, and `appendWithinTx` pairs (`reconcile_settle_debit` / `reconcile_settle_credit`) all untouched.

## 5. Preserved-invariants checklist

| Invariant | Status | Evidence |
|-----------|--------|----------|
| All `$transaction` boundaries unchanged | ✅ PASS | 4 `$transaction` blocks (processSale, confirmPayment, requestWithdrawal, reconcilePendingPayments) remain verbatim |
| All `isolationLevel: 'ReadCommitted'` preserved | ✅ PASS | Search confirms 4 occurrences, zero removals |
| Optimistic lock (`updatedAt` in `updateMany.where`) untouched | ✅ PASS | All 3 write paths (processSale, requestWithdrawal, confirmPayment balance move) retain the `updatedAt` guard |
| Idempotency guard (`updateMany WHERE status = 'pending'`) untouched | ✅ PASS | `confirmPayment` and `reconcilePendingPayments` both retain the atomic status flip |
| Ledger append-only semantics (`appendWithinTx`) untouched | ✅ PASS | 7 call sites across 4 paths — zero removed or reordered |
| Cross-tenant isolation (`workspaceId` in `where`) untouched | ✅ PASS | All write-path queries retain `workspaceId` filter; extracted reads also scope by `workspaceId` |
| `ConcurrentWalletUpdateError` / `KloelWalletNotFoundError` classes preserved | ✅ PASS | Both error classes remain at module top level |
| Controller wiring unchanged | ✅ PASS | `WalletController` depends on `WalletService`; the public method signatures (`getBalance`, `getTransactionHistory`) are unchanged |
| No new `$transaction` or ledger in extracted code | ✅ PASS | `wallet.read.helpers.ts` contains zero `$transaction`, `isolationLevel`, `updateMany`, or `appendWithinTx` references |
| `BigInt` dual-write (I11) untouched | ✅ PASS | All `*InCents` increment/decrement operations remain in write paths only |
| `FinancialAlertService` call sites untouched | ✅ PASS | `withdrawalFailed`, `reconciliationAlert` invocations unchanged |
| `OpsAlertService` call sites untouched | ✅ PASS | All `alertOnCriticalError` invocations unchanged |

## Conclusion

43 lines of read-only query logic were extracted from `wallet.service.ts` into a dedicated helper module. No `$transaction` boundary, idempotency key, or ledger write was touched. All 34 wallet specs pass. Backend tsc is green.
