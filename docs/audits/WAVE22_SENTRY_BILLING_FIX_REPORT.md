# Wave 22 — Sentry Billing Fix Report

> Authored by PI atomic subagent `w22-sentry-billing-payment-methods-fix` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Issue**: `TypeError: Cannot read properties of undefined (reading 'create')`  
**Route**: `GET /billing/payment-methods`  
**Volume**: 1,026 events / 24h  
**Sentry identifier**: NODE-S

---

## 1. Root Cause Analysis

### Primary cause

The Stripe SDK (`stripe@22.1.1`) is a hybrid CJS/ESM module. On Node 22+/24+ with
certain bundler/compiler configurations, `require('stripe')` can return shapes
other than the bare constructor:

- `{ default: StripeConstructor, __esModule: true }` (ESM interop wrapper)
- `{ Stripe: StripeConstructor }` (namespace wrapper)
- A callable proxy whose instances lack `.customers`, `.paymentMethods`, etc.

The file `backend/src/billing/stripe-runtime.ts` already contained a
`resolveStripeConstructor()` function that probes `mod`, `mod.default`, and
`mod.Stripe` to find a callable. However, it did **no runtime validation** that
`new Candidate(key)` actually produces an instance with the expected Stripe
resource namespaces (`.customers`, `.paymentMethods`, etc.).When the resolver returned a constructor-like function whose instances are
malformed, `new StripeRuntime(key)` succeeded silently but produced an object
where `.customers` was `undefined`. The `PaymentMethodService` then checked
`if (!this.stripe)` — which passed because the object was truthy — and
proceeded to call `this.stripe.customers.create(...)`, which threw.

### Secondary factor

`PaymentMethodService` creates its own Stripe client (`new StripeRuntime(key)`)
instead of using the centralized `StripeService`. This means it:

- Lacks `apiVersion` pinning (`2026-04-22.dahlia`)
- Lacks `maxNetworkRetries: 2` and `timeout: 30_000`
- Lacks the live-mode guard from `StripeService`
- Duplicates initialization logic across `PaymentMethodService`,
  `BillingService`, and `BillingWebhookService`

While not the direct cause of this crash, the duplication made the interop
issue harder to detect in one place.### Call chain

```
GET /billing/payment-methods
  → PaymentMethodController.listPaymentMethods()
    → PaymentMethodService.listPaymentMethods(workspaceId)
      → checks if (!this.stripe)  // PASSES (object is truthy)
      → getOrCreateCustomerId(workspaceId)
        → prisma.$transaction(async (tx) => {
            → checks if (!this.stripe)  // PASSES
            → this.stripe.customers.retrieve(...)  // CRASH
               or this.stripe.customers.create(...)  // CRASH
               TypeError: Cannot read properties of undefined (reading 'create')
          })
```

---

## 2. Fix Applied

### 2a. `backend/src/billing/stripe-runtime.ts` — constructor validation

**Before**: The resolver returned the first callable candidate without
validating that instances have `.customers`.

**After**: Each candidate is probed by instantiating with a dummy key
(`sk_test_stripe_runtime_probe`). The probe instance is checked for the
presence of `.customers` as a non-null object. Only candidates that pass
this validation are returned. If all candidates fail, a detailed error is
thrown listing each failure reason.

This ensures that **at module load time**, if `require('stripe')` cannot
produce a valid constructor, the process fails fast with a clear diagnostic
instead of silently producing broken instances at runtime.### 2b. `backend/src/billing/payment-method.service.ts` — defense-in-depth

Added a guard inside `getOrCreateCustomerId()` that validates `this.stripe`
is not just truthy but also has `.customers` before attempting any Stripe
operation. If the instance is malformed:

1. Logs an error with the interop-failure context
2. Captures a Sentry message with tags `{ type: 'stripe_interop', operation: 'payment_method' }`
3. Nullifies `this.stripe` so all subsequent checks degrade gracefully
4. Returns the persisted `stripeCustomerId` if available, or throws
   `ERROR_BILLING_UNAVAILABLE`

This provides graceful degradation even if the `stripe-runtime.ts` fix
is bypassed by a code path that creates a Stripe client through a different
mechanism.

---

## 3. Files Modified

| File | Change |
|------|--------|
| `backend/src/billing/stripe-runtime.ts` | `resolveStripeConstructor()` — added runtime probe validation of resolved constructor |
| `backend/src/billing/payment-method.service.ts` | `getOrCreateCustomerId()` — added `.customers` existence guard with graceful degradation |
| `backend/src/billing/payment-method.service.spec.ts` | Added 3 tests for malformed-Stripe-instance failure mode |---

## 4. Spec Results

```
PASS src/billing/payment-method.service.spec.ts
  PaymentMethodService (P6-10)
    getOrCreateCustomerId — Wave 1 P0-4 idempotency contract
      ✓ runs the read-then-create inside a $transaction at ReadCommitted
      ✓ returns the existing stripeCustomerId without hitting Stripe
      ✓ recreates customer when persisted stripeCustomerId no longer exists (resource_missing)
      ✓ recreates customer when Stripe returns a deleted-customer shape
      ✓ propagates unexpected Stripe errors (not resource_missing)
      ✓ throws when the workspace does not exist
      ✓ throws "Infraestrutura de cobrança indisponível" when Stripe is not configured
      ✓ persists the new stripeCustomerId on the workspace before returning
    createSetupIntent — Wave 1 P0-4 UUID idempotency key
      ✓ forwards a UUID-suffixed idempotency key to Stripe (no time-bucket race)
      ✓ uses two distinct idempotency keys for two consecutive calls
      ✓ uses the configured FRONTEND_URL as base for success/cancel URLs
      ✓ throws when Stripe is not configured
      ✓ returns { url, customerId }
    listPaymentMethods — graceful degradation
      ✓ returns an empty list when Stripe is not configured
      ✓ returns an empty list when Stripe instance is malformed (missing .customers)  ← NEW
    getOrCreateCustomerId — malformed Stripe instance (Wave 22)
      ✓ returns existing customerId when stripe instance lacks .customers  ← NEW
      ✓ throws ERROR_BILLING_UNAVAILABLE when stripe is malformed and no customerId exists  ← NEW

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
```---

## 5. Backend tsc Result

```
NO ERRORS in billing files (stripe-runtime, payment-method.service, payment-method.controller)
```

Only pre-existing unrelated errors remain in `calendar`, `dashboard`,
`capability-registry-v2`, `intent-router`, and `kloel-chat-tools` — none touched
by this change.

---

## 6. Verification

- [x] Root cause identified
- [x] Fix applied in `stripe-runtime.ts` (constructor validation)
- [x] Defense-in-depth guard added in `payment-method.service.ts`
- [x] 3 new tests added covering the failure mode
- [x] All 17 tests pass (14 existing + 3 new)
- [x] Backend tsc passes for billing files
- [x] Stripe contract unchanged — same API calls, same types
- [x] No protected files touched
