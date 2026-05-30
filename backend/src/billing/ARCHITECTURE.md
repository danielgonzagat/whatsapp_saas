# Wallet & Billing — money in, money out, and what the platform charges for it

**One-line purpose:** This territory delivers two distinct money capabilities: (1) the **seller carteira** — the marketplace wallet where a seller's sales revenue lands, matures, and is paid out (withdrawals + anticipations); and (2) **platform billing** — the SaaS subscription a workspace pays Kloel to use the product, plus a **prepaid usage wallet** that meters AI/WhatsApp/API spend.

> Money is the highest-risk surface in KLOEL. Read the non-negotiables in `CLAUDE.md` (`REGRA DE PAGAMENTOS`) before touching anything here: cents in `bigint`, never `float`; append-only ledger; idempotent webhooks; workspace isolation; honest states, never fake success.

---

## What the user does

There are **three** separate user-facing capabilities in this territory. They are easy to confuse because they all say "wallet/carteira" — keep them apart:

1. **Seller carteira** (`/carteira` page). A seller who makes sales sees their balance split into `available` / `pending` / `blocked`, a statement (extrato) of every transaction, a revenue chart, monthly breakdown, registered bank accounts (PIX/conta), the ability to **request a withdrawal (saque)** and to **request an anticipation (antecipação)** of pending receivables for a fee. Withdrawals go through a **human approval** step before the money actually moves.

2. **Platform billing** (`/billing` settings page). The workspace owner sees their Kloel plan (FREE / STARTER / PRO / ENTERPRISE), trial days left, usage vs. plan limit, can activate a trial, cancel, change plan, manage saved payment methods (cards), and start a Stripe checkout to upgrade. This is the money the customer pays **Kloel**, not the money a seller earns.

3. **Prepaid usage wallet** (internal, charged automatically). A workspace tops up a prepaid balance (PIX via Mercado Pago, or card via Stripe) that is **debited per usage** of metered services (AI agent calls, WhatsApp sends, generic API). The user tops up; the platform debits silently as work happens. No dedicated page — surfaced inside settings/usage.

4. **Admin carteira / tesouraria** (`/admin/carteira`, staff-only). Kloel operators see the **marketplace treasury** balance + ledger, Stripe **Connect** account balances, payout requests, run reconciliation, manage the fraud blacklist, and approve/reject Connect payouts. This is the platform's own money custody view, not a tenant view.

---

## End-to-end flow

### Flow A — Seller carteira: view balance + request a withdrawal (the real money-out path)

```
CarteiraSaldoCard / CarteiraSaque (UI)
  frontend/src/components/kloel/carteira.tsx
  -> hook  frontend/src/hooks/useWallet.ts  (useWalletBalance / useWalletWithdrawals / useBankAccounts ...)
  -> api   frontend/src/lib/api/wallet.ts   (getWalletBalance / requestWithdrawal / confirmTransaction)
  -> apiFetch -> NO Next proxy; calls backend directly at /kloel/wallet/:workspaceId/*
  -> Nest  backend/src/kloel/wallet.controller.ts  (WalletController, @Controller('kloel/wallet'))
       GET  :workspaceId/balance       -> WalletService.getBalance
       POST :workspaceId/withdraw      -> (two-phase, see below)
       GET  :workspaceId/transactions  -> WalletService.getTransactionHistory
       GET  :workspaceId/withdrawals   -> direct prisma read (type='withdrawal')
       GET  :workspaceId/anticipations -> direct prisma read (WalletAnticipation)
  -> service backend/src/kloel/wallet.service.ts (WalletService)
  -> ledger  backend/src/kloel/wallet-ledger.service.ts (WalletLedgerService.appendWithinTx)
  -> Prisma  KloelWallet / KloelWalletTransaction / KloelWalletLedger / BankAccount / WalletAnticipation / ApprovalRequest
  -> DB tables  RAC_KloelWallet, RAC_KloelWalletTransaction, RAC_KloelWalletLedger, RAC_BankAccount, RAC_WalletAnticipation, RAC_ApprovalRequest
  -> response back to UI states: balance card, extrato table, withdrawals list
```

**The withdrawal is deliberately two-phase** (`WalletController.withdraw`, lines 81-180), because a saque is a critical irreversible money move:

1. **First POST** (no `approvalRequestId`): validates the amount, then creates an `ApprovalRequest` row (`kind: 'wallet:withdrawal'`, `state: 'OPEN'`, `risk: 'critical'`) and returns `{ approvalRequired: true, approvalRequestId }`. **No balance is touched.**
2. A human approves it out-of-band (the ApprovalRequest flips to `APPROVED`).
3. **Second POST** (with `approvalRequestId`): looks up the `APPROVED` request scoped by `workspaceId`, reads the amount/bankInfo from its payload, then calls `WalletService.requestWithdrawal`, which inside one `prisma.$transaction` debits `availableBalance`, writes a `withdrawal` transaction, and appends a `withdrawal_debit` ledger entry. On success the ApprovalRequest is flipped to `COMPLETED`. The KYC guard (`KycApprovedGuard` + `@KycRequired()`) gates this route.

### Flow B — Platform billing: status + upgrade

```
billing-settings-section.tsx (UI)
  frontend/src/components/kloel/settings/billing-settings-section.tsx
  -> api  frontend/src/lib/api/billing.ts (billingApi.getSubscription / createCheckoutSession / cancelSubscription / payment methods)
  -> apiFetch -> /billing/* (direct, no Next proxy)
  -> Nest backend/src/billing/billing.controller.ts (BillingController, @Controller('billing'), JwtAuthGuard + WorkspaceGuard)
       GET  /billing/status        -> getSubscription + getUsage merged
       GET  /billing/subscription  -> BillingService.getSubscription
       GET  /billing/usage         -> BillingService.getUsage
       POST /billing/checkout      -> BillingService.createCheckoutSession (Stripe Checkout URL)
       POST /billing/cancel        -> BillingService.cancelSubscription
       POST /billing/activate-trial-> BillingService.activateTrial
       POST /billing/webhook       -> BillingService.handleWebhook  (@Public, stripe-signature verified)
  -> service backend/src/billing/billing.service.ts (BillingService = thin facade)
       delegates to: BillingSubscriptionService (status/trial/usage/cancel/plan-features)
                     BillingCheckoutWebhookService (checkout session + Stripe webhook)
                     BillingCheckoutHelperService (shared Stripe plumbing)
  -> Prisma  Subscription, Workspace.stripeCustomerId
  -> DB table RAC_Subscription
```

Card payment methods are a sibling controller: `backend/src/billing/payment-method.controller.ts` -> `PaymentMethodService` (Stripe SetupIntents / attach / default / detach). Routes are `/billing/payment-methods/*` (called by `billingApi.getPaymentMethods` etc.).

### Flow C — Prepaid usage wallet: top up, then auto-debit

```
PrepaidWalletController  backend/src/wallet/prepaid-wallet.controller.ts (@Controller('wallet/prepaid'))
  POST :workspaceId/topup        -> WalletService.createTopupIntent  (PIX=Mercado Pago, card=Stripe PaymentIntent)
  POST :workspaceId/spend        -> WalletService.chargeForUsage     (atomic debit, idempotent on requestId)
  GET  :workspaceId/balance      -> direct prisma read (balanceCents)
  GET  :workspaceId/transactions -> ledger of TOPUP/USAGE/REFUND/ADJUSTMENT
  PATCH:workspaceId/auto-recharge-> configure auto-recharge thresholds
  -> service backend/src/wallet/wallet.service.ts (WalletService — DIFFERENT class, same name, different dir)
       createTopupIntent  -> FraudEngine.evaluate -> upsert prepaidWallet -> MP PIX charge OR Stripe PaymentIntent
       creditFromWebhook / creditMercadoPagoTopup -> idempotent credit on provider webhook
       chargeForUsage / settleUsageCharge / refundUsageCharge -> atomic balance moves
  -> Prisma  PrepaidWallet, PrepaidWalletTransaction, UsagePrice
  -> DB tables prepaid_wallets, prepaid_wallet_transactions, usage_prices
```

Provider webhooks land in the payments/webhooks territory and call `creditFromWebhook` (Stripe) / `creditMercadoPagoTopup` (Mercado Pago) — both idempotent on `@@unique([referenceType, referenceId, type])`.

---

## Canonical vocabulary

| Concept | Canonical name | Notes / aliases to watch |
|---|---|---|
| Seller's marketplace earnings wallet | **KloelWallet** (a.k.a. "carteira") | Service: `backend/src/kloel/wallet.service.ts` `WalletService`. Frontend page: "Carteira". |
| Prepaid usage-metering balance | **PrepaidWallet** | Service: `backend/src/wallet/wallet.service.ts` — **same class name `WalletService`, different module/dir.** This name collision is the #1 confusion in this territory. |
| Append-only audit log of every KloelWallet bucket change | **KloelWalletLedger** | Written only via `WalletLedgerService.appendWithinTx` inside the same `$transaction`. |
| A balance bucket | **available / pending / blocked** | Pending = sale not yet matured (7-day reconcile). |
| Early payout of pending receivables for a fee | **anticipation (antecipação)** | `WalletAnticipation` model + `WalletService.requestAnticipation`. |
| Money-out to a bank | **withdrawal (saque)** | Two-phase via `ApprovalRequest` (`kind: 'wallet:withdrawal'`). |
| Per-sale fee split | **calculateSaleSplit** | kloelFee + gatewayFee, integer cents (`wallet.helpers.ts`). |
| Workspace's Kloel SaaS plan | **Subscription** | FREE/STARTER/PRO/ENTERPRISE. `RAC_Subscription`. |
| Platform's own money custody | **MarketplaceTreasury** + **Connect ledger** | Admin-only via `backend/src/admin/carteira/` (`MarketplaceTreasuryService`, `LedgerService`). Tables: `marketplace_treasuries`, `marketplace_treasury_ledger`, `connect_ledger_entries`. |
| Catalog price for a metered op | **UsagePrice** | `usage_prices`, keyed by `operation`. |

**Resolver aliases (intentional, not duplicates):** `WalletService.getStatement/withdraw/anticipate/getBalanceCents/requestWithdrawalCents` and `BillingService.status/changePlan/update` exist as canonical-name entry points for the Kloel agent capability resolver (`KloelDomainServiceResolver`). They delegate to the real methods; do not "dedupe" them away.

**Legacy/deprecation:** `KloelWallet.availableBalance/pendingBalance/blockedBalance` (Float) and `KloelWalletTransaction.amount` (Float) are marked `// DEPRECATED — drop in P6-3`. The `*InCents` BigInt columns are the source of truth; the Floats are dual-written for the migration window. WAHA-based WhatsApp wiring is intentionally deprecated and out of scope here.

---

## Key services & single responsibility

**Seller carteira (`backend/src/kloel/`):**
- `WalletService` (`wallet.service.ts`) — owns the seller wallet money moves: `processSale` (split + credit pending), `confirmPayment` (pending→available, TOCTOU-safe), `requestWithdrawal`, `requestAnticipation`, and the `@Cron('0 0 */6 * * *')` `reconcilePendingPayments` (settle pending→available after 7 days). All mutations run in `$transaction` and append to the ledger.
- `WalletLedgerService` (`wallet-ledger.service.ts`) — the ONLY writer of `KloelWalletLedger`; append-only, tx-scoped, refuses negative amounts. Enforces invariant I12 (ledger sum == balance).
- `WalletController` (`wallet.controller.ts`) — thin HTTP layer + the two-phase withdrawal approval orchestration + bank-account/anticipation reads.

**Platform billing (`backend/src/billing/`):**
- `BillingService` (`billing.service.ts`) — thin facade that constructs and delegates to the three services below; also owns `changePlan` (routing-only, never moves money) and `update` (Stripe billing-portal link).
- `BillingSubscriptionService` — subscription status, trial activation, usage, cancel, plan-feature activation.
- `BillingCheckoutWebhookService` — creates Stripe Checkout sessions and handles the signed Stripe webhook.
- `BillingCheckoutHelperService` — shared Stripe client plumbing.
- `PaymentMethodService` (`payment-method.service.ts`) — saved-card management (SetupIntent/attach/default/remove).
- `PlanLimitsService` (`plan-limits.service.ts`) — plan→limit lookups.
- `StripeService` (`stripe.service.ts`) — shared Stripe SDK client used across billing AND the prepaid wallet.

**Prepaid usage wallet (`backend/src/wallet/`):**
- `WalletService` (`wallet.service.ts`) — top-up intents (Stripe/MP), idempotent webhook credits, atomic usage debit/settle/refund, fraud-gated top-ups.

**Admin treasury (`backend/src/admin/carteira/`):**
- `AdminCarteiraController` — staff view over `MarketplaceTreasuryService` / `LedgerService` (Connect) / `FraudEngine`; balance, ledger, reconcile, payouts, Connect payout approvals, fraud blacklist.

---

## Data & events

**Prisma models owned by this territory:**
- Seller carteira: `KloelWallet` (`RAC_KloelWallet`), `KloelWalletTransaction` (`RAC_KloelWalletTransaction`), `KloelWalletLedger` (`RAC_KloelWalletLedger`), `WalletAnticipation` (`RAC_WalletAnticipation`), `BankAccount` (`RAC_BankAccount`). Uses `ApprovalRequest` (`RAC_ApprovalRequest`) for withdrawal gating.
- Billing: `Subscription` (`RAC_Subscription`); reads `Workspace.stripeCustomerId`.
- Prepaid wallet: `PrepaidWallet` (`prepaid_wallets`), `PrepaidWalletTransaction` (`prepaid_wallet_transactions`), `UsagePrice` (`usage_prices`).
- Admin treasury (shared with payments territory): `marketplace_treasuries`, `marketplace_treasury_ledger`, `connect_ledger_entries`, `connect_account_balances`, `fraud_blacklist`.

**Events:** This territory is **not** part of the asyncapi event spine — no `commerce.wallet.*` or `commerce.billing.*` events are emitted or consumed (verified against the 122-event asyncapi index). Money movement here is **synchronous + webhook-driven**, not event-bus-driven. Related upstream signals (`commerce.payment.approved/refunded/charged_back`) live in the payments/checkout territory and reach the wallet via direct service calls and provider webhooks, not via the event spine. Observability is via `StructuredLogger`, `FinancialAlertService`, and `OpsAlertService` (drift alerts from the reconcile cron).

---

## Workspace isolation

- **Seller carteira:** `KloelWallet.workspaceId` is `@unique` — one wallet per workspace. Every read/write resolves the wallet by `workspaceId` (`getWalletOrThrow`). The HTTP layer is guarded by `JwtAuthGuard + WorkspaceGuard`, and `confirmPayment` re-asserts `transaction.wallet.workspaceId === callerWorkspaceId` **inside** the transaction to close the cross-tenant TOCTOU. Ledger rows carry `workspaceId` directly. Withdrawal approvals are looked up `WHERE { id, workspaceId, kind, state }`.
- **Billing:** every controller method runs `resolveWorkspaceId(req, workspaceId)` then scopes queries by it; `JwtAuthGuard + WorkspaceGuard`. `changePlan`/`update` query `Subscription`/`Workspace` by `workspaceId`/`id`.
- **Prepaid wallet:** `PrepaidWallet.workspaceId` is `@unique`; balance updates use `updateMany WHERE { id, workspaceId }`, and webhook credits cross-check the webhook's `workspace_id`/reference against the wallet row before crediting.
- **Admin treasury:** intentionally **cross-tenant** (platform custody view), guarded instead by `AdminAuthGuard + AdminPermissionGuard` + `@RequireAdminPermission(CARTEIRA, ...)`. The `@Public()` decorator here disables the *tenant* JWT guard because admin auth is a separate guard chain — not an open endpoint.

---

## Honest status

Plumbing is mature and well-tested; **real production usage is near zero** (live DB at audit time: 1 `KloelWallet`, **0** wallet transactions, **0** ledger rows, **0** anticipations, **0** bank accounts, **0** prepaid wallets, **0** `usage_prices`, 1 `Subscription`). So the *code* is production-grade in shape, but the *flows are unproven against real volume*.

**Works (code-real, transaction-safe, tested):**
- Seller carteira balance/transactions/withdrawals/anticipations reads are wired UI→hook→api→controller→service→Prisma with no mocks. (`useWallet.ts`, `wallet.controller.ts`.)
- Money moves run inside `prisma.$transaction` with `ReadCommitted` isolation and append-only ledger entries; integer-cent `bigint` is the source of truth; the reconcile cron aggregates per-tx failures into an ops alert. Strong spec coverage (`wallet.service.spec.ts`, `wallet-ledger.service.spec.ts`, `wallet.service.e2e-flow.spec.ts`, `ledger-reconciliation.wallet.spec.ts`, I12 property test).
- Withdrawal **human-approval gate** is real (ApprovalRequest two-phase) and KYC-gated.
- Prepaid wallet top-up (Stripe + MP PIX), idempotent webhook credits, and atomic usage debit/settle/refund are implemented with fraud gating and `@@unique` idempotency keys; covered by `wallet.service.charge.spec.ts`, `wallet.service.settle.spec.ts`, `wallet.service.helpers.idempotency.spec.ts`.
- Billing status/usage/cancel/checkout/webhook are real Stripe flows behind a verified `stripe-signature`.

**Facade / unproven / gaps:**
- **Two unrelated services share the exact class name `WalletService`** in different dirs (`kloel/` seller wallet vs `wallet/` prepaid wallet). Both are exported and DI-registered; this is a live foot-gun for any agent searching by symbol — high-priority canonicalization candidate.
- **Float/cents dual-write debt:** `KloelWallet.*Balance` and `KloelWalletTransaction.amount` Floats are still live and read in places (e.g. `WalletController.getMonthlyBreakdown`/`getRevenueChart`/`requestWithdrawal` balance check read the Float `availableBalance`/`amount`, not the cents). The deprecation says "drop in P6-3 after a 7-day zero-drift window" but the drop hasn't happened, so two representations coexist — a known drift risk until the cents columns are made the sole read path.
- **Billing checkout is FREE→paid routing only via `changePlan`** (returns `requiresCheckout`/`requiresAction`); it never charges directly — correct by design, but means "change plan" alone does nothing financial.
- **Withdrawal money actually leaving Stripe/bank** is out of this territory — `requestWithdrawal` only debits the internal wallet and records intent; the real payout/transfer execution lives in the admin treasury / Connect payout flow (`backend/src/admin/carteira/` + payments). The seller-side saque is "request + internal debit", not "money in the bank".
- PULSE per-module artifact lookup returned no matching named artifact for wallet/billing at audit time (`pulse_health_by_module` → no match; needs a fresh `pulse_scan` to score this module), so there is no current PULSE health number to cite for this exact territory.

---

## Start here

1. **`backend/src/kloel/wallet.service.ts`** — the seller carteira money engine; read `processSale`, `confirmPayment`, `requestWithdrawal`, `reconcilePendingPayments`. This is the heart of money-in→matures→money-out.
2. **`backend/src/kloel/wallet.controller.ts`** — the HTTP surface + the two-phase withdrawal approval logic (lines 81-180) that explains why a saque is not a single call.
3. **`backend/src/billing/billing.service.ts`** + **`backend/src/wallet/wallet.service.ts`** — the platform-billing facade and the *other* (prepaid) `WalletService`; reading both back-to-back is the fastest way to internalize the name-collision and keep the two money systems straight.
