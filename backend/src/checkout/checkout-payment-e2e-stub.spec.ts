import {
  buildCheckoutPaymentE2EStubResult,
  isCheckoutPaymentE2EStubEnabled,
} from './checkout-payment-e2e-stub';

describe('checkout-payment-e2e-stub', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isCheckoutPaymentE2EStubEnabled', () => {
    it('returns false when NODE_ENV is production even if e2e signals are set', () => {
      process.env.NODE_ENV = 'production';
      process.env.E2E_TEST_MODE = 'true';
      process.env.OPENAI_API_KEY = 'e2e-dummy-key';
      delete process.env.STRIPE_SECRET_KEY;
      expect(isCheckoutPaymentE2EStubEnabled()).toBe(false);
    });

    it('returns true when E2E_TEST_MODE is true', () => {
      process.env.NODE_ENV = 'test';
      process.env.E2E_TEST_MODE = 'true';
      delete process.env.STRIPE_SECRET_KEY;
      expect(isCheckoutPaymentE2EStubEnabled()).toBe(true);
    });

    it('returns true when CHECKOUT_PAYMENT_STUB is true', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.E2E_TEST_MODE;
      process.env.CHECKOUT_PAYMENT_STUB = 'true';
      delete process.env.STRIPE_SECRET_KEY;
      expect(isCheckoutPaymentE2EStubEnabled()).toBe(true);
    });

    it('returns true with the e2e dummy openai key and no stripe key', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.E2E_TEST_MODE;
      delete process.env.CHECKOUT_PAYMENT_STUB;
      process.env.OPENAI_API_KEY = 'e2e-dummy-key';
      delete process.env.STRIPE_SECRET_KEY;
      expect(isCheckoutPaymentE2EStubEnabled()).toBe(true);
    });

    it('returns false when stripe key is configured even with dummy openai key', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.E2E_TEST_MODE;
      delete process.env.CHECKOUT_PAYMENT_STUB;
      process.env.OPENAI_API_KEY = 'e2e-dummy-key';
      process.env.STRIPE_SECRET_KEY = 'sk_test_real_key';
      expect(isCheckoutPaymentE2EStubEnabled()).toBe(false);
    });

    it('returns false when no e2e signals are set', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.E2E_TEST_MODE;
      delete process.env.CHECKOUT_PAYMENT_STUB;
      delete process.env.OPENAI_API_KEY;
      delete process.env.STRIPE_SECRET_KEY;
      expect(isCheckoutPaymentE2EStubEnabled()).toBe(false);
    });
  });

  describe('buildCheckoutPaymentE2EStubResult', () => {
    it('builds an approved PIX stub with QR + copy-paste payload', () => {
      const result = buildCheckoutPaymentE2EStubResult({
        orderId: 'order_pix_123',
        paymentMethod: 'PIX',
      });
      expect(result.stub).toBe(true);
      expect(result.approved).toBe(true);
      expect(result.type).toBe('PIX');
      expect(result.paymentIntentId).toMatch(/^pi_e2e_stub_/);
      expect(result.clientSecret).toMatch(/_secret_stub$/);
      expect(result.pixQrCode).toContain('data:image/png');
      expect(result.pixCopyPaste).toContain('BR.GOV.BCB.PIX');
      expect(typeof result.pixExpiresAt).toBe('string');
      expect(result.boletoUrl).toBeNull();
    });

    it('builds a non-approved CREDIT_CARD stub without pix data', () => {
      const result = buildCheckoutPaymentE2EStubResult({
        orderId: 'order_card_xyz',
        paymentMethod: 'CREDIT_CARD',
      });
      expect(result.approved).toBe(false);
      expect(result.type).toBe('CREDIT_CARD');
      expect(result.pixQrCode).toBeNull();
      expect(result.pixCopyPaste).toBeNull();
      expect(result.pixExpiresAt).toBeNull();
    });

    it('strips non-alphanumerics from orderId in the stub paymentIntentId', () => {
      const result = buildCheckoutPaymentE2EStubResult({
        orderId: 'ord-123#!@?abc',
        paymentMethod: 'PIX',
      });
      expect(result.paymentIntentId).toBe('pi_e2e_stub_ord123abc');
    });
  });
});
