import {
  buildStripeCardLinkResult,
  buildStripeCheckoutSessionInput,
  buildStripeCheckoutUrls,
  pickStripeExternalPaymentId,
} from './sales.helpers';

describe('sales.helpers (stripe)', () => {
  describe('buildStripeCheckoutUrls', () => {
    it('encodes the sale id in the query string', () => {
      const { successUrl, cancelUrl } = buildStripeCheckoutUrls(
        'https://app.example.com',
        'sale id with spaces',
      );
      expect(successUrl).toBe(
        'https://app.example.com/vendas/gestao-vendas?stripe_checkout=success&saleId=sale%20id%20with%20spaces',
      );
      expect(cancelUrl).toBe(
        'https://app.example.com/vendas/gestao-vendas?stripe_checkout=canceled&saleId=sale%20id%20with%20spaces',
      );
    });
  });

  describe('pickStripeExternalPaymentId', () => {
    it('returns string payment intent as-is', () => {
      expect(pickStripeExternalPaymentId('pi_123', 'cs_999')).toBe('pi_123');
    });

    it('returns expanded payment intent id', () => {
      expect(pickStripeExternalPaymentId({ id: 'pi_456' }, 'cs_999')).toBe('pi_456');
    });

    it('falls back to session id when payment intent is null', () => {
      expect(pickStripeExternalPaymentId(null, 'cs_999')).toBe('cs_999');
    });

    it('falls back to session id when payment intent is undefined', () => {
      expect(pickStripeExternalPaymentId(undefined, 'cs_999')).toBe('cs_999');
    });
  });

  describe('buildStripeCheckoutSessionInput', () => {
    it('builds the full session input with composed metadata + line items', () => {
      const input = buildStripeCheckoutSessionInput({
        workspaceId: 'ws-1',
        saleId: 'sale-1',
        productId: 'prod-1',
        planId: 'plan-1',
        productName: 'Curso Pro',
        buyerEmail: 'ana@example.com',
        amountCents: 19990,
        successUrl: 'https://app.example.com/ok',
        cancelUrl: 'https://app.example.com/cancel',
      });
      expect(input.mode).toBe('payment');
      expect(input.payment_method_types).toEqual(['card']);
      expect(input.customer_email).toBe('ana@example.com');
      expect(input.success_url).toBe('https://app.example.com/ok');
      expect(input.cancel_url).toBe('https://app.example.com/cancel');
      expect(input.line_items).toHaveLength(1);
      expect(input.line_items[0]).toEqual({
        quantity: 1,
        price_data: {
          currency: 'brl',
          unit_amount: 19990,
          product_data: { name: 'Curso Pro' },
        },
      });
      expect(input.metadata.workspaceId).toBe('ws-1');
      expect(input.metadata.saleId).toBe('sale-1');
      expect(input.metadata.productId).toBe('prod-1');
      expect(input.metadata.planId).toBe('plan-1');
      expect(input.metadata.payment_method).toBe('CREDIT_CARD');
      expect(input.metadata).not.toHaveProperty('phone');
      expect(input.payment_intent_data.metadata.workspaceId).toBe('ws-1');
      expect(input.payment_intent_data.metadata.saleId).toBe('sale-1');
    });

    it('forwards phone into the session metadata when provided', () => {
      const input = buildStripeCheckoutSessionInput({
        workspaceId: 'ws-1',
        saleId: 'sale-1',
        productId: 'prod-1',
        planId: 'plan-1',
        productName: 'Curso',
        buyerEmail: 'a@b.com',
        amountCents: 1000,
        successUrl: 'https://x/ok',
        cancelUrl: 'https://x/no',
        phone: '+5511988887777',
      });
      expect(input.metadata.phone).toBe('+5511988887777');
    });
  });

  describe('buildStripeCardLinkResult', () => {
    it('passes every field through unchanged', () => {
      const result = buildStripeCardLinkResult({
        saleId: 'sale-1',
        checkoutSessionId: 'cs_test_123',
        checkoutUrl: 'https://checkout.stripe.com/c/cs_test_123',
        externalPaymentId: 'pi_abc',
      });
      expect(result).toEqual({
        saleId: 'sale-1',
        checkoutSessionId: 'cs_test_123',
        checkoutUrl: 'https://checkout.stripe.com/c/cs_test_123',
        externalPaymentId: 'pi_abc',
      });
    });
  });
});
