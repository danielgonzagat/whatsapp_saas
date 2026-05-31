# money-engines — the money kernel (split, ledger, fraud, Connect, treasury)

**One-line purpose:** Turn one buyer payment into many correct payouts — split the
money between Kloel and every stakeholder (seller, affiliate, supplier, coproducer,
manager), record every cent in an append-only ledger, hold funds until they mature,
gate suspicious charges, and pay sellers out only after human approval.

> All money is **`bigint` cents**. Never `number`, never float (Stripe rejects
> float-rounding errors). Every balance is a **materialized view recomputable from an
> append-only ledger**. No ledger row is ever `UPDATE`d — corrections are new
> `ADJUSTMENT` rows. This is the non-negotiable contract from
> [`docs/adr/0003-stripe-connect-marketplace-model.md`](../../../docs/adr/0003-stripe-connect-marketplace-model.md).

---

## What the user does

There is no single "money-engines screen". This territory is the **engine behind**
three user-visible capabilities:

1. **A buyer pays for a product.** They pick PIX, boleto, or card on a checkout page.
   The money is automatically divided between Kloel and the people who earned a cut.
2. **A seller (or affiliate/coproducer) sees their balance** in the Carteira (wallet)
   and requests a withdrawal. The balance has two parts: **pending** (money earned but
   not yet released) and **available** (released, withdrawable).
3. **A Kloel admin approves or rejects** each withdrawal request from the admin panel.
   Money only leaves the platform after a human says yes.

The buyer never sees the split math. The seller sees honest pending/available numbers.
The admin sees the request queue, the ledger, and the marketplace treasury.

---

## End-to-end flow (the REAL path)

### Flow A — Buyer pays → split → ledger credit (the core money flow)

```
Checkout UI (card)
  -> backend checkout-payment.service.ts
       -> PaymentProviderRouterService.resolve()           backend/src/payments/provider-router/provider-router.service.ts
            (card -> Stripe; pix/boleto -> MercadoPago, per ADR-0009)
       -> StripeChargeService.createSaleCharge()            backend/src/payments/stripe/stripe-charge.service.ts
            creates a Stripe PaymentIntent; split lines are
            pre-computed and stored in PaymentIntent.metadata.split_lines
            (split math = calculateSplit, backend/src/payments/split/split.engine.ts)

  ... buyer completes payment on Stripe ...

Stripe sends webhook  POST /webhook/payment
  -> PaymentWebhookStripeController.handleStripe()          backend/src/webhooks/payment-webhook-stripe.controller.ts:118
       - verifies stripe-signature against STRIPE_WEBHOOK_SECRET
       - ensureIdempotent() dedupes on event id (WebhookEvent table)
  -> StripeWebhookProcessor.processSaleSucceeded()          backend/src/payments/stripe/stripe-webhook.processor.ts:178
       for each split line (seller, affiliate, supplier, coproducer, manager):
         - dispatchTransfer()  -> Stripe transfer to that Connect account
         - LedgerService.creditPending()                    backend/src/payments/ledger/ledger.service.ts:66
              -> connect_account_balances.pendingBalanceCents += amount   (DB row update = materialized view)
              -> INSERT connect_ledger_entries (type=CREDIT_PENDING)       (append-only audit row)
              -> idempotent on (referenceType, referenceId, type)
```

### Flow B — Pending → available (time-based maturation)

```
@Cron(EVERY_MINUTE)
  -> ConnectLedgerMaturationService.matureDueEntries()      backend/src/payments/ledger/connect-ledger-maturation.service.ts:47
       finds CREDIT_PENDING rows where scheduledFor <= now and matured=false
  -> LedgerService.moveFromPendingToAvailable()             backend/src/payments/ledger/ledger.service.ts:145
       -> pending -= amount; available += amount  (materialized view)
       -> INSERT connect_ledger_entries (type=MATURE)       (append-only)
       -> sets the original entry.matured = true (idempotent re-run = no-op)
```

### Flow C — Seller requests withdrawal → admin approves → payout

```
Carteira UI  (seller-facing)
  frontend/src/lib/api/wallet.ts -> requestWithdrawal()      (legacy KloelWallet client)
       NOTE: Connect-balance payouts are driven from the ADMIN panel, not this client.

Admin panel  POST /api/admin/carteira/payouts  (and /connect/payout-requests)
  -> AdminCarteiraController.createPayout / list/approve     backend/src/admin/carteira/admin-carteira.controller.ts
  -> ConnectPayoutApprovalService.createRequest()            backend/src/payments/connect/connect-payout-approval.service.ts:35
       creates an ApprovalRequest (state=OPEN). Money does NOT move yet.

Admin clicks Approve  POST /api/admin/carteira/connect/payout-requests/:id/approve
  -> ConnectPayoutApprovalService.approveRequest()           connect-payout-approval.service.ts:163
  -> ConnectPayoutService.createPayout()                     backend/src/payments/connect/connect-payout.service.ts:89
       -> LedgerService.debitAvailableForPayout()            ledger.service.ts:242
            -> available -= amount (atomic; throws InsufficientAvailableBalanceError if short)
            -> INSERT connect_ledger_entries (type=DEBIT_PAYOUT)  (append-only)
       -> stripe.payouts.create() to the seller's bank
       -> writes admin_audit_logs rows for every state change
```

### Flow D — Refund / chargeback reversal

```
Stripe webhook (charge.refunded / charge.dispute.created)
  -> PaymentWebhookStripeController.handleStripe()
  -> ConnectReversalService.processRefund() / processDispute()  backend/src/payments/connect/connect-reversal.service.ts
       -> reverses the Stripe transfers (findSellerTransfer)
       -> LedgerService.debitForRefund() / debitForChargeback()  ledger.service.ts:327 / 415
            -> INSERT connect_ledger_entries (DEBIT_REFUND / DEBIT_CHARGEBACK)  (append-only)
```

### Flow E — Self-audit (drift detection)

```
@Cron('0 */15 * * * *')
  -> ConnectLedgerReconciliationService.reconcile()          backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:118
       replays the entire connect_ledger_entries history per account
       and compares the replayed balance to the materialized
       connect_account_balances row. Any mismatch is logged + audited
       (it never silently "fixes" — drift is a red flag to investigate).
```

**Split preview (read-only, no money moves):**
`POST /payments/split/{workspaceId}/preview` →
`SplitController.preview` ([`split/split.controller.ts`](split/split.controller.ts)) →
`calculateSplit()`. Lets the UI show "who gets what" before a sale.

---

## Canonical vocabulary

| Concept | Canonical name | Notes / aliases |
|---|---|---|
| Split math (one payment → many cuts) | **SplitEngine** — `calculateSplit()` | pure function, no DI; `split/split.engine.ts` |
| Per-Connect-account dual-balance ledger | **LedgerService** | pending + available; `ledger/ledger.service.ts` |
| One immutable money event | **ConnectLedgerEntry** | the append-only row; never UPDATEd |
| Money earned, not yet releasable | **pending** (`pendingBalanceCents`) | |
| Money released, withdrawable | **available** (`availableBalanceCents`) | |
| Releasing pending → available | **maturation** | `moveFromPendingToAvailable`, cron-driven |
| Fraud gate before a charge | **FraudEngine** — `evaluate()` | `fraud/fraud.engine.ts` |
| A seller/affiliate Stripe account | **Connect account** (`ConnectAccountBalance`) | |
| Pay money out to a bank | **payout** | gated by **approval** (human) |
| Kloel's own marketplace money | **MarketplaceTreasury** | distinct from per-account ledger; `marketplace-treasury/` |
| Which PSP handles a method | **PaymentProviderRouter** | card→Stripe, pix/boleto→MercadoPago (ADR-0009) |

**Lingering duplication to be aware of:** there are **two** "wallet" surfaces. The new
Connect/Treasury kernel here (`connect_*`, `marketplace_treasury_*`) is the canonical
money engine. The older `RAC_KloelWallet*` tables + `frontend/src/lib/api/wallet.ts`
are the legacy seller-facing wallet. They are not yet unified — treat `connect_*` +
`marketplace_treasury_*` as the source of truth for marketplace money.

---

## Key services & single responsibility

| Service | Owns (one line) |
|---|---|
| `calculateSplit` (`split/split.engine.ts`) | Pure: divide buyer payment into Kloel cut + stakeholder lines, priority Kloel > Supplier > Affiliate > Coproducer > Manager > Seller (seller absorbs residue). |
| `LedgerService` (`ledger/ledger.service.ts`) | Append-only credits/debits + materialized pending/available balance per Connect account. |
| `ConnectLedgerMaturationService` (`ledger/`) | Cron that releases pending → available when `scheduledFor` is due. |
| `ConnectLedgerReconciliationService` (`ledger/`) | Cron that replays ledger history vs materialized balance to detect drift. |
| `ConnectService` (`connect/connect.service.ts`) | Create Connect accounts, submit onboarding profile, read onboarding status. |
| `ConnectPayoutApprovalService` (`connect/`) | Human-gated payout request lifecycle (OPEN → APPROVED/REJECTED/FAILED). |
| `ConnectPayoutService` (`connect/connect-payout.service.ts`) | Execute an approved payout: debit available + `stripe.payouts.create`. |
| `ConnectReversalService` (`connect/`) | Reverse transfers + debit ledger on refund/dispute. |
| `FraudEngine` (`fraud/fraud.engine.ts`) | Score a checkout (blacklist + velocity), decide allow / 3DS / block. |
| `StripeChargeService` (`stripe/`) | Build a Stripe PaymentIntent for a sale with split metadata. |
| `StripeWebhookProcessor` (`stripe/`) | On `payment_intent.succeeded`: fan out transfers + creditPending per line. |
| `PaymentProviderRouterService` (`provider-router/`) | Static map: method → PSP (card=Stripe, pix/boleto=MercadoPago). |
| `MarketplaceTreasuryService` (`marketplace-treasury/`) | Kloel's own treasury buckets (available/pending/reserved) + append-only treasury ledger. |
| `MercadoPagoPixChargeService` / `...BoletoChargeService` (`mercadopago/`) | PIX + boleto charge creation on MercadoPago (BR). |

---

## Data & events

### Prisma models owned (see [`backend/prisma/schema.prisma`](../../prisma/schema.prisma))

| Model | Table | Role |
|---|---|---|
| `ConnectAccountBalance` | `connect_account_balances` | Per-account materialized pending/available + lifetime totals. |
| `ConnectLedgerEntry` | `connect_ledger_entries` | **Append-only** money events. Unique `(referenceType, referenceId, type)` = idempotency. |
| `ConnectMaturationRule` | `connect_maturation_rules` | Per-product/role release delay in days. |
| `FraudBlacklist` | `fraud_blacklist` | Shared blacklist; unique `(type, value)`. |
| `MarketplaceTreasury` | `marketplace_treasuries` | Kloel's own balance buckets, one row per currency. |
| `MarketplaceTreasuryLedger` | `marketplace_treasury_ledger` | **Append-only** treasury movements. |
| `MarketplaceFee` | `marketplace_fees` | Fee schedule (bps + fixed) per method, time-bounded. |
| `PrepaidWallet` / `PrepaidWalletTransaction` | `prepaid_wallets` / `prepaid_wallet_transactions` | Per-workspace prepaid balance for metered usage (append-only tx). |
| `UsagePrice` | `usage_prices` | Per-operation unit price for prepaid debits. |

`ApprovalRequest` (`RAC_ApprovalRequest`) and `AdminAuditLog` (`admin_audit_logs`) are
**consumed** here for the payout-approval workflow and audit trail (owned elsewhere).

### Enums
`ConnectAccountType` (SELLER/AFFILIATE/SUPPLIER/COPRODUCER/MANAGER) ·
`ConnectLedgerEntryType` (CREDIT_PENDING/MATURE/DEBIT_PAYOUT/DEBIT_CHARGEBACK/DEBIT_REFUND/ADJUSTMENT) ·
`FraudBlacklistType` (CPF/CNPJ/EMAIL/IP/DEVICE_FINGERPRINT/CARD_BIN).

### Events (asyncapi `commerce.*` domain)
This territory **does not emit** events directly today — it is driven by **inbound
Stripe/MercadoPago webhooks** and cron. The semantically-related event taxonomy
(emitted upstream in checkout/payment domains) includes `commerce.payment.approved`,
`commerce.payment.refunded`, `commerce.payment.charged_back`,
`commerce.payment.declined`. Wiring ledger writes to emit canonical
`commerce.payment.*` events is a known gap (see Honest status).

---

## Workspace isolation

- Every public route is `@Controller('payments/connect')` + `@UseGuards(JwtAuthGuard,
  WorkspaceGuard)` — the `WorkspaceGuard` rejects access to a workspace the caller does
  not belong to.
- `ConnectAccountBalance` carries `workspaceId` (indexed). Every controller query filters
  `where: { workspaceId }` and verifies the balance belongs to the workspace before
  acting (`findFirst({ where: { id, workspaceId } })` → 404 if not found).
- `ConnectLedgerEntry` is scoped **transitively** through `accountBalanceId` → the
  ledger-listing endpoint first resolves the workspace's balance ids, then filters
  entries to `{ in: balanceIds }` — a caller can never read another workspace's ledger.
- Admin/internal routes (`@InternalEndpoint`) are the operator surface (reconcile, list
  payouts/ledger, approve) and run under admin auth, not workspace auth.
- **MarketplaceTreasury is intentionally NOT workspace-scoped** — it is Kloel's own
  platform money, one row per currency.

---

## Honest status (brutally honest)

**What is real and proven:**
- **SplitEngine** — pure, deterministic, `bigint`-only, validated input, seller absorbs
  residue. Heavily unit-tested. ✅ Real.
- **LedgerService** — append-only writes inside `prisma.$transaction` with
  `FINANCIAL_TRANSACTION_OPTIONS`, idempotent on `(referenceType, referenceId, type)`,
  atomic balance check on payout debit (`InsufficientAvailableBalanceError`). ✅ Real.
- **FraudEngine** — blacklist + velocity scoring → allow/3DS/block. ✅ Real, unit-tested.
- **Maturation + Reconciliation crons** — release-on-schedule and replay-vs-materialized
  drift detection both exist and run. ✅ Real.
- **Human-gated payouts** — money only leaves on explicit admin approval; full audit
  trail in `admin_audit_logs`; FAILED state on Stripe error. ✅ Real.
- **43 spec files** across `payments/` + `marketplace-treasury/`. The recent commit
  `4b0b4d7b7 test(payments): cover split/ledger/fraud engines to 100% + enforce
  thresholds` confirms the ADR-mandated ≥95% coverage on Split/Ledger/Fraud.

**What is facade / unproven / gated:**
- **No live production proof.** PULSE: `System Payment Reconciliation: status=partial,
  completion=50% ... blocker=Runtime probe backend-health is still missing from live
  evidence`. The code is sound under unit test but has **not** been proven end-to-end
  against a live Stripe Connect + live PIX account in production.
- **PIX capability + live webhook endpoint are owner-gated** (CLAUDE.md STRIPE BASELINE:
  "PIX capability na conta Stripe live — Daniel precisa solicitar"; "Webhook endpoint
  live em produção"). Until enabled, card-only is the proven path; PIX/boleto via
  MercadoPago is wired but unproven live.
- **Two wallet systems coexist** (`connect_*`/`marketplace_treasury_*` vs legacy
  `RAC_KloelWallet*`). Not unified — a real source of confusion/duplication.
- **No canonical event emission** — ledger writes do not yet publish
  `commerce.payment.*` events; downstream consumers can't react to money moves via the
  event spine.
- **Admin Carteira UI lives outside this `frontend/`** — the seller-facing
  `frontend/src/lib/api/wallet.ts` targets the legacy wallet, so the Connect-payout UX
  is admin-panel-only and not exercised by the main app's E2E.

**Bottom line:** the money kernel is **well-engineered and unit-proven**, but
**not yet production-certified** — its honest status is "correct in test, awaiting live
runtime evidence + owner-gated PSP capabilities."

---

## Start here (newcomer reading order)

1. [`split/split.engine.ts`](split/split.engine.ts) (223 lines) — read `calculateSplit`
   to understand the core idea: one payment, deterministic `bigint` cuts, seller absorbs
   residue. This is the simplest, purest piece.
2. [`ledger/ledger.service.ts`](ledger/ledger.service.ts) (523 lines) — read
   `creditPending` and `debitAvailableForPayout` to see the append-only + materialized-
   balance + idempotency pattern that every money move follows.
3. [`stripe/stripe-webhook.processor.ts`](stripe/stripe-webhook.processor.ts):178
   `processSaleSucceeded` — the seam where a real Stripe payment becomes transfers +
   ledger credits. Reading these three, in order, explains the whole territory.

Then skim [`payments.module.ts`](payments.module.ts) for the DI wiring and
[`docs/adr/0003-stripe-connect-marketplace-model.md`](../../../docs/adr/0003-stripe-connect-marketplace-model.md)
+ [`docs/adr/0009-mercadopago-pix-stripe-card-split.md`](../../../docs/adr/0009-mercadopago-pix-stripe-card-split.md)
for the why.

> **WAHA / WhatsApp is intentionally out of scope here** (it is the comms territory).
