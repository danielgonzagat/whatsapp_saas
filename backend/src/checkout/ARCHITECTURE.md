# Checkout & Post-Sale — turn a product link into a paid order and trigger fulfilment

This territory is the **buyer-facing money funnel**: a public checkout page renders a
product/plan, the buyer fills the form, an **order** is created, a **payment** is charged
through the right gateway (Stripe card / Mercado Pago PIX / Mercado Pago boleto), and once
the order is **PAID** a set of **post-sale effects** fire (member-area enrollment, purchase
email, conversion pixels, post-sale lifecycle events). It also owns the seller-facing CRUD
for the catalog that the public page reads from (products, plans, checkouts, bumps, upsells,
coupons, pixels) and the social-lead capture / abandoned-cart recovery loop.

---

## What the user does

Two distinct users:

- **Seller (authenticated, in the KLOEL app):** creates a Product, adds a Plan with a price,
  builds a Checkout (theme, timer, social proof, order bumps, upsells, coupons, tracking
  pixels), and gets a public link/slug. Later reviews the resulting **Orders** and updates
  their fulfilment status (tracking code, shipped, etc.).
- **Buyer (anonymous, on the public checkout page):** opens the link, optionally captures a
  social profile (Google/Apple) to prefill the form, fills name/email/CPF/phone/address,
  applies a coupon, picks a payment method, and pays. They then see a PIX QR / boleto / card
  result and, on success, an optional upsell offer and a confirmation.

---

## End-to-end flow (the real path)

### A. Buyer places an order (the core money path)

1. **UI** — public checkout page + `frontend/src/app/(checkout)/hooks/useCheckout.ts`
   `createOrder(data)` (line ~176) builds a `Request` to `API_BASE + /checkout/public/order`
   via `fetchCheckoutApi`. (This hook hits the backend base URL directly; the only Next proxy
   routes under `frontend/src/app/api/checkout/**` are the **social OAuth** legs —
   `social/apple/start|callback` — not the order POST.)
2. **Nest controller** — `checkout-public.controller.ts` →
   `CheckoutPublicController.createOrder` `@Post('order')` decorated `@Idempotent()`.
   It captures `ip`, `user-agent`, `x-request-id`/`x-correlation-id`, then calls the facade.
3. **Facade** — `checkout.service.ts` → `CheckoutService.createOrder` (line 155). Thin
   delegate; forwards to the order service (it also has a legacy 2-arg "resolver" overload that
   resolves productId→active plan, used by other callers).
4. **Order business rule** — `checkout-order.service.ts` →
   `CheckoutOrderService.createOrder` (line 53). This is the heart:
   - resolves plan + checkout config via `CheckoutOrderSupport` (`checkout-order-support.ts`),
   - re-computes coupon discount server-side via `CheckoutCatalogService.validateCoupon`
     (never trusts client totals),
   - re-computes shipping (`buildCheckoutShippingQuote`) and **server totals**
     (`calculateCheckoutServerTotals` in `checkout-order-pricing.util.ts`),
   - computes **marketplace pricing** (`buildCheckoutMarketplacePricing` in
     `checkout-marketplace-pricing.util.ts`, default fee 9.9%) + affiliate commission,
   - creates the `CheckoutOrder` row inside a **`prisma.$transaction` (ReadCommitted)** that
     first looks up an existing order by `metadata.correlationId` → **idempotent replay**,
   - emits `cartCreated` + `checkoutInitiated` via `CheckoutEventEmitterService`,
   - then calls `processOrderPostPayment` → `CheckoutPaymentService.processPayment`.
5. **Payment routing** — `checkout-payment.service.ts` →
   `CheckoutPaymentService.processPayment` (line 233):
   - short-circuits to a stub when `CHECKOUT_PAYMENT_E2E_GUARD` is enabled (test-only,
     gated `NODE_ENV !== 'production'` — see `checkout-payment-e2e-guard.ts`),
   - runs `FraudEngine.evaluate` + audits the decision + enforces the fraud gate,
   - asks `PaymentProviderRouterService.resolve` for the canonical provider and dispatches to
     one of the **arms** in `checkout-payment.arms.ts`: `runCheckoutPixArm` /
     `runCheckoutBoletoArm` (Mercado Pago) or `runCheckoutStripeArm` (card),
   - each arm calls the real gateway charge service (`StripeChargeService` /
     `MercadoPagoPixChargeService` / `MercadoPagoBoletoChargeService` from the **payments**
     territory) and then **persists** via the shared kernel `runPersistPaymentTx` (idempotent
     on `externalId`; creates `CheckoutPayment`; on approval flips the order to **PAID**).
6. **Prisma models** — `CheckoutOrder` (`@@map RAC_CheckoutOrder`), `CheckoutPayment`
   (`@@map RAC_CheckoutPayment`, 1:1 with order), `UpsellOrder`, `CheckoutSocialLead`.
7. **Response → UI** — the order + `paymentData` (PIX QR/copy-paste, boleto URL/barcode, or
   card status) returns up the chain. `useCheckout.ts` `useOrderStatus(orderId)` then **polls**
   `GET /checkout/public/order/:orderId/status` every ~3s to reflect PENDING → PAID, driving
   the buyer's pending/paid/failed UI states.

### B. Asynchronous payment confirmation (PIX/boleto settle later)

PIX and boleto are not paid synchronously. The gateway calls back the
**Mercado Pago webhook**, which is owned by the **payments** territory
(`backend/src/payments/mercadopago/mercadopago-webhook.controller.ts`,
`@Controller('webhooks/mercadopago')`, `@Post()`). It verifies the signature and reconciles
the `CheckoutPayment`/`CheckoutOrder` to PAID. (Stripe events go through
`backend/src/webhooks/payment-webhook.controller.ts`.) This is why this territory **emits the
side-effects from the persist/arm layer when status becomes PAID**, not just at POST time.

### C. Post-sale effects (after PAID)

`checkout-post-payment-effects.service.ts` → `CheckoutPostPaymentEffectsService`:
- `markLeadConverted` — links the social lead → converted order,
- `sendPurchaseSignals` → `sendFacebookPurchaseEvent` (`FacebookCAPIService`) + pixels,
- `sendPaymentConfirmationEmail`,
- `autoEnrollInMemberAreas`,
- `emitPostSaleBridgeEvents` → emits `commerce.post_sale.delivery_completed` and
  `commerce.post_sale.activation_started` on the event Spine.

### D. Seller catalog CRUD (feeds the public page)

`checkout.controller.ts` (`@Controller('checkout')`, JWT-guarded) exposes
products/plans/checkouts/bumps/upsells/coupons/pixels/config/orders. Each method does an
ownership check (`verifyPlanOwnership` etc.) then delegates through `CheckoutService` to
`CheckoutProductService` / `CheckoutCatalogService` / `CheckoutCatalogConfigService` /
`CheckoutProductConfigService` / `CheckoutOrderQueryService`.

---

## Canonical vocabulary

(Grounded in `docs/architecture/SERVICE_CATALOG.md` §Domain 7 and `CAPABILITY_MAP.md`.)

| Concept | Canonical name | Notes / aliases |
|---|---|---|
| Checkout flow orchestration | **`CheckoutService`** (facade) | Delegates only; many `Parameters<>` re-exports. |
| Order lifecycle | **`CheckoutOrderService`** | Single canonical for create/advance/mark-paid. |
| Payment routing | **`CheckoutPaymentService`** | Routes Stripe / MP-PIX / MP-boleto; per-arm logic in `checkout-payment.arms.ts`. |
| Post-payment side-effects | **`CheckoutPostPaymentEffectsService`** | Single canonical hook surface. |
| Public catalog read | **`CheckoutCatalogService`** | Plan resolve + public payload. |
| Read-side order queries | **`CheckoutOrderQueryService`** | |
| Social-lead capture | **`CheckoutSocialLeadService`** | |
| Cart recovery (canonical) | **`CartRecoveryService`** (in `kloel/`) | `CheckoutSocialRecoveryService` here is the **social-channel adapter only**, not the canonical recovery brain. |
| Order entity | **`CheckoutOrder`** | Money in `Int` cents fields (`subtotalInCents`, `totalInCents`, …). |
| Payment entity | **`CheckoutPayment`** | 1:1 with order; gateway-agnostic columns. |

---

## Key services & single responsibility

- **`CheckoutService`** — facade; routes seller + buyer calls to the right specialist.
- **`CheckoutOrderService`** — create order (server-recompute totals, idempotent tx), advance status, upsell accept/decline, tracking.
- **`CheckoutOrderSupport`** (`checkout-order-support.ts`) — plan/affiliate/line-item/registration-date/fee resolution helpers for order creation.
- **`CheckoutPaymentService`** — fraud gate + provider routing + the shared `runPersistPaymentTx` idempotent persist-and-mark-PAID kernel.
- **`CheckoutPostPaymentEffectsService`** — everything that happens *after* PAID (member access, email, pixels/CAPI, post-sale Spine events).
- **`CheckoutProductService`** — checkout-tier product + plan + checkout CRUD.
- **`CheckoutCatalogService` / `CheckoutCatalogConfigService`** — public catalog payload, bumps/upsells/coupons/pixels, theme/copy config; coupon validation.
- **`CheckoutProductConfigService`** — per-plan checkout config (theme, timer, social proof…).
- **`CheckoutOrderQueryService`** — read-side order listing/detail.
- **`CheckoutSocialLeadService` / `CheckoutSocialRecoveryService`** — social profile capture & abandoned-cart recovery (channel adapter).
- **`FacebookCAPIService`** — Facebook Conversions API purchase events.
- **`MercadoPagoPixService`** — direct PIX helper (`createPixPayment`, `verifyWebhookSignature`, `getPayment`).

---

## Data & events

**Prisma models owned** (`backend/prisma/schema.prisma`): `CheckoutOrder` (`RAC_CheckoutOrder`),
`CheckoutPayment` (`RAC_CheckoutPayment`), `UpsellOrder` (`RAC_UpsellOrder`),
`CheckoutSocialLead` (`RAC_CheckoutSocialLead`). Reads/writes also touch
`Product`, `CheckoutProductPlan`, `CheckoutConfig`, `CheckoutCoupon`, `CheckoutPixel`,
`ProductCheckout`, `AffiliateLink` (owned by neighbouring territories but joined here).
Money is always integer **cents** (`Int`), never float. `CheckoutPayment.externalId` is the
idempotency key for gateway callbacks.

**Events** (via `CheckoutEventEmitterService` / event Spine; see asyncapi `commerce.*`):
- emitted: `commerce.cart.created`, `commerce.cart.checkout_initiated`,
  `commerce.payment.initiated/approved/declined/failed`,
  `commerce.post_sale.delivery_completed`, `commerce.post_sale.activation_started`,
  `commerce.lead.converted` (lead→order).
- consumed externally: payment-gateway webhooks reconcile order status (payments territory).

---

## Workspace isolation

Every seller route resolves `workspaceId` from the JWT and the controller runs an explicit
ownership check before delegating (`verifyPlanOwnership`, `verifyCheckoutOwnership`,
`verifyBumpOwnership`, `verifyUpsellOwnership` in `checkout.controller.ts`;
`verifyCheckoutOwnership` in `checkout.service.ts`). All order/payment queries filter by
`workspaceId`. The **public** buyer routes (`/checkout/public/*`) are unauthenticated by
design but resolve the workspace transitively from the plan/slug/code, and `createOrder`
re-derives the plan + product under that workspace before persisting — the client never
supplies a trusted `workspaceId`. The idempotency replay lookup is also scoped
`where: { workspaceId, metadata.correlationId }`.

---

## Honest status

**Works end-to-end (real, with tests):**
- Order creation with **server-side total/coupon/shipping recompute** and **idempotent
  `$transaction`** replay — proven by `checkout-order-create.service.spec.ts`,
  `checkout.service.create-order.spec.ts`, `checkout.service.spec.ts`.
- **Payment routing + persist kernel** across Stripe / MP-PIX / MP-boleto with fraud gate and
  `externalId` idempotency — `checkout-payment.service.providers.spec.ts`,
  `checkout-payment.service.fraud.spec.ts`, `checkout-payment.service.e2e-guard.spec.ts`,
  `checkout-split-e2e.spec.ts`.
- **Post-payment effects** (lead-conversion, CAPI, email, member-area enroll, post-sale Spine
  events) — `checkout-post-payment-effects.service.spec.ts`.
- Catalog/product/coupon/pixel CRUD and social-lead capture/recovery — broad spec coverage
  (~48 spec files in this dir). Recent hardening landed in `b4c0b5ab1` (wave-0 P0 money /
  ws-isolation / webhook idempotency).

**Gaps / not fully proven:**
- **Async settlement depends on the payments territory.** The Mercado Pago webhook controller
  lives in `backend/src/payments/mercadopago/` (`@Controller('webhooks/mercadopago')`), not
  here; the openapi index lists a `/checkout/webhooks/mercado-pago` path that does **not**
  correspond to a controller decorator in this folder — likely a stale/static-extraction
  artifact to reconcile.
- **Live PIX capability + a production webhook endpoint** are owner-gated per
  `docs/plans/STRIPE_MIGRATION_PLAN.md` (Daniel must enable PIX + create the live webhook).
  So the PIX *settle-to-PAID* leg is unproven against the live gateway.
- `CheckoutService` is a large facade of `Parameters<>` re-delegations (flagged oversized in
  the canonical duplication register) — maintainable but not minimal.
- Frontend order POST bypasses a Next proxy and calls the backend base URL directly via
  `fetchCheckoutApi`; only the social-OAuth legs are proxied.
- WAHA WhatsApp recovery channel is **deprecated** (per ADR-0001), not a gap.

---

## Start here (newcomer reading order)

1. **`backend/src/checkout/checkout-order.service.ts`** → `createOrder` — the whole money
   path: total recompute, idempotent tx, then payment.
2. **`backend/src/checkout/checkout-payment.service.ts`** → `processPayment` +
   `runPersistPaymentTx`, with **`checkout-payment.arms.ts`** for the per-gateway logic.
3. **`backend/src/checkout/checkout-post-payment-effects.service.ts`** — what fires once an
   order is PAID. (For the buyer-side wiring, glance at
   `frontend/src/app/(checkout)/hooks/useCheckout.ts`.)
