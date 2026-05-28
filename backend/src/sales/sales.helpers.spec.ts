import {
  BOLETO_EXPIRATION_DAYS,
  PIX_EXPIRATION_MINUTES,
  SALES_PROVENANCE,
  buildBoletoAddressMetadata,
  buildMercadoPagoNotificationUrl,
  buildSaleDescription,
  buildStripeCheckoutUrls,
  computeBoletoExpiresAt,
  computePixExpiresAt,
  pickStripeExternalPaymentId,
  planPriceToCents,
  planPriceToCentsNumber,
  resolveBackendOrigin,
  resolveFrontendOrigin,
  sanitizeDocumentDigits,
} from './sales.helpers';

describe('sales.helpers', () => {
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

  describe('buildBoletoAddressMetadata', () => {
    it('omits neighborhood when missing', () => {
      const meta = buildBoletoAddressMetadata({
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(meta).toEqual({
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(meta.neighborhood).toBeUndefined();
    });

    it('includes neighborhood when present', () => {
      const meta = buildBoletoAddressMetadata({
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(meta.neighborhood).toBe('Bela Vista');
    });
  });

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
});
