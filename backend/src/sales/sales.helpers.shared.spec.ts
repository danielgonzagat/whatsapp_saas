import {
  BOLETO_EXPIRATION_DAYS,
  PIX_EXPIRATION_MINUTES,
  SALES_PROVENANCE,
  buildKloelSaleCreateData,
  buildMercadoPagoNotificationUrl,
  buildPaymentPendingAuditDetails,
  buildSaleDescription,
  buildSaleEventPair,
  computeBoletoExpiresAt,
  computePixExpiresAt,
  planPriceToCents,
  planPriceToCentsNumber,
  resolveBackendOrigin,
  resolveFrontendOrigin,
  sanitizeDocumentDigits,
} from './sales.helpers';

describe('sales.helpers (shared)', () => {
  describe('resolveBackendOrigin', () => {
    it('falls back to localhost when no env var is set', () => {
      expect(resolveBackendOrigin({})).toBe('http://localhost:3001');
    });

    it('strips trailing slashes', () => {
      expect(resolveBackendOrigin({ BACKEND_PUBLIC_URL: 'https://api.example.com///' })).toBe(
        'https://api.example.com',
      );
    });

    it('prefixes https:// when scheme is missing', () => {
      expect(resolveBackendOrigin({ BACKEND_PUBLIC_URL: 'api.example.com' })).toBe(
        'https://api.example.com',
      );
    });

    it('prefers BACKEND_PUBLIC_URL over fallback chain', () => {
      expect(
        resolveBackendOrigin({
          BACKEND_PUBLIC_URL: 'https://primary.test',
          BACKEND_URL: 'https://secondary.test',
          APP_URL: 'https://tertiary.test',
        }),
      ).toBe('https://primary.test');
    });
  });

  describe('resolveFrontendOrigin', () => {
    it('falls back to localhost when no env var is set', () => {
      expect(resolveFrontendOrigin({})).toBe('http://localhost:3000');
    });

    it('prefers FRONTEND_PUBLIC_URL over APP_URL', () => {
      expect(
        resolveFrontendOrigin({
          FRONTEND_PUBLIC_URL: 'https://app.kloel.com',
          APP_URL: 'https://kloel.com',
        }),
      ).toBe('https://app.kloel.com');
    });
  });

  describe('buildMercadoPagoNotificationUrl', () => {
    it('concatenates backend origin with the standard MP webhook path', () => {
      expect(buildMercadoPagoNotificationUrl({ BACKEND_PUBLIC_URL: 'https://api.kloel.com' })).toBe(
        'https://api.kloel.com/webhooks/mercadopago',
      );
    });
  });

  describe('expiration calculators', () => {
    it('computes PIX expiration exactly 30 minutes ahead', () => {
      const now = new Date('2026-01-01T12:00:00.000Z');
      const result = computePixExpiresAt(now);
      expect(result.getTime() - now.getTime()).toBe(PIX_EXPIRATION_MINUTES * 60_000);
    });

    it('computes boleto expiration exactly 3 days ahead', () => {
      const now = new Date('2026-01-01T12:00:00.000Z');
      const result = computeBoletoExpiresAt(now);
      expect(result.getTime() - now.getTime()).toBe(BOLETO_EXPIRATION_DAYS * 24 * 60 * 60_000);
    });
  });

  describe('plan price converters', () => {
    it('converts decimal BRL to bigint cents (half-up rounding)', () => {
      expect(planPriceToCents(199.99)).toBe(19999n);
      expect(planPriceToCents(0.005)).toBe(1n);
      expect(planPriceToCents(0)).toBe(0n);
    });

    it('converts decimal BRL to number cents for Stripe', () => {
      expect(planPriceToCentsNumber(199.99)).toBe(19999);
      expect(planPriceToCentsNumber(0.005)).toBe(1);
    });
  });

  describe('sanitizeDocumentDigits', () => {
    it('strips formatting from a CPF', () => {
      expect(sanitizeDocumentDigits('123.456.789-00')).toBe('12345678900');
    });

    it('returns empty string when no digits are present', () => {
      expect(sanitizeDocumentDigits('abc---')).toBe('');
    });
  });

  describe('buildSaleDescription', () => {
    it('returns the product name when present', () => {
      expect(buildSaleDescription('Curso Pro', 'Mensal')).toBe('Curso Pro');
    });

    it('falls back to plan name when product name is empty', () => {
      expect(buildSaleDescription('', 'Mensal')).toBe('Plano Mensal');
    });
  });

  describe('SALES_PROVENANCE', () => {
    it('exposes the canonical Mercado Pago provenance block', () => {
      expect(SALES_PROVENANCE).toEqual({
        source: 'production',
        processor: 'sales-service',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      });
    });
  });

  describe('buildSaleEventPair', () => {
    it('builds the PIX/boleto pair without checkoutSessionId', () => {
      const { saleCreated, paymentPending } = buildSaleEventPair({
        saleId: 'sale-1',
        productId: 'prod-1',
        planId: 'plan-1',
        amount: 49.9,
        paymentMethod: 'PIX',
        externalPaymentId: 'mp-ext-1',
        gateway: 'mercadopago',
      });
      expect(saleCreated).toEqual({
        saleId: 'sale-1',
        productId: 'prod-1',
        planId: 'plan-1',
        amount: 49.9,
        paymentMethod: 'PIX',
        externalPaymentId: 'mp-ext-1',
      });
      expect(paymentPending).toEqual({
        saleId: 'sale-1',
        externalPaymentId: 'mp-ext-1',
        gateway: 'mercadopago',
        method: 'PIX',
        amount: 49.9,
        status: 'pending',
      });
    });

    it('forwards checkoutSessionId to both payloads for Stripe card flows', () => {
      const { saleCreated, paymentPending } = buildSaleEventPair({
        saleId: 'sale-2',
        productId: 'prod-2',
        planId: 'plan-2',
        amount: 199,
        paymentMethod: 'CREDIT_CARD',
        externalPaymentId: 'pi_123',
        gateway: 'stripe',
        checkoutSessionId: 'cs_test_456',
      });
      expect(saleCreated.checkoutSessionId).toBe('cs_test_456');
      expect(paymentPending.checkoutSessionId).toBe('cs_test_456');
      expect(paymentPending.gateway).toBe('stripe');
      expect(paymentPending.method).toBe('CREDIT_CARD');
    });

    it('omits checkoutSessionId when not supplied', () => {
      const { saleCreated, paymentPending } = buildSaleEventPair({
        saleId: 'sale-3',
        productId: 'p',
        planId: 'pl',
        amount: 10,
        paymentMethod: 'BOLETO',
        externalPaymentId: 'mp-b-1',
        gateway: 'mercadopago',
      });
      expect(saleCreated).not.toHaveProperty('checkoutSessionId');
      expect(paymentPending).not.toHaveProperty('checkoutSessionId');
    });
  });

  describe('buildPaymentPendingAuditDetails', () => {
    it('forwards the provider status when supplied (PIX / boleto)', () => {
      expect(
        buildPaymentPendingAuditDetails({
          externalPaymentId: 'mp-1',
          gateway: 'mercadopago',
          method: 'PIX',
          amount: 50,
          status: 'pending_payment',
        }),
      ).toEqual({
        externalPaymentId: 'mp-1',
        gateway: 'mercadopago',
        method: 'PIX',
        amount: 50,
        status: 'pending_payment',
      });
    });

    it("defaults status to 'pending' for Stripe checkout sessions (no echoed status)", () => {
      expect(
        buildPaymentPendingAuditDetails({
          externalPaymentId: 'pi_abc',
          gateway: 'stripe',
          method: 'CREDIT_CARD',
          amount: 1000,
        }),
      ).toEqual({
        externalPaymentId: 'pi_abc',
        gateway: 'stripe',
        method: 'CREDIT_CARD',
        amount: 1000,
        status: 'pending',
      });
    });
  });

  describe('buildKloelSaleCreateData', () => {
    it('pins status to pending and forwards every other field', () => {
      const data = buildKloelSaleCreateData({
        workspaceId: 'ws-1',
        productName: 'Curso Pro',
        amount: 199.9,
        paymentMethod: 'PIX',
        leadPhone: '+5511999999999',
        metadata: { buyerName: 'Ana', buyerEmail: 'ana@example.com' },
      });
      expect(data).toEqual({
        workspaceId: 'ws-1',
        productName: 'Curso Pro',
        amount: 199.9,
        status: 'pending',
        paymentMethod: 'PIX',
        leadPhone: '+5511999999999',
        metadata: { buyerName: 'Ana', buyerEmail: 'ana@example.com' },
      });
    });

    it('keeps leadPhone null when no phone is captured', () => {
      const data = buildKloelSaleCreateData({
        workspaceId: 'ws-2',
        productName: 'Plano',
        amount: 10,
        paymentMethod: 'BOLETO',
        leadPhone: null,
        metadata: {},
      });
      expect(data.leadPhone).toBeNull();
      expect(data.paymentMethod).toBe('BOLETO');
    });

    it('always carries CREDIT_CARD method intact for Stripe flows', () => {
      const data = buildKloelSaleCreateData({
        workspaceId: 'ws-3',
        productName: 'Curso',
        amount: 50,
        paymentMethod: 'CREDIT_CARD',
        leadPhone: null,
        metadata: {},
      });
      expect(data.paymentMethod).toBe('CREDIT_CARD');
      expect(data.status).toBe('pending');
    });
  });
});
