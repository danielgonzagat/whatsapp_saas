# ADR 0015: WalletService Disambiguation (Money Path)

- **Status:** Proposed (awaiting Daniel ratification — NO migration begins
  before this ADR is ratified)
- **Date:** 2026-05-27
- **Author:** Wave 36 subagent C (investigation only — zero code change)
- **Supersedes:** none
- **Related ADRs:**
  - ADR-0003 (Stripe Connect Platform Model) — Marketplace ledger philosophy
  - ADR-0009 (MercadoPago PIX + Stripe Card split) — Payment provider split
- **Risk class:** SOX-level — wallet is the canonical money path. Refer to
  CLAUDE.md `REGRA DE PAGAMENTOS / STRIPE / MARKETPLACE`.

---

## 1. Context

The repository ships **two distinct classes both named `WalletService`** in
different NestJS modules. They are NOT alternate implementations of the same
contract — they manage **two different Prisma tables, two different money
flows, two different lifecycles**. They merely collide on a class identifier.

### 1.1 The two services

| Aspect | `backend/src/wallet/wallet.service.ts` (504 LOC) | `backend/src/kloel/wallet.service.ts` (668 LOC) |
| --- | --- | --- |
| Module | `WalletModule` (exports the service) | `KloelModule` (provides + exports) |
| Prisma model | `PrepaidWallet` + `PrepaidWalletTransaction` | `KloelWallet` + `KloelWalletTransaction` + `KloelWalletLedger` + `WalletAnticipation` |
| Money unit | `bigint` cents only (`balanceCents`, `amountCents`) | DUAL-WRITE: legacy Float `balance` + BigInt `*InCents` (Wave 2 P6-2/I11 observation window) |
| Buckets | Single balance: `balanceCents` | Three buckets: `availableBalance`, `pendingBalance`, `blockedBalance` |
| Currency | Multi-currency (Stripe-driven; `wallet.currency.toLowerCase()`) | BRL (no currency column) |
| External provider | Stripe `paymentIntents.create` direct | None — receives signals from checkout/Asaas via internal flow |
| Fraud gate | `FraudEngine.evaluate` before top-up | None inline (relies on upstream checkout fraud) |
| Append-only ledger | NO (mutates `balanceCents`, but transactions are append-only) | YES — `WalletLedgerService.appendWithinTx` writes paired debit+credit rows per state transition |
| Concurrency primitive | `prisma.$transaction` with `ReadCommitted` + idempotency keys on `(referenceType, referenceId, type)` | `prisma.$transaction` with `ReadCommitted` + optimistic lock via `updatedAt` |
| Reconciliation cron | None (top-ups are confirmed by webhook idempotently) | `@Cron('0 0 */6 * * *')` `reconcilePendingPayments` — settles `pending → available` after 7 days |
| Capability list | `createTopupIntent`, `creditFromWebhook`, `chargeForUsage`, `settleUsageCharge`, `refundUsageCharge`, `getBalance` | `processSale`, `confirmPayment`, `requestWithdrawal`, `requestAnticipation`, `getTransactionHistory`, `getBalance`, `reconcilePendingPayments` |
| DI deps | `StripeService`, `PrismaService`, `FraudEngine` | `PrismaService`, `FinancialAlertService`, `WalletLedgerService`, optional `OpsAlertService` |
| Sentry capture | YES — on insufficient balance + wallet-not-found-on-webhook | NO direct Sentry (uses `FinancialAlertService` + optional `OpsAlertService`) |

### 1.2 Domain mapping

- **`wallet/wallet.service.ts` = PREPAID WALLET (usage-metered services)**
  - Used by: AI agent (`agent-assist.helpers.ts`), WhatsApp tooling
    (`knowledge-base.service.ts`, `agent-assist.service.ts`), site builder
    (`site.controller.ts`), upload pipeline (`upload.controller.ts`), PDF
    processor (`pdf-processor.controller.ts`), checkout financial scenarios
    (`financial-scenarios.spec.ts`), certification e2e
    (`certification-e2e-scenarios.spec.ts`).
  - Lifecycle: workspace pre-funds the wallet via Stripe PaymentIntent
    (card or PIX). Usage operations atomically debit. Refunds compensate
    failed downstream operations.
  - Aliased at call sites as `prepaidWalletService` — the consumers already
    know it is the prepaid one (see `kloel/site.controller.ts:59`,
    `kloel/upload.controller.ts:90`, `kloel/pdf-processor.controller.ts:58`).

- **`kloel/wallet.service.ts` = MERCHANT MARKETPLACE WALLET (sales receivables)**
  - Used by: `kloel/wallet.controller.ts` (the merchant-facing wallet UI).
  - Lifecycle: a merchant's sale generates `pendingBalance` (split into
    Kloel fee + gateway fee + net). Pending settles to `available` after
    7 days via cron or webhook. Merchant withdraws via PIX/TED or
    anticipates receivables (early settlement with a fee).
  - This is the workspace-owner cash-out path. Conceptually mirrors a
    marketplace seller's payout ledger (Stripe Connect parallel).

### 1.3 Concrete symptom: ambiguous imports

```ts
// kloel/site.controller.ts:33
import { WalletService } from '../wallet/wallet.service';
private readonly prepaidWalletService: WalletService;

// kloel/wallet.controller.ts:13
import { WalletService } from './wallet.service';
private readonly walletService: WalletService;
```

A reviewer must read the import path to know which money domain is being
touched. `KloelModule` registers BOTH services in its providers/exports list
(`kloel.module.ts:67, 322, 432`), forcing TypeScript to disambiguate by
relative path. Any future grep for "WalletService" risks editing the wrong
domain.

### 1.4 Consumer inventory

**`wallet/wallet.service.ts` (PREPAID) — 7 non-test consumers:**

1. `backend/src/ai-brain/agent-assist.helpers.ts`
2. `backend/src/kloel/site.controller.ts`
3. `backend/src/kloel/upload.controller.ts`
4. `backend/src/kloel/pdf-processor.controller.ts`
5. `backend/src/kloel/mind/knowledge/agent-assist.service.ts`
6. `backend/src/kloel/mind/knowledge/knowledge-base.service.ts`
7. `backend/src/wallet/prepaid-wallet.controller.ts` (intra-module)

Plus 6 spec files exercising charge / settle / refund / webhook flows.

**`kloel/wallet.service.ts` (MERCHANT) — 1 non-test consumer:**

1. `backend/src/kloel/wallet.controller.ts`

Plus 4 spec files (`wallet.service.spec.ts`, `wallet-confirm-payment.service.spec.ts`,
`wallet-withdrawal.service.spec.ts`, `wallet.service.reconciliation.spec.ts`)
and 1 external test (`checkout/__tests__/financial-scenarios.spec.ts`).

The merchant wallet has fewer **inbound** TypeScript consumers because the
sale → wallet credit flow is **event-driven from checkout**, not a direct
controller call.

---

## 2. Decision

This ADR proposes **Option B — Rename to disambiguate**.

The two services are **legitimately distinct domains** that should not be
merged. They:

- Operate on disjoint Prisma tables.
- Use different ledger models (single-balance vs three-bucket + append-only).
- Receive money from different upstream flows (top-up PI vs sale split).
- Send money to different downstream flows (usage debit vs withdrawal/anticipation).
- Have non-overlapping consumers (zero file in the repo uses both).

Forcing them into a single class would create a god-service spanning
prepaid-credit + marketplace-payout — directly violating SRP and dramatically
expanding the SOX surface area of every change.

### 2.1 Rejected: Option A (merge)

A Big-Bang merge would:

- Mix two ledger philosophies (mutable balance vs append-only) into one class.
- Conflate top-up + usage-debit + sale-credit + withdrawal + anticipation
  + reconciliation cron into ≥ 12 public methods on one service.
- Force two distinct Prisma transaction styles into one entry-point.
- Migrate `PrepaidWallet` + `KloelWallet` rows or maintain a view layer —
  either path is a SOX-level data migration on the canonical money table.
- Per CLAUDE.md `REGRA DE PAGAMENTOS`: append-only invariants, idempotency
  surface area, and coverage gates (≥ 95%) would all need to be re-proven
  against the unified class from scratch.

Not justified by any technical benefit. The two classes already coexist
cleanly at runtime.

### 2.2 Rejected: Option C (keep names, document only)

Leaving both classes named `WalletService` perpetuates the naming hazard.
Any future developer (or AI agent) seeing
`import { WalletService } from '...'` in a diff will need to read the path
prefix to know whether SOX rules apply at workspace-prepaid scope or at
merchant-marketplace scope. This is the inverse of "fail loud".

### 2.3 Accepted: Option B (rename)

Rename both classes so the class identifier itself reveals the money domain:

- `backend/src/wallet/wallet.service.ts` → class `PrepaidWalletService`
- `backend/src/kloel/wallet.service.ts` → class `MerchantWalletService`

File paths MAY be renamed in a follow-up PR (`wallet/prepaid-wallet.service.ts`
+ `kloel/merchant-wallet.service.ts`) but the class rename is the
load-bearing change. Modules update their `providers`/`exports` arrays to
the new identifiers. Consumers update imports to the new class names.

Rationale:

- Zero behavior change. Pure identifier refactor.
- Eliminates the naming hazard at the type level — TypeScript catches every
  miss at compile time.
- Aligns class identifier with the field aliases already in use at call
  sites (`prepaidWalletService`).
- Reversible per-file: each consumer update is its own atomic commit.
- No Prisma migration. No data move. No ledger semantics touched.

---

## 3. Migration plan (Option B only)

ONLY proceed after Daniel ratifies this ADR.

### 3.1 Pre-flight invariants

- Verify zero PRs in flight touching either wallet file (`git log
  --since=7days backend/src/wallet/ backend/src/kloel/wallet*`).
- Snapshot test coverage for both services. Per CLAUDE.md ≥ 95% required
  on SplitEngine/LedgerEngine/FraudEngine — wallet services should match.
  If below 95%, raise coverage FIRST (separate PR), then rename.
- Confirm no consumer dynamically resolves `WalletService` by string
  (grep for `'WalletService'` / `"WalletService"`).

### 3.2 Phased rename

**Phase 0 — Documentation lock (this ADR merged).**

**Phase 1 — Rename `kloel/wallet.service.ts` class → `MerchantWalletService`.**
   - Lowest blast radius (1 non-test consumer).
   - Steps:
     1. Update class name in the file.
     2. Update import + DI in `kloel/wallet.controller.ts`.
     3. Update `KloelModule` `providers`/`exports` (line 322, 432).
     4. Update 4 spec files.
     5. Run: `cd backend && npm run typecheck && npm run lint && npm test`.
     6. Verify wallet endpoints still respond (smoke: GET balance, GET history).
   - Commit: `refactor(wallet): rename Kloel merchant WalletService → MerchantWalletService (ADR-0015)`.

**Phase 2 — Rename `wallet/wallet.service.ts` class → `PrepaidWalletService`.**
   - Higher blast radius (7 non-test consumers + 6 spec files).
   - Steps:
     1. Update class name in the file.
     2. Update each consumer (import + DI field). Field aliases already
        say `prepaidWalletService`, so only the type changes.
     3. Update `WalletModule` `providers`/`exports`.
     4. Update spec files.
     5. Run typecheck/lint/test.
     6. Smoke: trigger a usage charge in dev (`/api/uploads` POST hits
        `chargeForUsage` → `settleUsageCharge`).
   - Commit: `refactor(wallet): rename prepaid WalletService → PrepaidWalletService (ADR-0015)`.

**Phase 3 (optional) — File rename to mirror class identity.**
   - `wallet/wallet.service.ts` → `wallet/prepaid-wallet.service.ts`.
   - `kloel/wallet.service.ts` → `kloel/merchant-wallet.service.ts`.
   - Update barrel/index files, `WalletModule`, `KloelModule`.
   - Skip this phase if module-relative imports are already
     deemed acceptable.

### 3.3 Validation gates (each phase)

- `npm run typecheck` exit 0.
- `npm run lint` exit 0.
- `npm test -- wallet` exit 0 with coverage report ≥ pre-rename baseline.
- PULSE scan no new desconexões on wallet/kloel modules.
- Manual smoke: top-up flow (frontend → Stripe PI → webhook → credit) and
  merchant withdrawal flow (request → approval → debit).

---

## 4. Rollback

The rename is identifier-only. Rollback strategy per phase:

- **Phase 1 rollback:** `git revert <merchant-rename-commit>`. Restores
  the original class name + module wiring. Zero data impact.
- **Phase 2 rollback:** `git revert <prepaid-rename-commit>`. Zero data
  impact. Watch for stray imports in PRs opened between the two phases —
  they will fail typecheck after the revert and need a follow-up patch.
- **Phase 3 rollback:** `git revert <file-rename-commit>`. File renames
  are clean Git operations; nothing on disk depends on the path beyond
  what the compiler resolves.

Because there is no Prisma migration and no data write, rollback is always
a single-revert operation. No reconciliation needed.

---

## 5. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Compile-time miss on a consumer | LOW | TypeScript catches at `npm run typecheck`. CI gate prevents merge. |
| Spec file divergence (some still importing old name) | LOW | Phase-by-phase typecheck + `npm test`. |
| External consumer (worker, scripts) breaks | LOW | `worker/` imports backend types via Prisma only, not WalletService. `scripts/` use API endpoints, not the service class. Verify with grep before each phase. |
| Concurrent agent edits during the rename | MEDIUM | Per session-memory note `feedback_pr276_worktree_file_deletion`, concurrent agents can revert silently. Run rename on a fresh branch off `origin/main` and merge fast. |
| False sense of safety triggers Option A later | MEDIUM | This ADR explicitly rejects Option A. Any future "let's merge them" must supersede this ADR with a documented reason. |
| Coverage regression masking a real bug | HIGH | Run full wallet spec suite + e2e financial scenarios + certification suite before each merge. If coverage drops, block. |
| String-resolved DI breaks at runtime | LOW | Grep verified: no `'WalletService'` string literal resolves either service. NestJS DI is type-token based. |

### 5.1 Why this is NOT a money-path mutation

This ADR proposes ZERO change to:

- Prisma schema, models, indexes, unique constraints.
- Transaction isolation levels.
- Idempotency keys.
- Ledger semantics (append-only invariant on `KloelWalletLedger` preserved).
- Sentry/financial alert surfaces.
- Cron schedule of reconciliation.
- Public HTTP/REST contract of wallet controllers.

The rename is **strictly source-level disambiguation**. SOX surface is
unchanged. CLAUDE.md `REGRA DE PAGAMENTOS` non-negotiables (centavos in
`bigint`, ≥ 95% coverage, idempotency, append-only audit trail) are all
preserved by construction.

---

## 6. Open questions

1. Should the file rename in Phase 3 happen in the same PR as Phase 2, or
   be deferred to a cleanup PR? Default: defer, to minimize the diff that
   needs SOX review per phase.
2. Should `KloelMerchantWalletService` be a more accurate identifier than
   `MerchantWalletService`? Default: no — the `kloel/` module prefix is
   already there; doubling the brand prefix adds noise.
3. Should `PrepaidWalletService` be moved into a `billing/` or `payments/`
   submodule to reflect its Stripe-direct nature? Out of scope for this
   ADR; could be a follow-up architectural ADR.

---

## 7. Ratification

This ADR is **Proposed**. NO migration code, file rename, or class rename
runs until:

1. Daniel reviews and either ratifies or rejects.
2. If ratified, status changes to **Accepted** with the ratification date.
3. Migration PR is opened on a fresh branch off `origin/main` per Phase 1.

Until ratified, the two `WalletService` classes remain as they are. This
investigation produced zero code change.
