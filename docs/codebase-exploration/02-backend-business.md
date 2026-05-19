# Backend Business & Payments — Module Index

> Generated: 2026-05-19  
> Scope: `backend/src/{payments,billing,checkout,wallet,products,product-categories,marketplace,marketplace-treasury,member-area,post-sale,affiliate,contracts,launch}`

---

## Table of Contents

1. [Module Overview Matrix](#module-overview-matrix)
2. [Payment Architecture Diagram](#payment-architecture-diagram)
3. [Detailed Module Breakdown](#detailed-module-breakdown)
   - [1. Payments (`payments/`)](#1-payments-payments)
   - [2. Billing (`billing/`)](#2-billing-billing)
   - [3. Checkout (`checkout/`)](#3-checkout-checkout)
   - [4. Wallet (`wallet/`)](#4-wallet-wallet)
   - [5. Marketplace (`marketplace/`)](#5-marketplace-marketplace)
   - [6. Marketplace Treasury (`marketplace-treasury/`)](#6-marketplace-treasury-marketplace-treasury)
   - [7. Member Area (`member-area/`)](#7-member-area-member-area)
   - [8. Affiliate (`affiliate/`)](#8-affiliate-affiliate)
   - [9. Product Categories (`product-categories/`)](#9-product-categories-product-categories)
   - [10. Launch (`launch/`)](#10-launch-launch)
   - [11. Contracts (`contracts/`)](#11-contracts-contracts)
   - [12. Post-Sale (`post-sale/`)](#12-post-sale-post-sale)
4. [File Count Summary](#file-count-summary)
5. [Data Flow: A Sale from Click to Payout](#data-flow-a-sale-from-click-to-payout)
6. [Improvement Suggestions](#improvement-suggestions)

---

## Module Overview Matrix

| Module | Files | Key Services | External Deps | Risk |
|---|---|---|---|---|
| **payments/** | 58 | LedgerService, ConnectService, SplitEngine, FraudEngine, StripeChargeService, ConnectPayoutService | Stripe Connect, Redis | 🔴 Critical |
| **billing/** | 33 | BillingService, StripeService, PlanLimitsService, PaymentMethodService | Stripe, Redis | 🔴 Critical |
| **checkout/** | 86 | CheckoutService (facade), CheckoutOrderService, CheckoutPaymentService, CheckoutProductService, CheckoutCatalogService | Stripe, Facebook CAPI | 🔴 Critical |
| **wallet/** | 15 | WalletService, PrepaidWalletController | Stripe, Redis, FraudEngine | 🟠 High |
| **marketplace/** | 5 | MarketplaceService (flow templates) | — | 🟡 Normal |
| **marketplace-treasury/** | 11 | MarketplaceTreasuryService, MarketplaceTreasuryPayoutService, MarketplaceTreasuryMaturationService | Stripe | 🔴 Critical |
| **member-area/** | 11 | MemberAreasController, MemberModulesController, MemberEnrollmentsController, MemberStructureController | — | 🟡 Normal |
| **affiliate/** | 7 | AffiliateController, AffiliateMarketplaceController | — | 🟡 Normal |
| **product-categories/** | 5 | ProductCategoriesService | — | 🟢 Safe |
| **launch/** | 6 | LaunchService | — | 🟡 Normal |
| **contracts/** | 4 | autopilot-jobs.ts (queue contract), schemas.ts (API contract) | — | 🟡 Normal |
| **post-sale/** | 1 | PostSaleEventEmitterService | SpineModule | 🟡 Normal |

> **Note:** There is no `products/` directory. Products are managed inside `checkout/` via `CheckoutProductService` and the `Product` Prisma model.

---

## Payment Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BUYER (Public Checkout)                              │
└───────────────────────────────┬─────────────────────────────────────────────────┘
                                │ POST /checkout/public/order
                                ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  CheckoutOrderService.createOrder()                                                │
│  ├── Validates plan, bumps, coupon, shipping                                       │
│  ├── Reconciles server-side pricing (checkout-order-pricing.util)                  │
│  └── Calls CheckoutPaymentService                                                  │
└───────────────────────────────┬───────────────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  CheckoutPaymentService.processPayment()                                           │
│  ├── FraudEngine.evaluate() → (allow | review | require_3ds)                       │
│  │   ├── Blacklist check (Postgres FraudBlacklist)                                 │
│  │   ├── Velocity check (Redis counters)                                           │
│  │   └── Soft signals (missing ID, foreign BIN, high amount)                       │
│  ├── Creates CheckoutOrder row (status=PENDING)                                    │
│  ├── Calls StripeChargeService.createSaleCharge()                                  │
│  └── Returns clientSecret / pixQrCode to frontend                                  │
└───────────────────────────────┬───────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
        ┌─────────────────┐     ┌─────────────────────┐
        │  Stripe (Kloel's  │     │  StripeChargeService │
        │  platform acc)   │     │  .createSaleCharge()  │
        │  PaymentIntent   │     │                       │
        └────────┬────────┘     │  ┌─────────────────┐  │
                 │              │  │ SplitEngine      │  │
                 │              │  │ calculateSplit() │  │
                 │              │  └────────┬────────┘  │
                 │              │           │            │
                 │              │  Priority order:       │
                 │              │  1. Kloel (fee+interest)│
                 │              │  2. Supplier (fixed)    │
                 │              │  3. Affiliate (%)       │
                 │              │  4. Coproducer (%)      │
                 │              │  5. Manager (%)         │
                 │              │  6. Seller (residue)    │
                 │              │           │            │
                 │              │  Stores split_lines    │
                 │              │  in PaymentIntent       │
                 │              │  metadata               │
                 └────────┬────┘              │            │
                          │                  └────────────┘
                          ▼
              ┌─────────────────────┐
              │ Stripe Webhook      │
              │ payment_intent      │
              │ .succeeded          │
              └──────────┬──────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│  StripeWebhookProcessor.processSaleSucceeded()                                     │
│  ├── Reads split_lines from PaymentIntent.metadata                                │
│  ├── For each stakeholder line:                                                    │
│  │   ├── stripe.transfers.create() → destination connected account               │
│  │   └── LedgerService.creditPending() → ConnectAccountBalance                    │
│  └── CheckoutPostPaymentEffectsService (FB CAPI, lead conversion, member enroll)   │
└───────────────────────────────┬───────────────────────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
   │ Kloel       │     │ Seller      │     │ Affiliate/       │
   │ Treasury    │     │ Connect     │     │ Supplier/etc     │
   │ (platform)  │     │ Account     │     │ Connect Account  │
   └──────┬──────┘     └──────┬──────┘     └────────┬────────┘
          │                   │                     │
          ▼                   ▼                     ▼
   ┌─────────────┐    ┌─────────────┐     ┌─────────────────┐
   │ Marketplace │    │ Ledger      │     │ Ledger           │
   │ Treasury    │    │ CREDIT_PENDING│    │ CREDIT_PENDING   │
   │ PENDING     │    │ → MATURE     │     │ → MATURE          │
   │ → AVAILABLE │    │ → DEBIT_PAYOUT│    │ → DEBIT_PAYOUT    │
   └──────┬──────┘    └──────┬──────┘     └────────┬────────┘
          │                   │                     │
          ▼                   ▼                     ▼
   ┌─────────────┐    ┌──────────────────────────────────────┐
   │ Cron: every  │    │  ConnectPayoutService.createPayout()  │
   │ minute       │    │  ├── LedgerService.debitAvailable...() │
   │ Maturation   │    │  ├── stripe.payouts.create()           │
   │ Service      │    │  └── On fail: creditAvailable...()    │
   └─────────────┘    │     + FinancialAlertService             │
                      └──────────────────────────────────────┘
```

---

## Detailed Module Breakdown

### 1. Payments (`payments/`)

**Path:** `backend/src/payments/`  
**58 files** — The heart of Kloel's financial kernel. Implements ADR 0003 (Stripe Connect marketplace with manual payouts and dual-balance ledger).

#### Sub-modules

##### `payments/ledger/` (11 files)
**Purpose:** Connect Account dual-balance ledger (PENDING / AVAILABLE). Append-only, never UPDATES rows.

- `ledger.service.ts` — Core orchestration:
  - `creditPending()` — Record sale credit as PENDING with maturation date. Idempotent on `(refType, refId, CREDIT_PENDING)`.
  - `moveFromPendingToAvailable()` — Mature a pending credit: subtract from PENDING, add to AVAILABLE, insert MATURE row.
  - `debitAvailableForPayout()` — Withdraw AVAILABLE for payout. Throws `InsufficientAvailableBalanceError`.
  - `debitForChargeback()` — Chargeback: pulls from PENDING first (reserve buffer), spills into AVAILABLE if needed.
  - `debitForRefund()` — Operationally identical to chargeback.
  - `creditAvailableByAdjustment()` — Direct AVAILABLE credit (used for failed payout reversals).
  - `getBalance()` — Read snapshot.
  - **All writes:** inside `prisma.$transaction` with `Serializable` isolation.

- `ledger.types.ts` — Input/output types: `CreditPendingInput`, `DebitPayoutInput`, `DebitChargebackInput`, `BalanceSnapshot`, custom errors.
- `ledger-audit.helper.ts` — Structured audit logging for every financial write.
- `ledger-adjustments.helper.ts` — Adjustment credit implementation.
- `connect-ledger-maturation.service.ts` — Cron-driven maturation: scans CREDIT_PENDING rows past their `scheduledFor` date, calls `moveFromPendingToAvailable()`.
- `connect-ledger-reconciliation.service.ts` — Reconciliation between Stripe balance and local ledger.

##### `payments/connect/` (26 files)
**Purpose:** Stripe Connect account lifecycle — create custom accounts, onboarding, payouts.

- `connect.service.ts` — `ConnectService`:
  - `createCustomAccount()` — Create Stripe Custom account, persist local `ConnectAccountBalance`. One-per-workspace-per-accountType. Payouts set to `interval: manual`.
  - `getOnboardingStatus()` — Read live Stripe requirements for Kloel dashboard.
  - `submitOnboardingProfile()` — Submit KYC/bank details from Kloel's own UI to Stripe.
  - `findBalanceByStripeAccountId()` — Find local balance by Stripe account ID.
  - `listBalances()` — List balances optionally filtered by workspace.

- `connect.controller.ts` — `ConnectController`:
  - `GET /payments/connect/:workspaceId/accounts` — List accounts with balances + onboarding status.
  - `POST /payments/connect/:workspaceId/accounts` — Create account.
  - `POST .../accounts/:id/onboarding` — Submit onboarding.
  - `GET /payments/connect/:workspaceId/reconcile` — Trigger reconciliation.
  - `GET .../payout-requests` — List payout requests.
  - `GET .../payouts` — List payouts (from admin audit log).
  - `GET .../ledger` — List ledger entries.
  - `POST .../payouts` — Create payout (with approval).
  - `POST .../payout-requests` — Create payout request.

- `connect.types.ts` — All Connect input/output types: `CreateCustomAccountInput`, `OnboardingStatus`, `SubmitOnboardingProfileInput`, `ConnectAddressInput`, `ConnectIndividualInput`, `ConnectCompanyInput`, etc.
- `connect-payout.service.ts` — `ConnectPayoutService`:
  - `createPayout()` — Debit ledger AVAILABLE, call `stripe.payouts.create()` for the connected account. Idempotent via `requestId`. On Stripe failure: credit back via adjustment + financial alert.
  - `handleFailedPayout()` — Credits back on `payout.failed` webhook.
- `connect-payout-approval.service.ts` — Payout approval workflow (admin review).
- `connect-reversal.service.ts` — Reversal logic for failed/mistaken payouts.

##### `payments/split/` (7 files)
**Purpose:** Pure-function split engine — no DI, no NestJS dependency.

- `split.engine.ts` — `calculateSplit(input, workspaceId?)`:
  - Priority: Kloel (fee + interest) → Supplier (fixed) → Affiliate (%) → Coproducer (%) → Manager (%) → Seller (residue).
  - All amounts in `bigint` cents. Percentages in basis points (4000 = 40%).
  - `commissionBase` = `saleValue - marketplaceFee` (not raw remaining).
  - Residue absorbed by Kloel.
  - Invariant: Σ(splits.amount) + kloelTotal + residue === buyerPaid.
- `split.types.ts` — `SplitInput`, `SplitOutput`, `SplitLine`, `SplitRole`, `SupplierInput`, `PercentRoleInput`.
- `split.controller.ts` — `SplitController`: `POST /payments/split/:workspaceId/preview` for admin preview.

##### `payments/stripe/` (5 files)
**Purpose:** Sale charge creation and webhook settlement processor.

- `stripe-charge.service.ts` — `StripeChargeService.createSaleCharge()`:
  - Receives seller `stripeAccountId` and split config.
  - Calls `calculateSplit()` to produce split lines.
  - Creates `stripe.paymentIntents.create()` with `transfer_group` and split_lines in metadata.
  - Returns `paymentIntentId`, `clientSecret`, `transferGroup`, `splitOutput`.
- `stripe-charge.types.ts` — `CreateSaleChargeInput`, `CreateSaleChargeResult`.
- `stripe-webhook.processor.ts` — `StripeWebhookProcessor.processSaleSucceeded()`:
  - Reads `split_lines` from PaymentIntent metadata.
  - For each line: dispatches `stripe.transfers.create()` to connected account (idempotency key: `${piId}:${role}`).
  - For each line: `LedgerService.creditPending()` (idempotent on `sale:${piId}:${role}`).
  - Returns `ConnectPostSaleSnapshot` for reversal tracking.

##### `payments/fraud/` (8 files)
**Purpose:** Pre-charge antifraud engine.

- `fraud.engine.ts` — `FraudEngine`:
  - `evaluate(ctx)` — Returns `{ action: 'allow' | 'review' | 'require_3ds' | 'block', score, reasons }`.
  - **Blacklist** (Postgres `FraudBlacklist`): CPF, CNPJ, EMAIL, IP, DEVICE_FINGERPRINT, CARD_BIN.
  - **Velocity** (Redis sliding window): IP, device, email, document — configurable limits per window.
  - **Soft signals**: missing identifier (no email/CPF/CNPJ), foreign BIN (card country ≠ BR), IP mismatch, high amount (≥ R$1000 triggers 3DS).
  - All thresholds configurable via env vars (`FRAUD_BLOCK_THRESHOLD`, etc.).
  - `addToBlacklist()`, `listBlacklist()`, `removeFromBlacklist()` for admin.
- `fraud.types.ts` — `FraudCheckoutContext`, `FraudDecision`, `FraudReason`, `AddBlacklistInput`.
- `fraud.module.ts` — Isolated `FraudModule` so consumers don't pull in the full PaymentsModule.

##### `payments/payments.module.ts`
Aggregates all payment providers into a single NestJS module. Exports: `LedgerService`, `ConnectService`, `ConnectPayoutService`, `ConnectReversalService`, `FraudModule`, `StripeChargeService`, `StripeWebhookProcessor`, `ConnectLedgerMaturationService`, `ConnectLedgerReconciliationService`.

---

### 2. Billing (`billing/`)

**Path:** `backend/src/billing/`  
**33 files** — SaaS subscription billing, plan limits, and Stripe integration.

#### Key Files

- `billing.module.ts` — Aggregates: `BillingService`, `BillingWebhookService`, `PlanLimitsService`, `PaymentMethodService`, `StripeService`. Controllers: `BillingController`, `PaymentMethodController`.

- `stripe.service.ts` — **Single source** for the Stripe SDK instance:
  - Lazy initialization with `STRIPE_API_VERSION = '2026-04-22.dahlia'`.
  - Live-mode guard: refuses `sk_live_*` unless `NODE_ENV=production` AND `KLOEL_LIVE_MODE=confirmed`.
  - `retrieveBalance()` for health probes.

- `stripe-types.ts` — Unwrapped Stripe type aliases: `StripeBalance`, `StripeCustomer`, `StripeSubscription`, `StripePaymentIntent`, `StripeAccount`, `StripeEvent`, etc.

- `billing.service.ts` — Facade delegating to sub-services:
  - `getSubscription()`, `activateTrial()`, `getUsage()`, `createCheckoutSession()`, `handleWebhook()`, `cancelSubscription()`.

- `billing.controller.ts` — `BillingController`:
  - `GET /billing/status` — Combined subscription + usage for billing page.
  - `GET /billing/subscription` — Subscription details.
  - `GET /billing/usage` — Usage (messages, flows, contacts).
  - `POST /billing/activate-trial` — 7-day trial.
  - `POST /billing/cancel` — Cancel subscription.
  - `POST /billing/checkout` — Create Stripe Hosted Checkout session.
  - `POST /billing/webhook` — Stripe webhook handler (public endpoint).

- `plan-limits.service.ts` — `PlanLimitsService` — Per-plan resource enforcement:
  - Plans: FREE, STARTER, PRO, ENTERPRISE (unlimited).
  - Limits: flows, campaigns, messages/month (Redis), messages/minute (Redis), messages/day (Postgres `DailyMessageCounter`), instances, flow runs/min, AI tokens/month.
  - `ensureFlowLimit()`, `ensureCampaignLimit()`, `trackMessageSend()`, `ensureMessageRate()`, `ensureDailyMessageQuota()`, `ensureFlowRunRate()`, `ensureTokenBudget()`, `trackAiUsage()`.

- `billing-plan-features.ts` — `activatePlanFeatures()` — Post-subscription activation: writes plan metadata into workspace `providerSettings`.

- `billing-webhook.service.ts` — Stripe webhook orchestration (checkout completed, subscription updated, payment failed, etc.).
- `billing-subscription.service.ts` — Subscription lifecycle (create, retrieve, cancel).
- `billing-checkout-webhook.service.ts` — Handle Stripe Checkout Session webhooks.
- `billing-subscription-status.helper.ts` — Normalizes subscription status across Stripe states.

- `stripe-runtime.ts` — Thin wrapper around `new Stripe(key, config)`.
- `stripe.constants.ts` — Pinned API version: `2026-04-22.dahlia`.

- `payment-method.service.ts` / `payment-method.controller.ts` — Card payment method management for SaaS billing.
- `billing-checkout-helper.service.ts` — Shared checkout logic.
- `billing-webhook.helpers.ts` / `billing-webhook.types.ts` / `billing-webhook.fulfillment.ts` / `billing-webhook.cancel.ts` / `billing-webhook.sync-subscription.ts` — Webhook handler decomposition.

---

### 3. Checkout (`checkout/`)

**Path:** `backend/src/checkout/`  
**86 files** — Public-facing checkout funnel: products, plans, order management, payment processing, post-payment effects.

#### Architecture

The `CheckoutService` is a **facade** that delegates to four focused sub-services:

```typescript
CheckoutService
├── CheckoutProductService   // Products, Plans, Config, Checkout links
├── CheckoutCatalogService   // Bumps, Upsells, Coupons, Pixels, Shipping
├── CheckoutOrderService     // Order create, status, upsell accept/decline
└── CheckoutOrderQueryService // Order queries & listing
```

#### Key Services

- **`checkout.service.ts`** — `CheckoutService` facade:
  - Delegates all CRUD to sub-services.
  - Owns public lookup flows: `getCheckoutBySlug()` and `getCheckoutByCode()`.
  - `duplicateCheckout()` for cloning checkout layouts.
  - Coordinated lookups across product + plan-link + affiliate domains.

- **`checkout-product.service.ts`** — `CheckoutProductService`:
  - Product CRUD: `createProduct()`, `updateProduct()`, `listProducts()`, `getProduct()`, `deleteProduct()`.
  - Plan CRUD: `createPlan()`, `updatePlan()`, `deletePlan()`.
  - Checkout (layout) CRUD: `createCheckout()`, `updateConfig()`, `getConfig()`, `resetConfig()`.
  - `syncCheckoutLinks()` — Link plans to checkout layouts via `CheckoutPlanLink`.
  - `ensureLegacyCheckoutForPlan()` — Auto-migration for legacy plans.

- **`checkout-catalog.service.ts`** — `CheckoutCatalogService`:
  - Order Bumps, Upsells, Coupons: create, update, delete, list.
  - Pixels (tracking): create, update, delete.
  - `calculateShipping()` — Correios integration.
  - `validateCoupon()` — Coupon validation with charge types and discount types.

- **`checkout-order.service.ts`** — `CheckoutOrderService`:
  - `createOrder()` — Full order lifecycle: server-side pricing reconciliation, fraud check, payment creation, status management.
  - `getOrder()`, `listOrders()`, `updateOrderStatus()`.
  - `acceptUpsell()`, `declineUpsell()` — Post-purchase upsell management.
  - `getRecentPaidOrders()` — Social proof for checkout page.

- **`checkout-payment.service.ts`** — `CheckoutPaymentService`:
  - `processPayment()` — Central payment orchestration:
    1. FraudEngine.evaluate()
    2. Create CheckoutOrder (PENDING)
    3. StripeChargeService.createSaleCharge()
    4. Return clientSecret / pixQrCode
  - Handles CREDIT_CARD, PIX, BOLETO.
  - Maps Stripe statuses to internal statuses.

- **`checkout-post-payment-effects.service.ts`** — Post-payment actions:
  - Facebook CAPI purchase event.
  - Lead conversion (mark social lead as converted).
  - Auto-enrollment in linked member areas.
  - Spine event emission (post-sale flow triggers).

- **`checkout-public.controller.ts`** — `CheckoutPublicController` (unauthenticated):
  - `GET /checkout/public/:slug` — Lookup checkout by slug.
  - `GET /checkout/public/r/:code` — Lookup by reference code.
  - `POST /checkout/public/order` — Create order.
  - `GET /checkout/public/order/:orderId/status` — Poll order status.
  - `POST /checkout/public/upsell/:orderId/accept/:upsellId` — Accept upsell.
  - `POST /checkout/public/validate-coupon` — Validate coupon.
  - `POST /checkout/public/shipping` — Calculate shipping.
  - `GET /checkout/public/recent-sales` — Social proof (masked names).
  - `POST /checkout/public/social-capture` — Capture social leads.
  - `GET /checkout/public/social-capture/prefill` — Get lead prefill data.

- **`checkout.controller.ts`** — `CheckoutController` (authenticated dashboard):
  - Full CRUD for products, plans, checkouts, bumps, upsells, coupons, pixels, config.
  - Order listing and status management.

#### Key Utilities
- `checkout-order-pricing.util.ts` — Server-side price reconciliation (subtotal, discount, bump total, final total).
- `checkout-marketplace-pricing.util.ts` — Marketplace fee calculation (default 9.9%, configurable).
- `checkout-order.post-payment.ts` — Post-payment execution logic.
- `checkout-social-lead.service.ts` — Social lead capture and enrichment (Google People API integration).
- `checkout-social-recovery.service.ts` — Abandoned checkout recovery.
- `checkout-plan-link.manager.ts` — Plan ↔ Checkout link management.
- `checkout-code.util.ts` — Unique public checkout code generation.
- `checkout-order-status.ts` — Order status values and state machine.
- `facebook-capi.service.ts` — Facebook Conversions API integration for purchase tracking.
- `mercado-pago-pix.service.ts` / `mercado-pago-webhook.controller.ts` — Mercado Pago PIX integration.
- `checkout-shipping-profile.util.ts` — Correios shipping calculation.
- `checkout-public-payload.builder.ts` — Builds the public checkout page payload.

#### DTOs (15 files)
`create-product.dto.ts`, `create-plan.dto.ts`, `create-bump.dto.ts`, `create-upsell.dto.ts`, `create-coupon.dto.ts`, `create-pixel.dto.ts`, `create-order.dto.ts`, `update-order-status.dto.ts`, `update-config.dto.ts`, `validate-coupon.dto.ts`, `calculate-shipping.dto.ts`, `capture-social-lead.dto.ts`, `update-social-lead.dto.ts`, `google-people-profile.dto.ts`.

---

### 4. Wallet (`wallet/`)

**Path:** `backend/src/wallet/`  
**15 files** — Prepaid wallet for usage-metered services (AI agents, WhatsApp, API calls).

- **`wallet.service.ts`** — `WalletService`:
  - `createTopupIntent()` — Create Stripe PaymentIntent for wallet top-up. Passes through FraudEngine. Supports `pix` and `card` methods. Auto-creates wallet on first top-up via `upsert`.
  - `creditFromWebhook()` — Idempotent credit on `payment_intent.succeeded` webhook. Returns null if not a wallet top-up.
  - `chargeForUsage()` — Atomic usage debit. Two billing modes:
    - **Catalog:** units × per-unit price from `UsagePrice` table.
    - **Provider quote:** direct `quotedCostCents` for LLM billing.
    - Idempotent on `(reference_type='usage:<operation>', reference_id=requestId)`.
  - `settleUsageCharge()` — Reconcile estimated debit against exact provider cost after upstream completes.
  - `refundUsageCharge()` — Credit back when downstream operation fails after debiting.
  - `getBalance()` — Read current balance.
  - **All writes** inside `prisma.$transaction`.

- **`wallet.types.ts`** — Types: `CreateTopupIntentInput`, `ChargeUsageInput`, `ChargeUsageResult`, `SettleUsageInput`, `RefundUsageInput`, custom errors.
- **`wallet.module.ts`** — Imports `BillingModule` (for StripeService), `FraudModule`, `PrismaModule`.
- **`prepaid-wallet.controller.ts`** — Admin endpoints for wallet management.
- **`provider-pricing.ts`** / `provider-pricing.helpers.ts` — LLM provider pricing configuration.
- **`provider-llm-billing.ts`** — LLM-specific billing logic.

---

### 5. Marketplace (`marketplace/`)

**Path:** `backend/src/marketplace/`  
**5 files** — Flow template marketplace (not to be confused with the affiliate marketplace or the payment marketplace).

- **`marketplace.service.ts`** — `MarketplaceService`:
  - `listTemplates(category?)` — List public flow templates ordered by downloads.
  - `installTemplate(workspaceId, templateId)` — Install a flow template into a workspace's flows. Increments download counter.

- **`marketplace.controller.ts`** — `MarketplaceController`:
  - `GET /marketplace/templates` — List templates.
  - `POST /marketplace/install/:templateId` — Install template.

> **Note:** This is the *WhatsApp flow template* marketplace. The *affiliate product* marketplace lives in `affiliate/affiliate-marketplace.controller.ts`. The *payment marketplace* (Stripe Connect) logic is in `payments/connect/`.

---

### 6. Marketplace Treasury (`marketplace-treasury/`)

**Path:** `backend/src/marketplace-treasury/`  
**11 files** — Kloel's own treasury wallet for marketplace fees.

- **`marketplace-treasury.service.ts`** — `MarketplaceTreasuryService`:
  - Append-only ledger with `MarketplaceTreasuryBucket` (AVAILABLE, PENDING, RESERVED).
  - `readBalance(currency)` — Read treasury balance (upserts on first access).
  - `listLedger(filters)` — Paginated ledger listing.
  - `append(input, tx?)` — Atomic append + balance mutation inside transaction.
  - `debitAvailableForPayout(input)` — Debit AVAILABLE for platform payout. Idempotent on `(kind=PAYOUT_DEBIT, orderId=requestId)`.
  - `creditAvailableByAdjustment(input)` — Credit AVAILABLE for failed payout reversals. Idempotent on `(kind=ADJUSTMENT_CREDIT, orderId=requestId)`.

- **`marketplace-treasury-maturation.service.ts`** — Cron-driven maturation (every minute):
  - Scans PENDING `MARKETPLACE_FEE_CREDIT` entries past due.
  - Moves from PENDING to AVAILABLE via paired DEBIT/CREDIT adjustments.
  - Idempotency via synthetic order IDs: `mature:pending:<id>` and `mature:available:<id>`.
  - Max 500 entries per run.

- **`marketplace-treasury-payout.service.ts`** — Platform-level Stripe payout:
  - Debits treasury AVAILABLE, calls `stripe.payouts.create()` on behalf of Kloel's own Stripe account.
  - On failure: credits back via adjustment + financial alert.

- **`marketplace-treasury-reconcile.service.ts`** — Reconciliation between Stripe balance and local treasury ledger.
- **`marketplace-treasury.errors.ts`** — `MarketplaceTreasuryInsufficientAvailableBalanceError`.

- **`marketplace-treasury.module.ts`** — Exports all four services.

---

### 7. Member Area (`member-area/`)

**Path:** `backend/src/member-area/`  
**11 files** — Courses, communities, memberships with modules and lessons.

#### Controllers (split into 4 focused controllers under `/member-areas`)

- **`member-areas.controller.ts`** — `MemberAreasController`:
  - `GET /member-areas` — List areas (filterable by type, active, search).
  - `GET /member-areas/stats` — Workspace stats (total/active areas, students, avg completion).
  - `GET /member-areas/:id` — Get area with modules and lessons.
  - `POST /member-areas` — Create area (auto-generates slug).
  - `PUT /member-areas/:id` — Update area.
  - `DELETE /member-areas/:id` — Delete area (with audit log).

- **`member-modules.controller.ts`** — `MemberModulesController`:
  - `POST /member-areas/:id/modules` — Create module.
  - `PUT /member-areas/:id/modules/:moduleId` — Update module.
  - `DELETE /member-areas/:id/modules/:moduleId` — Delete module.
  - `POST /member-areas/:id/modules/:moduleId/lessons` — Create lesson.
  - `PUT /member-areas/:id/lessons/:lessonId` — Update lesson.
  - `DELETE /member-areas/:id/lessons/:lessonId` — Delete lesson.

- **`member-enrollments.controller.ts`** — `MemberEnrollmentsController`:
  - `GET /member-areas/:id/students` — List students.
  - `POST /member-areas/:id/students` — Enroll student.
  - `PUT /member-areas/:id/students/:studentId` — Update student.
  - `DELETE /member-areas/:id/students/:studentId` — Remove student.
  - `POST /member-areas/:id/lessons/:lessonId/complete` — Mark lesson complete, recalculate progress.

- **`member-structure.controller.ts`** — `MemberStructureController`:
  - `POST /member-areas/:id/generate-structure` — AI-assisted template scaffolding. Templates: COURSE (3 modules), COMMUNITY (1 module), HYBRID (4 modules), MEMBERSHIP (4 modules).

- **`member-area-public.controller.ts`** — `MemberAreaPublicController` (unauthenticated):
  - `GET /member-areas/public/:slug` — Public area info.
  - `POST /member-areas/public/:slug/access` — Request access token (HMAC-signed JWT, 7-day TTL).
  - `GET /member-areas/public/:slug/content?token=...` — Get full content (modules + lessons) with verified access token.

- **`member-area-stats.service.ts`** — `MemberAreaStatsService`:
  - `recalculate(areaId, workspaceId)` — Denormalized counter recomputation: totalStudents, avgCompletion, totalModules, totalLessons.
  - Called after every enrollment mutation.

- **`member-area.helpers.ts`** — Shared types (`CreateMemberAreaDto`, `UpdateMemberAreaDto`, `CreateModuleDto`, `CreateLessonDto`, `EnrollStudentDto`), slug generation regexes, `serializeArea()`, `readText()`.

---

### 8. Affiliate (`affiliate/`)

**Path:** `backend/src/affiliate/`  
**7 files** — Affiliate system: product listing, affiliation requests, marketplace browsing.

- **`affiliate.controller.ts`** — `AffiliateController`:
  - `POST /affiliate/request/:productId` — Request affiliation (KYC-guarded). Auto-approves if `approvalMode === 'AUTO'`, generates affiliate link immediately.
  - `GET /affiliate/my-products` — Products I'm affiliated with (enriched with product/workspace/rating data).
  - `GET /affiliate/my-links` — My affiliate links with metrics (clicks, sales, revenue, commission).
  - `POST /affiliate/list-product/:productId` — List a product on the marketplace (KYC-guarded).
  - `PUT /affiliate/config/:productId` — Configure commission, approval mode, etc.
  - `POST /affiliate/saved/:productId` — Save product to wishlist.
  - `DELETE /affiliate/saved/:productId` — Unsave product.

- **`affiliate-marketplace.controller.ts`** — `AffiliateMarketplaceController`:
  - `GET /affiliate/marketplace` — Browse listed products (paginated, sortable).
  - `GET /affiliate/marketplace/stats` — Global marketplace stats.
  - `GET /affiliate/marketplace/categories` — Categories with product counts.
  - `GET /affiliate/marketplace/recommended` — Top-temperature products.
  - `POST /affiliate/ai-search` — AI-powered search (currently query-based on categories/tags).
  - `POST /affiliate/suggest` — Suggest products based on workspace's own product categories.

- **`affiliate-helpers.ts`** — Core enrichment logic:
  - `enrichAffiliateProducts()` — Joins affiliate products with product data, workspace names, reviews, viewer's request/link status.
  - `buildEnrichedAffiliateProduct()` — Single product enrichment.
  - `serializeAffiliateProductForResponse()` — Normalize storage URLs.
  - `buildAffiliateLinkUrl()` — Build `pay.kloel.com/r/:code` checkout URL.
  - `buildMarketplaceWhere()` — Prisma where clause builder.

- **`affiliate.module.ts`** — Imports `KycModule` for KYC-guarded endpoints.

---

### 9. Product Categories (`product-categories/`)

**Path:** `backend/src/product-categories/`  
**5 files** — Simple module for listing distinct product categories.

- **`product-categories.service.ts`** — `ProductCategoriesService`:
  - `listByWorkspace(workspaceId)` — Returns distinct `{ category }` from active products in workspace.

- **`product-categories.controller.ts`** — `ProductCategoriesController`:
  - `GET /product-categories` — List workspace categories.

---

### 10. Launch (`launch/`)

**Path:** `backend/src/launch/`  
**6 files** — WhatsApp group launcher for product launches.

- **`launch.service.ts`** — `LaunchService`:
  - `listLaunchers(workspaceId)` — List launchers with groups.
  - `createLauncher(workspaceId, data)` — Create launcher (status: ACTIVE, auto-slug).
  - `addGroup(workspaceId, launcherId, data)` — Add WhatsApp group with invite link, capacity tracking.
  - `generateStartLink(workspaceId, flowId, customCommand?)` — Generate `wa.me` link with flow start command.
  - `trackClick(launcherId)` — Increment click counter.
  - `getRedirectLink(slug)` — Find first non-full group, return WhatsApp invite link.

- **`launch.controller.ts`** — `LaunchController`:
  - `GET /launch/launchers` — List launchers.
  - `POST /launch/launcher` — Create launcher.
  - `POST /launch/launcher/:id/groups` — Add group.
  - `GET /launch/join/:slug` — **Public endpoint**: redirect to WhatsApp group. URL validation against allowed hosts.

---

### 11. Contracts (`contracts/`)

**Path:** `backend/src/contracts/`  
**4 files** — Shared contracts between backend and frontend/worker.

- **`autopilot-jobs.ts`** — Queue contract for autopilot sweep-unread-conversations job:
  - Defines `AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB` constant.
  - `parseSweepUnreadConversationsJobData()` / `buildSweepUnreadConversationsJobData()`.
  - Backlog modes: `reply_all_recent_first`, `reply_only_new`, `prioritize_hot`.
  - **CI-enforced byte-for-byte equality** with worker copy.

- **`schemas.ts`** — Zod API contract schemas:
  - Auth: `AuthLoginResponseSchema`, `AuthRegisterResponseSchema`, `AuthRefreshResponseSchema`, `AuthCheckEmailResponseSchema`.
  - Billing: `BillingSubscriptionResponseSchema`, `BillingCheckoutResponseSchema`.
  - Workspace: `WorkspaceMeResponseSchema`.
  - WhatsApp: `WhatsAppStatusResponseSchema`, `WhatsAppStartSessionResponseSchema`, `WhatsAppQrResponseSchema`.
  - Health: `HealthLivenessResponseSchema`, `HealthReadinessResponseSchema`.
  - Webhook: `WebhookDuplicateResponseSchema`.
  - **CI-enforced byte-for-byte equality** with `frontend/src/__tests__/contracts/schemas.ts`.

- **`schemas.ts` commentary** — Documents the "Frontend Freeze by Contract" invariant: HTTP contract shapes are frozen during P2/P3/P4 refactors.

---

### 12. Post-Sale (`post-sale/`)

**Path:** `backend/src/post-sale/`  
**1 file** — Thin module wrapping event emitter.

- **`post-sale.module.ts`** — Imports `SpineModule`, provides/exports `PostSaleEventEmitterService`.
  - The actual post-sale effect logic lives in `checkout/checkout-post-payment-effects.service.ts`.
  - This module exists as a dedicated DI container for post-sale event subscribers.

---

## File Count Summary

| Module | .ts files |
|---|---|
| `checkout/` | 86 |
| `payments/` | 58 |
| `billing/` | 33 |
| `wallet/` | 15 |
| `member-area/` | 11 |
| `marketplace-treasury/` | 11 |
| `affiliate/` | 7 |
| `launch/` | 6 |
| `marketplace/` | 5 |
| `product-categories/` | 5 |
| `contracts/` | 4 |
| `post-sale/` | 1 |
| **Total** | **242** |

---

## Data Flow: A Sale from Click to Payout

```
1. Buyer visits public checkout page
   → GET /checkout/public/:slug
   → CheckoutService.getCheckoutBySlug()
   → CheckoutPublicPayloadBuilder.build()

2. Buyer submits order
   → POST /checkout/public/order
   → CheckoutOrderService.createOrder()
   → CheckoutPaymentService.processPayment()
      → FraudEngine.evaluate()          ← Blacklist + Velocity + Soft signals
      → Prisma: create CheckoutOrder    ← status=PENDING
      → StripeChargeService.createSaleCharge()
         → SplitEngine.calculateSplit() ← Pure function, no DI
         → stripe.paymentIntents.create() ← transfer_group + metadata.split_lines

3. Frontend confirms payment (Stripe.js / PIX QR)

4. Stripe sends webhook: payment_intent.succeeded
   → StripeWebhookProcessor.processSaleSucceeded()
      → For each split line:
         → stripe.transfers.create()              ← To connected account
         → LedgerService.creditPending()          ← Local ledger CREDIT_PENDING
      → CheckoutPostPaymentEffectsService
         → Facebook CAPI purchase event
         → Mark social lead converted
         → Auto-enroll in linked member areas
         → Spine event emission (post-sale flow triggers)

5. Maturation (cron, every N minutes):
   → ConnectLedgerMaturationService
      → LedgerService.moveFromPendingToAvailable()
         ← Subtract PENDING, add AVAILABLE, insert MATURE row

6. Seller/admin requests payout:
   → POST /payments/connect/:workspaceId/payouts
   → ConnectPayoutApprovalService.createRequest()  ← Approval workflow
   → ConnectPayoutService.createPayout()
      → LedgerService.debitAvailableForPayout()    ← Atomic AVAILABLE debit
      → stripe.payouts.create()                    ← Manual payout to bank
      → On failure: LedgerService.creditAvailableByAdjustment()
                    + FinancialAlertService
```

---

## Improvement Suggestions

### 1. Architecture
- **No `products/` directory**: Products are managed inside `checkout/`. Consider extracting `CheckoutProductService` into a shared `products/` module if product management diverges from checkout.
- **`checkout/` is monolithic (86 files)**: Consider splitting into sub-modules: `checkout/products/`, `checkout/orders/`, `checkout/public/`, `checkout/social/`.
- **`PostSaleModule` is nearly empty**: The actual post-sale effects live in `checkout/checkout-post-payment-effects.service.ts`. Consider consolidating.

### 2. Type Safety
- **Stripe types use SDK-v22 compat pattern**: The `Unwrap<>` type in `stripe-types.ts` strips `lastResponse`. This works but is fragile across SDK upgrades. Consider using Stripe's official type exports if they've stabilized.
- **BigInt serialization**: Multiple services manually convert `bigint` to string for JSON. A centralized `BigIntSerializer` utility would reduce duplication.

### 3. Idempotency
- **Consistent pattern**: All ledger writes use DB-level idempotency (unique constraint on `referenceType + referenceId + type`). Stripe API calls use `idempotencyKey`. ✅ Good.
- **Gap**: Checkout order creation (`createOrder`) at HTTP layer uses `@Idempotent()` guard but the DB doesn't have a unique constraint. Webhook retries could create duplicate orders.

### 4. Observability
- **FraudEngine logs decisions as JSON strings** via `this.logger.warn(JSON.stringify({...}))`. Structured logging would be more queryable.
- **No OpenTelemetry spans**: Financial operations (`creditPending`, `debitForPayout`, `createSaleCharge`) would benefit from distributed tracing spans for debugging split-engine reconciliation issues.

### 5. Testing
- **Heavy spec file presence**: `payments/` has 58 files with ~25 spec files — good coverage. `checkout/` has ~25 spec files out of 86 — some services may be under-tested.
- **No integration tests for end-to-end payment flow**: The individual services are well-tested but the full flow (order → payment → webhook → ledger → payout) lacks an integration spec.

### 6. Configuration
- **FraudEngine thresholds are env-configurable + hardcoded fallbacks**: Good for operations. Consider adding runtime admin endpoints to read/edit thresholds without redeploy.
- **Marketplace fee (9.9%) is hardcoded** in `checkout-order.service.ts` as `DEFAULT_MARKETPLACE_FEE_PERCENT`. Already overridable via `CheckoutProductConfigService`, but the default should be documented.

### 7. Risk Areas
- **`InsufficientAvailableBalanceError` can drive AVAILABLE negative**: Chargebacks and refunds explicitly allow this. Ensure reconciliation alerts catch persistent negative balances.
- **Manual payout schedule retry for non-BR countries**: `ConnectService.createCustomAccount()` has a BR-specific manual-payout fallback. Non-BR connected accounts may need a different payout strategy.
- **No circuit breaker on Stripe API calls**: If Stripe is degraded, no retry-with-backoff or graceful degradation exists at the service level (SDK-level `maxNetworkRetries: 2` only).

---

## Key Dependencies Between Modules

```
CheckoutModule
├── imports: PaymentsModule       ← StripeChargeService, FraudEngine
├── imports: MarketplaceTreasuryModule  ← Fee credit recording
├── imports: SpineModule         ← Event emission
└── imports: FollowUpModule      ← Post-sale follow-up

PaymentsModule
└── imports: BillingModule       ← StripeService

WalletModule
├── imports: BillingModule       ← StripeService
└── imports: FraudModule         ← FraudEngine
```
