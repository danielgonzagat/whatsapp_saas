/**
 * Deterministic checkout payment stub for the e2e harness.
 *
 * Activated only when the runtime env signals a non-production e2e/test
 * harness (mirrors the env-detection contract used by
 * {@link TestModeThrottlerGuard} and {@link isKloelLlmTestStubEnabled}).
 *
 * The CI workflow runs the full e2e suite without provisioning a real
 * Stripe account: there is no STRIPE_SECRET_KEY in the workflow env. Any
 * real Stripe call therefore fails with "STRIPE_SECRET_KEY is not
 * configured", surfacing as a 500 to the e2e spec
 * `customer-product-and-checkout.spec.ts:98 → POST /checkout/public/order`.
 *
 * The stub bridges that gap by returning a deterministic shape that
 * mirrors a successful Stripe PaymentIntent response without persisting
 * a CheckoutPayment row (the order itself is persisted by the upstream
 * service and the e2e spec only asserts on `order.id`).
 *
 * Production behavior is untouched — the dispatcher in
 * {@link CheckoutPaymentService.processPayment} only consults this stub
 * when {@link isCheckoutPaymentE2EStubEnabled} returns `true`.
 */

/** True when a non-production harness should bypass real Stripe calls. */
export function isCheckoutPaymentE2EStubEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (process.env.E2E_TEST_MODE === 'true') {
    return true;
  }
  if (process.env.CHECKOUT_PAYMENT_STUB === 'true') {
    return true;
  }
  // CI signal: the e2e workflow sets OPENAI_API_KEY=e2e-dummy-key as the
  // canonical "this is the e2e harness" marker. No STRIPE_SECRET_KEY is
  // ever set in that env, so any real Stripe call fails — bypass it.
  if (process.env.OPENAI_API_KEY === 'e2e-dummy-key' && !process.env.STRIPE_SECRET_KEY) {
    return true;
  }
  return false;
}

/** Shape returned by the stub, mirroring CheckoutPaymentService.processPayment. */
export type CheckoutPaymentE2EStubResult = {
  payment: null;
  type: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  approved: boolean;
  clientSecret: string;
  paymentIntentId: string;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
  boletoUrl: null;
  boletoBarcode: null;
  boletoExpiresAt: null;
  stub: true;
} & Record<string, unknown>;

/**
 * Build a deterministic stub payment response. Returned from
 * {@link CheckoutPaymentService.processPayment} when the e2e stub is active.
 * Marks the response with `stub: true` so downstream consumers can spot the
 * synthetic record in audit/log review.
 */
export function buildCheckoutPaymentE2EStubResult(input: {
  orderId: string;
  paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
}): CheckoutPaymentE2EStubResult {
  const intentSuffix = input.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return {
    payment: null,
    type: input.paymentMethod,
    approved: input.paymentMethod !== 'CREDIT_CARD',
    clientSecret: `pi_e2e_stub_${intentSuffix}_secret_stub`,
    paymentIntentId: `pi_e2e_stub_${intentSuffix}`,
    pixQrCode: input.paymentMethod === 'PIX' ? 'data:image/png;base64,e2e-stub' : null,
    pixCopyPaste:
      input.paymentMethod === 'PIX' ? '00020126360014BR.GOV.BCB.PIX0114E2E_STUB_COPY_PASTE' : null,
    pixExpiresAt:
      input.paymentMethod === 'PIX' ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
    boletoUrl: null,
    boletoBarcode: null,
    boletoExpiresAt: null,
    stub: true,
  };
}
