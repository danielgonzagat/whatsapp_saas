# Stripe-Only Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cortar o caminho ativo de pagamentos do checkout público para Stripe-only em modo de teste, removendo Mercado Pago/Asaas do fluxo real de criação de pedido, cobrança e webhook.

**Architecture:** o checkout público passa a criar ordens Kloel normalmente, mas o pagamento deixa de passar por tokenização Mercado Pago e passa a usar Stripe Connect + PaymentIntents. Para Pix e boleto, o backend gera o intent e persiste os dados de instrução/status no pedido; para cartão, o backend cria o intent e o frontend confirma via Stripe Payment Element. O ledger/split stack novo permanece como o kernel de pagamento e o checkout legado vira casca em volta dele.

**Tech Stack:** NestJS, Prisma, Stripe SDK/Stripe.js, React/Next.js checkout público, Jest.

---

## Scope Notes

- Este plano cobre o **caminho ativo** do checkout público e os contratos que o alimentam.
- Não cobre a remoção imediata de toda referência histórica a Asaas/Mercado Pago em áreas administrativas, docs históricas ou módulos não usados no checkout público.
- O objetivo deste corte é: **checkout público funcionando com Stripe-only em teste**, com Pix validável e Mercado Pago fora do fluxo ativo.

## Files To Touch

- Modify: `backend/src/checkout/checkout.module.ts`
- Modify: `backend/src/checkout/checkout.service.ts`
- Modify: `backend/src/checkout/checkout-payment.service.ts`
- Modify: `backend/src/checkout/checkout-public-payload.builder.ts`
- Modify: `backend/src/checkout/dto/create-order.dto.ts`
- Modify: `backend/src/checkout/checkout-public.controller.ts`
- Modify: `backend/src/payments/stripe/stripe-charge.service.ts`
- Modify: `backend/src/payments/stripe/stripe-charge.types.ts`
- Modify: `backend/src/payments/stripe/stripe-webhook.processor.ts`
- Modify: `backend/src/webhooks/payment-webhook.controller.ts`
- Modify: `frontend/src/lib/public-checkout-contract.ts`
- Modify: `frontend/src/lib/public-checkout.ts`
- Modify: `frontend/src/app/(checkout)/components/CheckoutShell.tsx`
- Modify: `frontend/src/app/(checkout)/components/CheckoutPaymentSection.tsx`
- Modify: `frontend/src/app/(checkout)/hooks/useCheckout.ts`
- Modify: `frontend/src/app/(checkout)/hooks/checkout-order-submit.ts`
- Modify: `frontend/src/app/(checkout)/hooks/useCheckoutExperience.ts`
- Modify: `frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx`
- Modify: `frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx`
- Test: `backend/src/checkout/checkout-payment.service.spec.ts`
- Test: `backend/src/checkout/checkout.service.public.spec.ts`
- Test: `backend/src/checkout/checkout-public.controller.spec.ts`
- Test: `backend/src/payments/stripe/stripe-charge.service.spec.ts`
- Test: `backend/src/payments/stripe/stripe-webhook.processor.spec.ts`

## Execution Order

### Task 1: Move the checkout public contract to Stripe-only

**Files:**

- Modify: `frontend/src/lib/public-checkout-contract.ts`
- Modify: `frontend/src/lib/public-checkout.ts`
- Modify: `backend/src/checkout/checkout-public-payload.builder.ts`
- Test: `backend/src/checkout/checkout.service.public.spec.ts`

- [ ] Replace the public checkout provider contract from `mercado_pago` to `stripe`.
- [ ] Remove dependence on Mercado Pago public config from payload building.
- [ ] Define the Stripe provider contract so checkout UI can decide:
  - card/pix/boleto support
  - checkout enabled/disabled
  - publishable key source
  - installment interest percent
- [ ] Add/update tests proving slug/code public payload resolution still returns equivalent payloads under the new Stripe provider shape.

### Task 2: Rewire backend checkout payment processing to Stripe

**Files:**

- Modify: `backend/src/checkout/checkout-payment.service.ts`
- Modify: `backend/src/checkout/checkout.module.ts`
- Modify: `backend/src/checkout/checkout.service.ts`
- Modify: `backend/src/checkout/dto/create-order.dto.ts`
- Modify: `backend/src/payments/stripe/stripe-charge.service.ts`
- Modify: `backend/src/payments/stripe/stripe-charge.types.ts`
- Test: `backend/src/checkout/checkout-payment.service.spec.ts`
- Test: `backend/src/payments/stripe/stripe-charge.service.spec.ts`

- [ ] Remove Mercado Pago token requirements from the active order flow.
- [ ] Create or resolve the seller connected account for the workspace before creating a Stripe payment.
- [ ] Switch StripeChargeService to the platform-charge / transfer-fanout model used by the Stripe-only stack.
- [ ] Make `CheckoutPaymentService.processPayment` persist `CheckoutPayment.gateway = 'stripe'` and store:
  - payment intent id
  - client secret when needed for card confirmation
  - Pix QR / copy-paste / expiry when available
  - boleto voucher URL / barcode / expiry when available
- [ ] Keep order creation idempotent by order id.
- [ ] Add tests for:
  - missing order
  - Pix intent creation
  - card intent creation with client secret
  - seller account resolution
  - stripe gateway persistence

### Task 3: Make webhook completion update orders from Stripe PaymentIntents

**Files:**

- Modify: `backend/src/payments/stripe/stripe-webhook.processor.ts`
- Modify: `backend/src/webhooks/payment-webhook.controller.ts`
- Test: `backend/src/payments/stripe/stripe-webhook.processor.spec.ts`

- [ ] Teach the Stripe webhook path to handle sale-side `payment_intent.succeeded` events from the checkout flow.
- [ ] Dispatch transfer fan-out from platform balance using the split metadata.
- [ ] Credit the ledger for seller/affiliate/etc.
- [ ] Update the linked `CheckoutPayment` and `CheckoutOrder` rows to approved/paid.
- [ ] Add regression tests for idempotent webhook redelivery and checkout order status updates.

### Task 4: Replace Mercado Pago-only frontend checkout behavior

**Files:**

- Modify: `frontend/src/app/(checkout)/components/CheckoutShell.tsx`
- Modify: `frontend/src/app/(checkout)/components/CheckoutPaymentSection.tsx`
- Modify: `frontend/src/app/(checkout)/hooks/useCheckout.ts`
- Modify: `frontend/src/app/(checkout)/hooks/checkout-order-submit.ts`
- Modify: `frontend/src/app/(checkout)/hooks/useCheckoutExperience.ts`
- Modify: `frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx`
- Modify: `frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx`

- [ ] Remove Mercado Pago SDK preload and device-session logic from the active checkout shell.
- [ ] Stop sending Mercado Pago token fields in public order creation.
- [ ] For card payments, render the existing `StripePaymentElement` with the backend-provided client secret.
- [ ] For Pix and boleto, keep the current method-specific continuity pages but feed them from Stripe payment data.
- [ ] Preserve the existing visual shell and step flow.

### Task 5: Validate the Stripe-only checkout path

**Files:**

- Test: `backend/src/checkout/checkout-public.controller.spec.ts`
- Test: `backend/src/checkout/checkout.service.public.spec.ts`
- Test: `backend/src/checkout/checkout-payment.service.spec.ts`
- Test: `backend/src/payments/stripe/stripe-charge.service.spec.ts`
- Test: `backend/src/payments/stripe/stripe-webhook.processor.spec.ts`

- [ ] Run targeted backend tests for checkout + stripe stack.
- [ ] Run targeted frontend tests for checkout hooks/components where they exist.
- [ ] Run grep validation proving the active public checkout path no longer imports Mercado Pago helpers.
- [ ] Capture remaining legacy references outside the active path as follow-up cleanup, not as blockers for the cutover.

## Done Criteria

- Public checkout payload exposes `provider: 'stripe'`.
- `POST /checkout/public/order` no longer depends on Mercado Pago tokenization or MP session headers.
- Stripe PaymentIntent is the only active payment creation path for the public checkout.
- Pix test flow produces retrievable QR / copy-paste instructions from Stripe-backed data.
- Card flow uses Stripe Payment Element.
- Webhook updates order/payment state from Stripe success events.
- Targeted tests pass.

## Explicit Non-Goals For This Cut

- Deleting every historical Asaas/Mercado Pago file in the repository.
- Rewriting unrelated Kloel admin/payment/wallet surfaces in the same patch.
- Production/live Stripe cutover. This plan is strictly for test-mode validation.
