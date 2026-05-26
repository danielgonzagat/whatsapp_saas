# Wave 17 — CheckoutPaymentService Decomposition Report

> Authored by PI atomic subagent `w17-decompose-checkout-payment` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted 3 pure helper functions + 2 shared types from `checkout-payment.service.ts` into a sibling `checkout-payment.helpers.ts`, following the existing pattern (`checkout-order-payment.helpers.ts`, `checkout-product.helpers.ts`, `checkout-catalog.helpers.ts`).

## Files Changed

### Files Created

| File | LOC |
|---|---|
| `backend/src/checkout/checkout-payment.helpers.ts` | 70 |

### Files Modified

| File | Before | After | Δ |
|---|---|---|---|
| `backend/src/checkout/checkout-payment.service.ts` | 597 | 546 | −51 |

## What Was Extracted

### `checkout-payment.helpers.ts` (70 LOC)

| Export | Kind | Description |
|---|---|---|
| `CheckoutPaymentStatus` | Type | Payment status discriminated union |
| `PixDisplayData` | Type | PIX display payload extracted from Stripe PaymentIntent |
| `mapStripePaymentStatus` | Function | Maps Stripe PaymentIntent status string → `CheckoutPaymentStatus` |
| `extractPixDisplayData` | Function | Extracts PIX QR/copy-paste/expiry from Stripe `next_action` |
| `toJsonValue` | Function | Serializes values to `Prisma.InputJsonValue` (BigInt-safe) |

### `checkout-payment.service.ts` (546 LOC, was 597)

- Removed: local definitions of the 3 helper functions and 2 types
- Added: single `import { … } from './checkout-payment.helpers'`
- Kept: `CheckoutPaymentMethod`, `SaleChargeInput`, `CardPaymentOptions` (used only by class methods)
- **Zero changes** to any method body, constructor, or public API

## Verification

### Backend TypeScript Compilation

```
npx tsc --noEmit → PASS (0 errors in checkout files)
```

Pre-existing tsc errors in unrelated kloel/capability-registry files are unchanged.

### Spec Results

```
npx jest --testPathPatterns='src/checkout/' --no-coverage

Test Suites: 38 passed, 38 total
Tests:       310 passed, 310 total
```

All checkout specs pass without modification, including:

| Test | Status |
|---|---|
| `checkout-payment.service.spec.ts` (12 tests) | ✅ PASS |
| `checkout-split-e2e.spec.ts` (4 tests) | ✅ PASS |
| `mercado-pago-pix.service.webhook.spec.ts` | ✅ PASS |
| `mercado-pago-webhook.controller.spec.ts` | ✅ PASS |
| `checkout-post-payment-effects.service.spec.ts` | ✅ PASS |
| `checkout-order.service.spec.ts` | ✅ PASS |
| `checkout-order-create.service.spec.ts` | ✅ PASS |
| `checkout-order-delegation.service.spec.ts` | ✅ PASS |
| All remaining 30 checkout suites | ✅ PASS |

## Preserved Invariants Checklist

| Invariant | Status | Evidence |
|---|---|---|
| All transaction boundaries intact | ✅ | `persistPayment` uses `prisma.$transaction({ isolationLevel: 'ReadCommitted' })` — untouched |
| Payment idempotency check preserved | ✅ | `persistPayment` idempotency logic (existingPayment check on externalId) — untouched |
| Webhook verification unchanged | ✅ | `webhookData` serialized via imported `toJsonValue` — identical behavior |
| Stripe charge input construction unchanged | ✅ | `buildChargeInput` — untouched |
| Fraud decision flow unchanged | ✅ | `processPayment` fraud evaluation + `logFraudDecision` — untouched |
| Order state machine transitions intact | ✅ | `transitionOrderToApproved` uses `validateOrderTransition` — untouched |
| E2E guard short-circuit preserved | ✅ | `e2EGuard.isEnabled()` check — untouched |
| Post-payment effects (lead conversion, signals) unchanged | ✅ | `postPaymentEffects` calls — untouched |
| Financial alert + Sentry error handling unchanged | ✅ | Catch block in `processPayment` — untouched |
| Seller connect account auto-creation unchanged | ✅ | `ensureSellerStripeAccountId` — untouched |
| Public API (`processPayment` signature) unchanged | ✅ | Same parameters, same return type |
| CheckoutPaymentService exported unchanged | ✅ | Same `@Injectable()` class, same constructor |
| All imports resolve correctly | ✅ | Verified by tsc + 310 passing tests |

## Risk Assessment

- **Risk Level**: LOW
- **Reason**: Only top-level pure helper functions and inline type aliases were moved. No method bodies, no control flow, no dependency injection, no transaction boundaries were touched.
- **Blast radius**: `checkout-payment.service.ts` imports the helpers; `checkout-order-payment.helpers.ts`, `checkout-order.service.ts`, `checkout-order.post-payment.ts`, and `checkout.module.ts` import only the class — unaffected.
