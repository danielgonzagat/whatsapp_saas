# Wave 3 — Checkout-to-Ledger Flow Trace

> Authored by PI atomic subagent `w3-checkout-flow` (DeepSeek V4 Pro,
> ~20k events). Written by the subagent via atomic_author.
> Run date: 2026-05-26.


## Methodology

Traced via read-only source analysis of the Kloel monorepo, starting from
`frontend/src/app/(checkout)/[slug]/page.tsx` and following HTTP calls through
the NestJS controller layer (`backend/src/checkout/checkout-public.controller.ts`),
the checkout service façade (`checkout.service.ts`), specialized sub-services
(order, payment, catalog, product), the Stripe charge layer, the webhook
receiver, the settlement processor, and finally the LedgerService and
post-payment fulfillment pipeline. Every hop cites exact file:line anchors.
The trace focuses on the **card / Stripe-only happy path** per ADR-0003.## Architecture summary

```
  Browser                        NestJS Backend                          Stripe API
 ────────── ───────────────────────────────────────────────────────────── ──────────
  [1] GET /checkout/public/:slug → CheckoutPublicController.getCheckoutBySlug
                                   → CheckoutService.getCheckoutBySlug
                                     → Prisma (CheckoutPlanLink + Plan + Product + Config)
                                   ← PublicCheckoutResponse
  [2] CheckoutShell renders ────→ choose product / fill form
  [3] POST /checkout/public/order → CheckoutPublicController.createOrder (@Idempotent)
                                     → CheckoutService.createOrder
                                       → CheckoutOrderService.createOrder
                                         → $transaction: CheckoutOrder.create
                                         → CheckoutPaymentService.processPayment
                                           → FraudEngine.evaluate
                                           → StripeChargeService.createSaleCharge
                                             → SplitEngine.calculateSplit
                                             → stripe.paymentIntents.create ──────────→ [PI created]
                                           ← clientSecret + paymentIntentId
                                     ← { order, paymentData }
  [4] Browser confirms card ─────→ stripe.confirmCardPayment(clientSecret) ─────────→ [3DS / auth]

 ──── Webhook (async) ────────────────────────────────────────────────────
  [5] POST /webhook/payment/stripe → PaymentWebhookStripeController.handleStripe
                                      → signature verify (STRIPE_WEBHOOK_SECRET)
                                      → Redis idempotency (SET NX EX 300)
                                      → Prisma WebhookEvent.create (P2002 dupe guard)
                                      → handlePaymentIntentEvent
                                        → StripeWebhookProcessor.processSaleSucceeded
                                          → forEachSequential over split_lines:
                                            → stripe.transfers.create (per stakeholder)
                                            → LedgerService.creditPending (per stakeholder)
                                        → StripeWebhookLedgerService.*
                                        → Order: PROCESSING → PAID
                                      ← { received: true }
```## Hop-by-hop map

### Hop 1: Public checkout page render

- **Route:** Next.js App Router dynamic route `[slug]`
  - `frontend/src/app/(checkout)/[slug]/page.tsx:48` — `CheckoutPage` server component
- **Server fetch (metadata):** `page.tsx:13` — `fetch(\`/checkout/public/${slug}\`)` with `next: { revalidate: 60 }` for `generateMetadata` (SEO).
- **Client fetch (data):** `frontend/src/app/(checkout)/components/CheckoutShell.tsx:43-45` —
  `useEffect`-triggered `fetch(\`${API_BASE}/checkout/public/${slug}\`)`
- **Backend controller:** `backend/src/checkout/checkout-public.controller.ts:148-156`
  `@Get(':slug') getCheckoutBySlug()` → delegates to `CheckoutService.getCheckoutBySlug()`
- **Service layer:** `backend/src/checkout/checkout.service.ts:167-245`
  `CheckoutService.getCheckoutBySlug()`:
  1. Queries `checkoutPlanLink` (join table) with `slug + isActive` on link, checkout, and plan — `checkout.service.ts:181-196`
  2. Falls back to `checkoutProductPlan.findUnique({ where: { slug } })` — `checkout.service.ts:200-208`
  3. Falls back to `getCheckoutByCode()` → `checkout-code-lookup.helper.ts` — `checkout.service.ts:245`
- **DB read:** `CheckoutPlanLink` JOIN `Checkout` (kind='CHECKOUT'), `CheckoutConfig`, `Pixels`, `Plan` (kind='PLAN') with `OrderBumps`, `Upsells` — all filtered by `isActive: true`
- **Payload builder:** `checkout-public-payload.builder.ts` — resolves workspace fiscal snapshot, branding, merchant info, payment provider, affiliate context
- **Branch points:**
  - No active `CheckoutPlanLink` → falls back to legacy `CheckoutProductPlan` with `legacyCheckoutEnabled` flag
  - No plan found → `getCheckoutByCode()` for reference-code lookup
  - Both fail → client sees error state (`"Checkout nao encontrado"`)
- **Honest-state coverage:**
  - **empty:** ✅ — Initial `useState(null)` is quickly replaced; the `loading` state covers the initial condition
  - **loading:** ✅ — `CheckoutShell.tsx:66-101` shows branded spinner with `"Carregando checkout..."` text
  - **error:** ✅ — `CheckoutShell.tsx:105-139` shows branded error with `"Checkout nao encontrado"` + server error message
  - **setup-required:** ❌ — No explicit "this checkout is not configured" state. The error state is generic — user cannot distinguish "slug not found" from "workspace setup incomplete".### Hop 2: User fills form and submits order

- **Frontend entry:** `CheckoutBlancSocial` / `CheckoutNoirSocial` components render the checkout form (customer name, email, CPF, phone, shipping, payment method selection). For card payments, `StripePaymentElement` renders a Stripe Elements form.
- **Order creation:** User clicks pay → `StripePaymentElement.tsx:194-211` `handleSubmit` fires:
  1. `finalizeCheckoutOrder()` in `checkout-order-submit.ts:216-217`
  2. Calls `createOrder(payload)` in `useCheckout.ts:176-177`
  3. `fetch(\`${API_BASE}/checkout/public/order\`, { method: 'POST', body: JSON.stringify(payload) })`
- **Backend controller:** `checkout-public.controller.ts:160-178`
  `@Post('order') @Idempotent() createOrder()` → `checkoutService.createOrder()`
- **Request shape:** `CreateOrderDto` — `checkout/dto/create-order.dto.ts`
  Fields: `planId`, `workspaceId`, `customerName`, `customerEmail`, `customerCPF`, `customerPhone`, `paymentMethod`, `totalInCents`, `subtotalInCents`, `discountInCents`, `bumpTotalInCents`, `installments`, `couponCode`, `shippingAddress`, `acceptedBumps`, UTM params, `checkoutCode`, `affiliateId`, `deviceFingerprint`.

### Hop 3: Order record creation (server-side)

- **Service:** `backend/src/checkout/checkout-order.service.ts:56-147` `createOrder()`
  1. `orderSupport.resolvePlanForOrder()` — `checkout-order-support.ts:375-413` — validates plan exists and belongs to workspace
  2. `orderSupport.resolveAffiliateLink()` — `checkout-order-support.ts:355-373` — resolves affiliate from checkoutCode
  3. `normalizeCheckoutOrderQuantity()` — clamps quantity to plan.quantity cap
  4. `calculateCheckoutServerTotals()` — `checkout-order-pricing.util.ts` — server-side price reconciliation (prevents client tampering)
  5. `buildCheckoutMarketplacePricing()` — `checkout-marketplace-pricing.util.ts` — computes marketplace fee, interest, seller receivable
  6. `buildCheckoutOrderMetadata()` — `checkout-order-metadata.util.ts` — assembles qualityGate, lineItems, affiliate, marketplacePricing, clientTotals
  7. `prisma.$transaction` (ReadCommitted isolation):
     - Idempotency check: `checkoutOrder.findFirst({ metadata.path: ['correlationId'] })` — prevents duplicate orders
     - `checkoutOrder.create()` — `checkout-order.service.ts:221-286` — writes to `CheckoutOrder` table
- **Branch points:**
  - `paymentMethod === 'BOLETO'` → throws `BadRequestException` (boleto disabled in Stripe-only flow) — `checkout-order.service.ts:192-195`
  - Existing order with same correlationId → idempotent replay (returns existing order, re-runs payment)
  - Coupon code present → validates via `catalogService.validateCoupon()`; invalid → throws before DB write
  - `installments` normalized to 1 for non-CREDIT_CARD methods

### Hop 4: Payment processing (card) — Stripe PaymentIntent creation

- **Service:** `checkout-order.service.ts:363-372` calls `processOrderPostPayment()`
- **Delegates to:** `checkout-order-payment.helpers.ts:50-110` `processOrderPostPayment()` → `paymentService.processPayment()`
- **CheckoutPaymentService.processPayment:** `checkout-payment.service.ts:300-470`
  1. `findOrder()` — `checkout-payment.service.ts:473-484` — loads order with plan+product
  2. **E2E guard:** `this.e2EGuard.isEnabled()` — short-circuits with stub result in non-production when STRIPE_SECRET_KEY is unset — `checkout-payment.service.ts:330-338`
  3. **Fraud check:** `fraudEngine.evaluate()` — `checkout-payment.service.ts:346-369` — evaluates buyer email, CPF, IP, device fingerprint, card BIN, amount
     - `action='block'` → throws `BadRequestException('Pagamento bloqueado pela política antifraude.')` — `checkout-payment.service.ts:372-376`
     - `action='review'` → throws `BadRequestException('Pagamento retido para revisão manual.')` — `checkout-payment.service.ts:378-382`
     - `action='require_3ds'` + `paymentMethod='CREDIT_CARD'` → `forceThreeDS=true` — `checkout-payment.service.ts:384`
  4. `ensureSellerStripeAccountId()` — `checkout-payment.service.ts:486-520` — looks up `ConnectAccountBalance` for SELLER account; creates Stripe Custom account if missing
  5. `stripeCharge.createSaleCharge()` — `checkout-payment.service.ts:389-399` → `stripe-charge.service.ts:32-108`### Hop 5: Stripe PaymentIntent API call

- **Service:** `backend/src/payments/stripe/stripe-charge.service.ts:32-108` `createSaleCharge()`
  1. `calculateSplit(splitInput)` — `backend/src/payments/split/split.engine.ts` — computes stakeholder splits (seller, kloel marketplace, affiliate, coproducer, manager) and serializes `split_lines` into PaymentIntent metadata
  2. `stripe.paymentIntents.create()` — **Stripe API call** — `stripe-charge.service.ts:89-104`
     - Amount, currency, payment_method_types, transfer_group, metadata (type='sale', workspace_id, kloel_order_id, split_kloel_cents, split_seller_cents, split_residue_cents, split_lines JSON)
     - Stripe idempotency key: `sale:${orderId}`
  3. For card payment: `confirm: false` (browser-side confirmation)
  4. Returns `{ paymentIntentId, clientSecret, split, splitInput, stripePaymentIntent }`
- **Branch points:**
  - PIX: `confirm: true` (server-side confirmation), `expires_after_seconds: 1800` — `checkout-payment.service.ts:182-189`
  - 3DS: `request_three_d_secure: 'any'` — `checkout-payment.service.ts:176-182`

### Hop 6: Payment record persistence

- **Service:** `checkout-payment.service.ts:401` `persistPayment()` — `checkout-payment.service.ts:219-297`
  1. `prisma.$transaction` (ReadCommitted):
     - Idempotency: checks for existing `CheckoutPayment` with same `orderId` — if `externalId` matches, returns existing
     - `checkoutPayment.create()` — inserts `CheckoutPayment` row (gateway='stripe', externalId=paymentIntentId, status=APPROVED/PENDING, webhookData with split info)
     - If APPROVED: `transitionOrderToApproved()` — transitions order PENDING→PROCESSING→PAID — `checkout-payment.service.ts:522-568`
  2. Post-payment effects (only on APPROVED):
     - `markLeadConverted()` → `checkout-social-lead.service.ts` → marks captured lead as converted + auto-enrolls in member areas — `checkout-post-payment-effects.service.ts:56-99`
     - `sendPurchaseSignals()` → Facebook CAPI Purchase event + payment confirmation email + spine bridge events — `checkout-post-payment-effects.service.ts:101-109`
- **Branch points:**
  - Card payment rarely approves synchronously (requires 3DS/authentication) — most card payments return `PENDING`/`PROCESSING` status; the actual APPROVED transition happens via webhook
  - PIX payments return `PENDING` with QR code data; approved later via webhook

### Hop 7: Browser-side card confirmation (for card payments)

- **`finalizeCheckoutOrder()` returns** `{ clientSecret, paymentIntentId }` → `StripePaymentElement` calls `stripe.confirmCardPayment(clientSecret)` — `StripePaymentElement.tsx:194-211`
  - On success: redirects to success path (resolved from order result)
  - On error: shows Stripe error message inline
  - 3DS redirect handled by Stripe SDK transparently

### Hop 8: Stripe webhook reception

- **Endpoint:** `POST /webhook/payment/stripe` — `@Public()` (no auth)
- **Controller:** `backend/src/webhooks/payment-webhook-stripe.controller.ts:106-328` `handleStripe()`
  1. **Signature verification:** Iterates over `STRIPE_WEBHOOK_SECRET` + `STRIPE_WEBHOOK_SECRETS` (comma-separated), tries `stripe.webhooks.constructEvent(rawBody, signature, secret)` for each — `controller.ts:139-159`
     - Missing `STRIPE_WEBHOOK_SECRET` in production → `ForbiddenException` — `controller.ts:135-136`
     - Missing `stripe-signature` header → `BadRequestException` — `controller.ts:140-141`
     - Missing `rawBody` → `BadRequestException` — `controller.ts:142-143`
     - All secrets fail → `BadRequestException` — `controller.ts:161-165`
  2. **Event normalization:** Parses Stripe event shape into internal format, handling `v2.core.event` (thin events) and `payment_intent.*` — `controller.ts:173-229`
  3. **Redis idempotency:** `SET webhook:payment:<hash> 1 EX 300 NX` — `controller.ts:337-354` — duplicate → returns `{ received: true, duplicate: true }`
  4. **DB webhook event log:** `webhooksService.logWebhookEvent()` — `WebhookEvent.create()` — `controller.ts:251-265` — P2002 dupe → returns 200
  5. **Route to handler:** `event.type === 'payment_intent.succeeded'` → `handlePaymentIntentEvent()` — `controller.ts:302-307`
- **Branch points:**
  - Non-sale PaymentIntent events (processing, failed, canceled) update `CheckoutPayment.status` and `CheckoutOrder.status` without triggering settlement
  - `payment_intent.succeeded` with `metadata.type !== 'sale'` → skips settlement### Hop 9: Payment intent succeeded — settlement processing

- **Handler:** `backend/src/webhooks/payment-webhook-stripe.handlers2.ts:32-116` `handlePaymentIntentEvent()`
  1. Extracts `workspaceId` and `orderId` from PaymentIntent metadata
  2. Validates workspace exists — `handlers2.ts:47-50`
  3. For non-sale approved intents: updates `CheckoutPayment.status` — `handlers2.ts:59-74`
  4. For sale approved intents (`isApprovedSaleIntent`):
     - **Call `stripeWebhookProcessor.processSaleSucceeded()`** — `handlers2.ts:82-86`
     - **Persist connect post-sale snapshot** — `ledger.persistConnectPostSaleSnapshot()` — `handlers2.ts:88`
     - **Append marketplace treasury credit** — `ledger.appendMarketplaceTreasurySaleCredit()` — `handlers2.ts:89`
     - **Finalize payment + sale records** in transaction — `handlers2.ts:90-107`
  5. **Update order status:** `updateOrderStatusForIntent()` — `handlers2.ts:118-172` — transitions order to PAID (via PROCESSING if needed)
  6. **Mark webhook processed:** `webhooksService.markWebhookProcessed()`

### Hop 10: StripeWebhookProcessor — split settlement + Ledger writes

- **Service:** `backend/src/payments/stripe/stripe-webhook.processor.ts:98-232` `processSaleSucceeded()`
  1. Validates `metadata.type === 'sale'` — `processor.ts:120-129`
  2. Parses `metadata.split_lines` JSON — settlement plan serialized at charge creation
  3. Resolves `sourceChargeId` from `latest_charge`
  4. **`forEachSequential` over split lines:** for each stakeholder (seller, kloel, affiliate, coproducer, manager):
     - Skips lines with `amountCents <= 0`
     - **Resolves `ConnectAccountBalance`** via `connectService.findBalanceByStripeAccountId()` — `processor.ts:187` — throws if missing
     - **Dispatches Stripe transfer:** `stripe.transfers.create()` with `source_transaction=chargeId`, `transfer_group`, idempotency key `${pi}:${role}` — `processor.ts:245-278`
     - **Ledger credit:** `ledgerService.creditPending()` — `processor.ts:206-217` — writes `CREDIT_PENDING` entry for the stakeholder
       - `LedgerService.creditPending()` — `ledger.service.ts:68-134` — `$transaction`:
         - Idempotency: checks `(referenceType, referenceId, type='CREDIT_PENDING')`
         - Updates `ConnectAccountBalance.pendingBalanceCents += amount`
         - Creates `ConnectLedgerEntry` row with `type='CREDIT_PENDING'`, `matured=false`, `scheduledFor=matureAt`
     - For seller line: tracks `sellerDestinationAmountCents` for snapshot
  5. Returns `{ transfersDispatched, ledgerEntriesCreated, connectPostSale }`
- **Idempotency:**
  - Stripe transfer: idempotency key `{paymentIntentId}:{role}` prevents duplicate transfers
  - Ledger: unique constraint on `(reference_type, reference_id, type='CREDIT_PENDING')` prevents duplicate credits

### Hop 11: Marketplace treasury credit

- **Service:** `backend/src/webhooks/stripe-webhook-ledger.service.ts:88-118` `appendMarketplaceTreasurySaleCredit()`
  1. Loads checkout payment context and extracts `splitInput` from `webhookData`
  2. Computes `marketplaceFeeCents + interestCents`
  3. **Appends treasury entry:** `marketplaceTreasury.append()` — credit to `MarketplaceTreasuryBucket.PENDING`, kind=`MARKETPLACE_FEE_CREDIT`
  4. Idempotent on `(orderId, kind)` — P2002 dupe is caught and ignored — `stripe-webhook-ledger.service.ts:221-231`

### Hop 12: Order status → PAID

- **Handler:** `payment-webhook-stripe.handlers2.ts:118-172` `updateOrderStatusForIntent()`
  1. Loads current order status from `CheckoutOrder`
  2. If `currentStatus !== 'PAID'`: transitions `PENDING → PROCESSING → PAID` via `updateMany` with status guard — `handlers2.ts:139-169`
  3. Calls `webhooksService.markWebhookProcessed()` to mark webhook event as consumed
  4. On failure: webhook throws → Stripe retries → idempotency guards above prevent double-processing

### Hop 13: Fulfillment trigger (post-payment effects)

- **Timing:** Fulfillment effects happen at **two points**:
  - **Synchronous (Hop 6):** When `processPayment` returns APPROVED (rare for cards, common for PIX that confirms server-side), `CheckoutPostPaymentEffectsService` runs immediately after `persistPayment`:
    - `markLeadConverted()` + `autoEnrollInMemberAreas()` (member area access)
    - `sendPurchaseSignals()` (Facebook CAPI Purchase, payment confirmation email, spine bridge events)
    - `checkout-post-payment-effects.service.ts:56-109`
  - **Webhook-side (Hop 9):** For `payment_intent.succeeded` on card sales (the common case), the `handleCheckoutSessionCompleted` path additionally triggers:
    - `autopilot.markConversion()` — contact conversion tracking
    - `autopilot.triggerPostPurchaseFlow()` — post-purchase automation sequence
    - WhatsApp confirmation via `sendCheckoutConfirmation()`
  - **Ledger maturation:** Later asynchronous job `connect-ledger-maturation.service.ts` calls `ledgerService.moveFromPendingToAvailable()` — `ledger.service.ts:140-199` — moving `CREDIT_PENDING` → `MATURE`, transferring balance from pending to available## Error-paths inventory

### Error path A: Checkout slug not found / inactive
- **Trigger:** User visits `/checkout/<nonexistent-slug>` or slug with inactive plan/link
- **Current behavior:** `getCheckoutBySlug()` exhausts all lookups (link → legacy → code) and returns 404-like response. `CheckoutShell` displays generic `"Checkout nao encontrado"`.
- **Honest?** ⚠️ Partially — user sees an error, but cannot distinguish "link expired" from "never existed" from "workspace misconfigured".
- **Recommended fix if ⚠️:** Return structured error with `reason` field so the UI can show differentiated messaging.

### Error path B: Plan does not belong to workspace (workspaceId mismatch)
- **Trigger:** `createOrder` called with `workspaceId` that differs from `planRecord.product.workspaceId`
- **Current behavior:** `resolvePlanForOrder()` — `checkout-order-support.ts:408-410` — throws `BadRequestException('O plano informado não pertence ao workspace informado.')`. The exception propagates to NestJS exception filter → 400 JSON response.
- **Honest?** ✅ — clear, actionable error message.

### Error path C: Fraud engine blocks payment
- **Trigger:** `fraudEngine.evaluate()` returns `action='block'` or `action='review'`
- **Current behavior:** `processPayment()` throws `BadRequestException` — `checkout-payment.service.ts:374-382`. The order IS already persisted in the DB (created before payment), leaving an orphan order in PENDING status. User sees an error but has no order reference.
- **Honest?** ❌ — Orphan order with no payment record. No designed state for "order saved but payment blocked."
- **Recommended fix if ❌:** Return `{ orderId, orderNumber }` alongside the block error so user can reference it.

### Error path D: Stripe PaymentIntent creation fails
- **Trigger:** Stripe API error (network, invalid params, rate limit, etc.)
- **Current behavior:** `stripeCharge.createSaleCharge()` throws → caught in `processPayment` catch — `checkout-payment.service.ts:436-470` — logs, captures Sentry, fires `paymentDeclined`, calls `financialAlert.paymentFailed()`, re-throws. Order row already committed (PENDING).
- **Honest?** ❌ — Same orphan-order problem. No order reference returned to user.
- **Recommended fix if ❌:** Return `{ orderId, orderNumber, error }` so the user can retry against the same order.

### Error path E: Webhook signature verification fails
- **Trigger:** `STRIPE_WEBHOOK_SECRET` not configured in production, or tampered signature
- **Current behavior:** `ForbiddenException` (no secret) or `BadRequestException` (bad signature) → Stripe receives 4xx → Stripe retries → eventually disables endpoint.
- **Honest?** ✅ — Loud failure, no silent data loss. Correct 4xx response.

### Error path F: LedgerService throws during settlement (missing ConnectAccountBalance)
- **Trigger:** `connectService.findBalanceByStripeAccountId()` returns null for a stakeholder in split_lines
- **Current behavior:** `StripeWebhookProcessor.processSaleSucceeded` throws `Error('Missing local ConnectAccountBalance...')` — `processor.ts:187-190`. Propagates up → webhook returns 5xx → Stripe retries (will keep failing). PaymentIntent already succeeded at Stripe, but no transfers or ledger entries created.
- **Honest?** ❌ — Money captured at Stripe but not reflected locally. No automated recovery.
- **Recommended fix if ❌:** Pre-flight at charge creation: validate all split-line stakeholders have ConnectAccountBalance records before creating PaymentIntent.

### Error path G: Stripe transfer.create fails during settlement
- **Trigger:** One stakeholder's Stripe connected account is restricted or disabled
- **Current behavior:** `dispatchTransfer()` throws → `forEachSequential` stops → remaining lines never processed → webhook returns 5xx → Stripe retries. Already-succeeded lines are idempotent-safe, but lines after the failing one never execute.
- **Honest?** ❌ — Partial settlement: some stakeholders paid, others not. No per-line error tracking.
- **Recommended fix if ❌:** Wrap each `dispatchTransfer` + `creditPending` in try-catch that records per-line success/failure and continues to next line.

### Error path H: Order status transition is invalid (state machine violation)
- **Trigger:** Order already in terminal state (CANCELED, REFUNDED, CHARGEBACK, DELIVERED) when webhook tries to transition to PAID
- **Current behavior:** `updateOrderStatusForIntent()` checks `currentStatus === 'PAID'` and skips. Terminal states are respected.
- **Honest?** ✅ — Correct idempotent behavior.

### Error path I: Idempotency replay returns stale data
- **Trigger:** Client retries order creation with same `correlationId`
- **Current behavior:** Detects existing order via metadata, returns existing order + re-runs payment. `persistPayment` idempotent check returns existing payment. Client gets same result.
- **Honest?** ✅ — Correct replay behavior.

### Error path J: Webhook event with missing rawBody
- **Trigger:** Body parser middleware strips `rawBody` before webhook handler
- **Current behavior:** `BadRequestException('Missing rawBody for Stripe webhook verification')` — `controller.ts:142-143`
- **Honest?** ✅ — Clear error. Infrastructure issue, not user-facing.

### Error path K: Coupon validation fails during order creation
- **Trigger:** Expired coupon, usage limit reached, or coupon doesn't apply to plan
- **Current behavior:** `catalogService.validateCoupon()` returns `{ valid: false, message: '...' }` → `createOrder()` throws `BadRequestException(message)` — `checkout-order.service.ts:126-130` — BEFORE the order is created.
- **Honest?** ✅ — Fail-fast before DB write. No orphan state.## Top 5 user-visible gaps (ranked by severity)

1. **Orphan orders on payment failure (Errors C, D):** Order is persisted in PENDING status but user receives an error with no order ID. User cannot reference the order for support, cannot retry against the same order. Return `{ orderId, orderNumber, error }` so user has a reference.

2. **Missing ConnectAccountBalance crashes settlement silently (Error F):** Money is captured at Stripe but never reflected in the local ledger. No alarm fires until someone notices the discrepancy. Add pre-flight validation at charge creation time.

3. **Partial settlement on transfer failure (Error G):** If a stakeholder's Stripe account is blocked, some lines settle and others don't. The webhook keeps retrying and failing on the same bad line. Per-line error handling with continuation would prevent this.

4. **Generic checkout-not-found error (Error A):** User cannot distinguish "link expired" from "never existed" from "workspace not configured." A structured error with a `reason` code would enable differentiated messaging.

5. **No "setup incomplete" state in checkout page:** The `PublicCheckoutResponse` should expose an `isPaymentReady` flag, and the UI should show "Este vendedor ainda está configurando os pagamentos" before the user fills in their details.

## Data model touchpoints

| Table | Operation | Hop |
|---|---|---|
| `CheckoutPlanLink` | READ (slug lookup) | 1 |
| `CheckoutProductPlan` | READ (fallback slug lookup) | 1 |
| `CheckoutConfig` | READ (branding, pixels) | 1 |
| `CheckoutOrder` | CREATE (order record) | 3 |
| `CheckoutOrder` | UPDATE (status transitions) | 6, 9, 12 |
| `CheckoutPayment` | CREATE (payment record) | 6 |
| `CheckoutPayment` | UPDATE (status, webhookData) | 9 |
| `ConnectAccountBalance` | UPDATE (pendingBalanceCents +=) | 10 |
| `ConnectLedgerEntry` | CREATE (CREDIT_PENDING) | 10 |
| `MarketplaceTreasury` | CREATE (MARKETPLACE_FEE_CREDIT) | 11 |
| `Contact` | UPSERT (customer record) | 3 |
| `MemberEnrollment` | CREATE (auto-enroll) | 6/13 |
| `MemberArea` | UPDATE (totalStudents, avgCompletion) | 6/13 |
| `KloelSale` | UPDATE (status='paid') | 9 |
| `CheckoutCoupon` | UPDATE (usedCount +=) | 3 |
| `WebhookEvent` | CREATE (audit log) | 8 |
| `AffiliateLink` | READ (commission resolution) | 3 |
| `Workspace` | READ (validation) | 1, 9 |

## ADR-0003 compliance notes

- ✅ **Dual-balance ledger**: All credits land as PENDING, mature into AVAILABLE via `moveFromPendingToAvailable()`
- ✅ **Chargeback cascade**: `debitForChargeback` pulls from PENDING first, then AVAILABLE
- ✅ **Stripe-only gateway**: `BOLETO` blocked with explicit exception; MercadoPago webhook controller exists but is isolated from the happy path
- ✅ **Split on creation**: `split_lines` serialized into PaymentIntent metadata at charge time, replayed at settlement
- ✅ **Transfer idempotency**: `idempotencyKey: ${paymentIntentId}:${role}` for transfers, `(referenceType, referenceId, type)` unique constraint for ledger
- ✅ **Idempotent webhooks**: Redis `SET NX EX 300` + `WebhookEvent` P2002 guard + Stripe idempotency keys throughout
- ⚠️ **Maturation**: `buildMatureAtResolver` in `stripe-webhook-ledger.service.ts:264-290` resolves per-product maturation rules; falls back to default delays (seller=30d, affiliate=30d, kloel=0d, others=30d). Needs verification that the `connect-ledger-maturation.service.ts` cron job calls `moveFromPendingToAvailable` on schedule.

## Security observations

- ✅ Webhook signature verified via `stripe.webhooks.constructEvent` with multiple secret rotation support
- ✅ `workspaceId` validated against DB on every webhook event before processing
- ✅ Server-side price reconciliation in `calculateCheckoutServerTotals()` prevents client-side price tampering
- ✅ Stripe idempotency keys prevent duplicate charges
- ✅ `@Idempotent()` guard on `createOrder` endpoint
- ✅ SSRF protection on webhook alert dispatch via `validateNoInternalAccess()`
- ⚠️ No rate limiting observed on the public `createOrder` endpoint beyond the `@Idempotent()` guard — could be abused for card testing (though fraud engine provides some protection)
