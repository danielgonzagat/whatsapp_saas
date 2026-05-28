import {
  BOLETO_EXPIRATION_DAYS,
  PIX_EXPIRATION_MINUTES,
  SALES_PROVENANCE,
  buildBoletoAddressMetadata,
  buildBoletoOrderResult,
  buildKloelSaleCreateData,
  buildMercadoPagoNotificationUrl,
  buildPaymentPendingAuditDetails,
  buildPixOrderResult,
  buildSaleDescription,
  buildSaleEventPair,
  buildStripeCardLinkResult,
  buildStripeCheckoutSessionInput,
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

  describe('buildPixOrderResult', () => {
    it('prefers the copia-e-cola string for both pixQrCode and pixCopyPaste', () => {
      const expiresAt = new Date('2026-01-01T12:30:00.000Z');
      const result = buildPixOrderResult({
        saleId: 'sale-1',
        expiresAt,
        pixResult: {
          qrCode: 'COPIA-E-COLA-STRING',
          qrCodeBase64: 'iVBORw0...',
          ticketUrl: 'https://mp.example/ticket',
          externalId: 'mp-123',
        },
      });
      expect(result).toEqual({
        saleId: 'sale-1',
        pixQrCode: 'COPIA-E-COLA-STRING',
        pixQrCodeBase64: 'iVBORw0...',
        pixCopyPaste: 'COPIA-E-COLA-STRING',
        pixExpiresAt: expiresAt,
        externalPaymentId: 'mp-123',
        ticketUrl: 'https://mp.example/ticket',
      });
    });

    it('falls back to base64 for pixQrCode when copia-e-cola is empty', () => {
      const result = buildPixOrderResult({
        saleId: 'sale-2',
        expiresAt: new Date(),
        pixResult: {
          qrCode: '',
          qrCodeBase64: 'BASE64',
          ticketUrl: 'https://t/x',
          externalId: 'mp-456',
        },
      });
      expect(result.pixQrCode).toBe('BASE64');
      expect(result.pixCopyPaste).toBe('');
    });
  });

  describe('buildBoletoOrderResult', () => {
    it('prefers the digitable line for boletoBarcode when present', () => {
      const expiresAt = new Date('2026-01-04T12:00:00.000Z');
      const result = buildBoletoOrderResult({
        saleId: 'sale-1',
        boletoResult: {
          digitableLine: '23793.38128 60082.011113 95000.063307 8 96580000020000',
          barcodeContent: '23798960000020000033812600820111910500006330',
          expiresAt,
          ticketUrl: 'https://mp.example/boleto',
          externalId: 'mp-bol-1',
        },
      });
      expect(result).toEqual({
        saleId: 'sale-1',
        boletoBarcode: '23793.38128 60082.011113 95000.063307 8 96580000020000',
        boletoExpiresAt: expiresAt,
        boletoUrl: 'https://mp.example/boleto',
        externalPaymentId: 'mp-bol-1',
      });
    });

    it('falls back to the raw barcode content when the digitable line is empty', () => {
      const result = buildBoletoOrderResult({
        saleId: 'sale-2',
        boletoResult: {
          digitableLine: '',
          barcodeContent: 'RAW-BARCODE',
          expiresAt: new Date(),
          ticketUrl: 'https://t/x',
          externalId: 'mp-bol-2',
        },
      });
      expect(result.boletoBarcode).toBe('RAW-BARCODE');
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
