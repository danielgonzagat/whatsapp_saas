import { EnvCheckoutPaymentE2EGuard } from './checkout-payment-e2e-guard';

/**
 * EnvCheckoutPaymentE2EGuard sub-spec.
 *
 * Carved out of `checkout-payment.service.spec.ts` (Gate-fix2-D, 2026-05-28) so
 * the E2E-guard environment toggle expectations stay reviewable in isolation
 * from the CheckoutPaymentService provider/fraud suites.
 */
describe('EnvCheckoutPaymentE2EGuard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('enables the CI checkout stub only when Stripe is not configured outside production', () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.CI = 'true';
    process.env.NODE_ENV = 'test';

    const guard = new EnvCheckoutPaymentE2EGuard();

    expect(guard.isEnabled()).toBe(true);
    expect(guard.buildResult({ orderId: 'order-1', paymentMethod: 'PIX' })).toMatchObject({
      type: 'PIX',
      approved: false,
      paymentIntentId: 'pi_e2e_order-1',
      pixCopyPaste: '000201E2EPIXorder-1',
      stub: true,
    });
  });

  it('does not enable the checkout stub in production', () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.CHECKOUT_PAYMENT_E2E_STUB = 'true';
    process.env.CI = 'true';
    process.env.NODE_ENV = 'production';

    const guard = new EnvCheckoutPaymentE2EGuard();

    expect(guard.isEnabled()).toBe(false);
  });
});
