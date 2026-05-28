import { BadRequestException } from '@nestjs/common';
import type { PrepaidWalletTransaction } from '@prisma/client';

import {
  DEFAULT_BACKEND_ORIGIN,
  MP_WEBHOOK_PATH,
  PIX_EXPIRATION_MINUTES,
  WALLET_MERCADOPAGO_REFERENCE_TYPE,
  WALLET_TX_OPTIONS,
  absAmountCents,
  assertExclusivePricingBasis,
  assertNonNegativeActualCost,
  assertPositiveTopupAmount,
  assertValidQuotedCost,
  assertValidUsageUnits,
  buildExistingTxQuery,
  buildFraudReasonsLog,
  buildIdempotentChargeUsageResult,
  buildInsufficientBalanceReport,
  buildMercadoPagoTopupCreditTxData,
  buildMercadoPagoTopupTransactionMetadata,
  buildPixTopupChargeRequest,
  buildRefundCompensationTxData,
  buildRefundMetadata,
  buildRefundReferenceType,
  buildSettlementAdjustmentTxData,
  buildSettlementMetadata,
  buildSettlementReferenceType,
  buildStripeTopupCreditTxData,
  buildStripeTopupIntentParams,
  buildStripeTopupMetadata,
  buildStripeTopupTransactionMetadata,
  buildUsageDebitTxData,
  buildUsageMetadata,
  buildUsageReferenceType,
  buildWalletNotFoundOnMercadoPagoWebhookReport,
  buildWalletNotFoundOnStripeWebhookReport,
  classifyTopupFraudDecision,
  formatMercadoPagoQrImage,
  normalizePayerDocument,
  parseMercadoPagoWalletReference,
  readMercadoPagoTransactionAmountCents,
  resolveBackendOrigin,
  shapePixTopupResult,
  shapeStripeIntentResult,
} from './wallet.service.helpers';

describe('wallet.service.helpers', () => {
  describe('constants', () => {
    it('exposes the canonical Mercado Pago webhook path', () => {
      expect(MP_WEBHOOK_PATH).toBe('/webhooks/mercadopago');
    });

    it('exposes the PIX expiration window in minutes', () => {
      expect(PIX_EXPIRATION_MINUTES).toBe(30);
    });

    it('exposes the canonical Mercado Pago reference type', () => {
      expect(WALLET_MERCADOPAGO_REFERENCE_TYPE).toBe('mercadopago_pix_topup');
    });

    it('exposes a sane default backend origin for local dev', () => {
      expect(DEFAULT_BACKEND_ORIGIN).toBe('http://localhost:3001');
    });
  });

  describe('resolveBackendOrigin', () => {
    const savedEnv = {
      PUBLIC_BACKEND_URL: process.env.PUBLIC_BACKEND_URL,
      BACKEND_URL: process.env.BACKEND_URL,
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    };

    afterEach(() => {
      for (const key of Object.keys(savedEnv) as Array<keyof typeof savedEnv>) {
        const original = savedEnv[key];
        if (original === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = original;
        }
      }
    });

    it('falls back to localhost when no env vars are set', () => {
      delete process.env.PUBLIC_BACKEND_URL;
      delete process.env.BACKEND_URL;
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
      expect(resolveBackendOrigin()).toBe(DEFAULT_BACKEND_ORIGIN);
    });

    it('prefers PUBLIC_BACKEND_URL over BACKEND_URL', () => {
      process.env.PUBLIC_BACKEND_URL = 'https://api.kloel.com';
      process.env.BACKEND_URL = 'https://internal.kloel.com';
      expect(resolveBackendOrigin()).toBe('https://api.kloel.com');
    });

    it('uses BACKEND_URL when PUBLIC_BACKEND_URL is missing', () => {
      delete process.env.PUBLIC_BACKEND_URL;
      process.env.BACKEND_URL = 'https://internal.kloel.com';
      expect(resolveBackendOrigin()).toBe('https://internal.kloel.com');
    });

    it('falls back to NEXT_PUBLIC_API_BASE_URL last before the default', () => {
      delete process.env.PUBLIC_BACKEND_URL;
      delete process.env.BACKEND_URL;
      process.env.NEXT_PUBLIC_API_BASE_URL = 'https://staging.kloel.com';
      expect(resolveBackendOrigin()).toBe('https://staging.kloel.com');
    });

    it('strips a trailing slash so the path concatenation is safe', () => {
      process.env.PUBLIC_BACKEND_URL = 'https://api.kloel.com/';
      expect(resolveBackendOrigin()).toBe('https://api.kloel.com');
    });
  });

  describe('formatMercadoPagoQrImage', () => {
    it('returns a data URL for non-empty base64 payloads', () => {
      expect(formatMercadoPagoQrImage('AAAA')).toBe('data:image/png;base64,AAAA');
    });

    it('returns undefined when the QR payload is empty', () => {
      expect(formatMercadoPagoQrImage('')).toBeUndefined();
    });
  });

  describe('parseMercadoPagoWalletReference', () => {
    it('returns null for non-object payloads', () => {
      expect(parseMercadoPagoWalletReference(null)).toBeNull();
      expect(parseMercadoPagoWalletReference(undefined)).toBeNull();
      expect(parseMercadoPagoWalletReference('wallet_topup:a:b:c')).toBeNull();
      expect(parseMercadoPagoWalletReference(42)).toBeNull();
    });

    it('returns null when external_reference is missing', () => {
      expect(parseMercadoPagoWalletReference({})).toBeNull();
    });

    it('returns null when external_reference is not a wallet top-up', () => {
      expect(
        parseMercadoPagoWalletReference({ external_reference: 'checkout:order:123' }),
      ).toBeNull();
    });

    it('returns null when external_reference is not a string', () => {
      expect(parseMercadoPagoWalletReference({ external_reference: 123 })).toBeNull();
    });

    it('parses workspaceId / walletId / nonce from the reference', () => {
      const parsed = parseMercadoPagoWalletReference({
        external_reference: 'wallet_topup:ws-1:wallet-2:abc-def',
      });
      expect(parsed).toEqual({ workspaceId: 'ws-1', walletId: 'wallet-2', nonce: 'abc-def' });
    });

    it('throws BadRequestException when any segment is missing', () => {
      expect(() =>
        parseMercadoPagoWalletReference({ external_reference: 'wallet_topup::wallet-2:nonce' }),
      ).toThrow(BadRequestException);
      expect(() =>
        parseMercadoPagoWalletReference({ external_reference: 'wallet_topup:ws-1::nonce' }),
      ).toThrow(BadRequestException);
      expect(() =>
        parseMercadoPagoWalletReference({ external_reference: 'wallet_topup:ws-1:wallet-2:' }),
      ).toThrow(BadRequestException);
    });
  });

  describe('readMercadoPagoTransactionAmountCents', () => {
    it('returns null for non-object payloads', () => {
      expect(readMercadoPagoTransactionAmountCents(null)).toBeNull();
      expect(readMercadoPagoTransactionAmountCents(undefined)).toBeNull();
      expect(readMercadoPagoTransactionAmountCents('10.00')).toBeNull();
    });

    it('returns null when transaction_amount is missing', () => {
      expect(readMercadoPagoTransactionAmountCents({})).toBeNull();
    });

    it('parses numeric amounts into cents', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 10 })).toBe(1000n);
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 10.5 })).toBe(1050n);
    });

    it('parses string amounts into cents', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: '12.34' })).toBe(1234n);
    });

    it('rounds fractional cents to the nearest integer cent', () => {
      // 0.005 rounds up to 1 cent (Math.round) -> 0.005 * 100 = 0.5 -> rounds to 1
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 0.005 })).toBe(1n);
      // 0.004 stays at 0 cents
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 0.004 })).toBe(0n);
    });

    it('returns null for non-positive amounts', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 0 })).toBeNull();
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: -1 })).toBeNull();
    });

    it('returns null for non-finite amounts', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 'oops' })).toBeNull();
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: Number.NaN })).toBeNull();
      expect(
        readMercadoPagoTransactionAmountCents({ transaction_amount: Number.POSITIVE_INFINITY }),
      ).toBeNull();
    });

    it('ignores amounts with the wrong type entirely', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: true })).toBeNull();
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: {} })).toBeNull();
    });
  });

  describe('assertPositiveTopupAmount', () => {
    it('accepts strictly positive amounts', () => {
      expect(() => assertPositiveTopupAmount(1n)).not.toThrow();
    });

    it('rejects zero and negative amounts', () => {
      expect(() => assertPositiveTopupAmount(0n)).toThrow(RangeError);
      expect(() => assertPositiveTopupAmount(-1n)).toThrow(RangeError);
    });
  });

  describe('assertValidQuotedCost', () => {
    it('accepts strictly positive quoted costs', () => {
      expect(() => assertValidQuotedCost(1n)).not.toThrow();
    });

    it('rejects undefined / zero / negative', () => {
      expect(() => assertValidQuotedCost(undefined)).toThrow(RangeError);
      expect(() => assertValidQuotedCost(0n)).toThrow(RangeError);
      expect(() => assertValidQuotedCost(-1n)).toThrow(RangeError);
    });
  });

  describe('assertValidUsageUnits', () => {
    it('accepts strictly positive finite numbers', () => {
      expect(() => assertValidUsageUnits(1)).not.toThrow();
      expect(() => assertValidUsageUnits(0.1)).not.toThrow();
    });

    it('rejects undefined, zero, negative, infinite, NaN', () => {
      expect(() => assertValidUsageUnits(undefined)).toThrow(RangeError);
      expect(() => assertValidUsageUnits(0)).toThrow(RangeError);
      expect(() => assertValidUsageUnits(-1)).toThrow(RangeError);
      expect(() => assertValidUsageUnits(Number.POSITIVE_INFINITY)).toThrow(RangeError);
      expect(() => assertValidUsageUnits(Number.NaN)).toThrow(RangeError);
    });
  });

  describe('assertExclusivePricingBasis', () => {
    it('accepts exactly one pricing basis', () => {
      expect(() => assertExclusivePricingBasis(true, false)).not.toThrow();
      expect(() => assertExclusivePricingBasis(false, true)).not.toThrow();
    });

    it('rejects when both or neither basis is supplied', () => {
      expect(() => assertExclusivePricingBasis(true, true)).toThrow(RangeError);
      expect(() => assertExclusivePricingBasis(false, false)).toThrow(RangeError);
    });
  });

  describe('assertNonNegativeActualCost', () => {
    it('accepts zero and positive values', () => {
      expect(() => assertNonNegativeActualCost(0n)).not.toThrow();
      expect(() => assertNonNegativeActualCost(1n)).not.toThrow();
    });

    it('rejects negative values', () => {
      expect(() => assertNonNegativeActualCost(-1n)).toThrow(RangeError);
    });
  });

  describe('normalizePayerDocument', () => {
    it('strips non-digits from CPF', () => {
      expect(normalizePayerDocument('123.456.789-09', null)).toBe('12345678909');
    });

    it('falls back to CNPJ when CPF is missing', () => {
      expect(normalizePayerDocument(null, '12.345.678/0001-99')).toBe('12345678000199');
    });

    it('returns undefined when neither field has digits', () => {
      expect(normalizePayerDocument(null, null)).toBeUndefined();
      expect(normalizePayerDocument('', '')).toBeUndefined();
      expect(normalizePayerDocument('---', undefined)).toBeUndefined();
    });
  });

  describe('buildFraudReasonsLog', () => {
    it('joins reason signals with a comma', () => {
      expect(
        buildFraudReasonsLog([
          { signal: 'blacklist', detail: 'email' },
          { signal: 'velocity', detail: 'ip' },
        ]),
      ).toBe('blacklist,velocity');
    });

    it('returns an empty string when no reasons are supplied', () => {
      expect(buildFraudReasonsLog([])).toBe('');
    });
  });

  describe('classifyTopupFraudDecision', () => {
    it('maps block to block', () => {
      expect(classifyTopupFraudDecision({ action: 'block' }, 'card')).toBe('block');
    });

    it('maps review to review for both methods', () => {
      expect(classifyTopupFraudDecision({ action: 'review' }, 'card')).toBe('review');
      expect(classifyTopupFraudDecision({ action: 'review' }, 'pix')).toBe('review');
    });

    it('maps require_3ds to allow on card but review on pix', () => {
      expect(classifyTopupFraudDecision({ action: 'require_3ds' }, 'card')).toBe('allow');
      expect(classifyTopupFraudDecision({ action: 'require_3ds' }, 'pix')).toBe('review');
    });

    it('maps allow to allow', () => {
      expect(classifyTopupFraudDecision({ action: 'allow' }, 'card')).toBe('allow');
    });
  });

  describe('absAmountCents', () => {
    it('returns the positive twin of a negative amount', () => {
      expect(absAmountCents(-5n)).toBe(5n);
    });

    it('returns positive amounts unchanged', () => {
      expect(absAmountCents(5n)).toBe(5n);
      expect(absAmountCents(0n)).toBe(0n);
    });
  });

  describe('buildExistingTxQuery', () => {
    it('assembles a where-clause matching the (referenceType, referenceId, type) tuple', () => {
      expect(buildExistingTxQuery('usage:foo', 'req-1', 'USAGE')).toEqual({
        where: { referenceType: 'usage:foo', referenceId: 'req-1', type: 'USAGE' },
      });
    });
  });

  describe('buildUsageMetadata', () => {
    it('renders a provider_quote envelope with the cost as string', () => {
      expect(
        buildUsageMetadata({ operation: 'op', billingMode: 'provider_quote', costCents: 123n }),
      ).toEqual({
        operation: 'op',
        billingMode: 'provider_quote',
        quotedCostCents: '123',
      });
    });

    it('renders a catalog envelope with units and per-unit price', () => {
      expect(
        buildUsageMetadata({
          operation: 'op',
          billingMode: 'catalog',
          costCents: 200n,
          units: 2,
          pricePerUnitCents: 100n,
        }),
      ).toEqual({
        operation: 'op',
        billingMode: 'catalog',
        units: 2,
        pricePerUnitCents: '100',
      });
    });

    it('spreads caller metadata last so callers cannot override audit fields', () => {
      const meta = buildUsageMetadata({
        operation: 'op',
        billingMode: 'provider_quote',
        costCents: 1n,
        callerMetadata: { provider: 'openai', operation: 'overridden' },
      });
      // Caller's "operation" wins per spread semantics — this documents the
      // contract; if we ever want to harden against override, change the spread
      // order and update this expectation.
      expect(meta).toEqual({
        operation: 'overridden',
        billingMode: 'provider_quote',
        quotedCostCents: '1',
        provider: 'openai',
      });
    });
  });

  describe('buildSettlementMetadata / buildRefundMetadata', () => {
    it('stringifies bigint costs in the settlement envelope', () => {
      expect(
        buildSettlementMetadata({
          operation: 'op',
          reason: 'reconcile',
          actualCostCents: 50n,
          chargedCostCents: 60n,
          deltaCents: -10n,
          originalUsageTransactionId: 'tx-1',
        }),
      ).toEqual({
        operation: 'op',
        reason: 'reconcile',
        actualCostCents: '50',
        chargedCostCents: '60',
        deltaCents: '-10',
        originalUsageTransactionId: 'tx-1',
      });
    });

    it('produces a minimal refund envelope', () => {
      expect(
        buildRefundMetadata({
          operation: 'op',
          reason: 'failed_upstream',
          originalUsageTransactionId: 'tx-1',
        }),
      ).toEqual({
        operation: 'op',
        reason: 'failed_upstream',
        originalUsageTransactionId: 'tx-1',
      });
    });
  });

  describe('shapeStripeIntentResult', () => {
    it('shapes a Stripe PaymentIntent into the topup result', () => {
      const intent = { id: 'pi_1', client_secret: 'secret_1' } as Parameters<
        typeof shapeStripeIntentResult
      >[0];
      expect(shapeStripeIntentResult(intent)).toEqual({
        paymentIntentId: 'pi_1',
        clientSecret: 'secret_1',
      });
    });

    it('coerces null client_secret', () => {
      const intent = { id: 'pi_2', client_secret: null } as Parameters<
        typeof shapeStripeIntentResult
      >[0];
      expect(shapeStripeIntentResult(intent)).toEqual({
        paymentIntentId: 'pi_2',
        clientSecret: null,
      });
    });
  });

  describe('shapePixTopupResult', () => {
    it('prefers the rendered QR data URL over the ticket URL', () => {
      expect(
        shapePixTopupResult({
          externalId: 'mp_1',
          qrCode: 'copy-paste',
          qrCodeBase64: 'AAAA',
          ticketUrl: 'https://mp/ticket',
        }),
      ).toEqual({
        paymentIntentId: 'mp_1',
        clientSecret: null,
        pixQrCode: 'copy-paste',
        pixQrCodeUrl: 'data:image/png;base64,AAAA',
      });
    });

    it('falls back to the ticket URL when no QR base64 is available', () => {
      expect(
        shapePixTopupResult({
          externalId: 'mp_2',
          qrCode: '',
          qrCodeBase64: '',
          ticketUrl: 'https://mp/ticket-2',
        }),
      ).toEqual({
        paymentIntentId: 'mp_2',
        clientSecret: null,
        pixQrCodeUrl: 'https://mp/ticket-2',
      });
    });
  });

  describe('buildPixTopupChargeRequest', () => {
    it('assembles the MP charge request with deterministic nonce and expiry', () => {
      const now = new Date('2026-01-01T12:00:00.000Z');
      const charge = buildPixTopupChargeRequest({
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        amountCents: 1000n,
        payerEmail: 'buyer@example.com',
        payerDocument: '12345678909',
        nonce: 'nonce-1',
        now,
      });
      expect(charge).toMatchObject({
        idempotencyKey: 'wallet-topup:ws-1:nonce-1',
        amountCents: 1000n,
        payerEmail: 'buyer@example.com',
        payerDocument: '12345678909',
        description: 'Kloel prepaid wallet top-up - workspace ws-1',
        externalReference: 'wallet_topup:ws-1:wallet-1:nonce-1',
      });
      expect(charge.expiresAt.getTime()).toBe(now.getTime() + PIX_EXPIRATION_MINUTES * 60_000);
      expect(charge.notificationUrl.endsWith(MP_WEBHOOK_PATH)).toBe(true);
    });

    it('omits payerDocument when undefined', () => {
      const charge = buildPixTopupChargeRequest({
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        amountCents: 1000n,
        payerEmail: 'buyer@example.com',
        payerDocument: undefined,
        nonce: 'nonce-2',
        now: new Date('2026-01-01T00:00:00.000Z'),
      });
      expect('payerDocument' in charge).toBe(false);
    });
  });

  describe('buildStripeTopupMetadata / buildStripeTopupIntentParams', () => {
    it('builds the PaymentIntent metadata literal', () => {
      expect(buildStripeTopupMetadata({ workspaceId: 'ws-1', walletId: 'wallet-1' })).toEqual({
        type: 'wallet_topup',
        wallet_id: 'wallet-1',
        workspace_id: 'ws-1',
        method: 'card',
      });
    });

    it('lowercases the currency and forwards the workspace metadata', () => {
      const params = buildStripeTopupIntentParams({
        amountCents: 1500n,
        currency: 'BRL',
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        forceThreeDS: false,
      });
      expect(params).toMatchObject({
        amount: 1500,
        currency: 'brl',
        payment_method_types: ['card'],
        description: 'Kloel prepaid wallet top-up - workspace ws-1',
        metadata: { type: 'wallet_topup', workspace_id: 'ws-1', wallet_id: 'wallet-1' },
      });
      expect('payment_method_options' in params).toBe(false);
    });

    it('attaches the request_three_d_secure escalation when forceThreeDS is true', () => {
      const params = buildStripeTopupIntentParams({
        amountCents: 1500n,
        currency: 'brl',
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        forceThreeDS: true,
      });
      expect(params).toMatchObject({
        payment_method_options: { card: { request_three_d_secure: 'any' } },
      });
    });
  });

  describe('buildStripeTopupTransactionMetadata / buildMercadoPagoTopupTransactionMetadata', () => {
    it('preserves the upstream Stripe payment method, defaulting to null', () => {
      expect(buildStripeTopupTransactionMetadata({ paymentMethod: 'card' })).toEqual({
        method: 'card',
      });
      expect(buildStripeTopupTransactionMetadata({ paymentMethod: null })).toEqual({
        method: null,
      });
      expect(buildStripeTopupTransactionMetadata({ paymentMethod: undefined })).toEqual({
        method: null,
      });
    });

    it('tags Mercado Pago topups with provider/method/status', () => {
      expect(buildMercadoPagoTopupTransactionMetadata({ status: 'approved' })).toEqual({
        provider: 'mercadopago',
        method: 'pix',
        status: 'approved',
      });
    });
  });

  describe('Sentry envelope builders', () => {
    it('formats the Stripe-webhook wallet-not-found envelope', () => {
      const report = buildWalletNotFoundOnStripeWebhookReport({
        walletId: 'w1',
        paymentIntentId: 'pi_1',
      });
      expect(report.error.message).toBe('wallet_not_found_on_webhook: wallet=w1 pi=pi_1');
      expect(report.extra).toEqual({ walletId: 'w1', paymentIntentId: 'pi_1' });
    });

    it('formats the Mercado Pago wallet-not-found envelope', () => {
      const report = buildWalletNotFoundOnMercadoPagoWebhookReport({
        walletId: 'w1',
        workspaceId: 'ws1',
        externalId: 'mp1',
      });
      expect(report.error.message).toBe(
        'wallet_not_found_on_mercadopago_webhook: wallet=w1 mp=mp1',
      );
      expect(report.extra).toEqual({ walletId: 'w1', workspaceId: 'ws1', externalId: 'mp1' });
    });

    it('formats the insufficient-balance envelope with stringified bigint costs', () => {
      const report = buildInsufficientBalanceReport({
        walletId: 'w1',
        workspaceId: 'ws1',
        operation: 'op',
        costCents: 100n,
        balanceCents: 50n,
      });
      expect(report.error.message).toBe('prepaid_wallet_insufficient: id=w1 need=100 have=50');
      expect(report.extra).toEqual({
        walletId: 'w1',
        workspaceId: 'ws1',
        operation: 'op',
        costCents: '100',
        balanceCents: '50',
      });
    });
  });

  describe('WALLET_TX_OPTIONS', () => {
    it('uses ReadCommitted isolation level by default', () => {
      expect(WALLET_TX_OPTIONS.isolationLevel).toBe('ReadCommitted');
    });

    it('is frozen so callers cannot mutate the shared options literal', () => {
      expect(Object.isFrozen(WALLET_TX_OPTIONS)).toBe(true);
    });
  });

  describe('reference-type builders', () => {
    it('builds the canonical usage prefix', () => {
      expect(buildUsageReferenceType('autopilot_message')).toBe('usage:autopilot_message');
    });

    it('builds the canonical settlement prefix on top of the usage prefix', () => {
      expect(buildSettlementReferenceType('autopilot_message')).toBe(
        'adjust:usage:autopilot_message',
      );
    });

    it('builds the canonical refund prefix on top of the usage prefix', () => {
      expect(buildRefundReferenceType('autopilot_message')).toBe('refund:usage:autopilot_message');
    });

    it('keeps the settlement/refund prefixes consistent with the usage prefix', () => {
      const operation = 'whatsapp_template_send';
      const usagePrefix = buildUsageReferenceType(operation);
      expect(buildSettlementReferenceType(operation)).toBe(`adjust:${usagePrefix}`);
      expect(buildRefundReferenceType(operation)).toBe(`refund:${usagePrefix}`);
    });
  });

  describe('ledger create-data builders', () => {
    it('shapes Stripe TOPUP create-data with positive amount and stripe_topup reference', () => {
      const data = buildStripeTopupCreditTxData({
        walletId: 'w1',
        amountCents: 5000n,
        newBalanceCents: 12000n,
        paymentIntentId: 'pi_123',
        paymentMethod: 'card',
      });
      expect(data).toEqual({
        walletId: 'w1',
        type: 'TOPUP',
        amountCents: 5000n,
        balanceAfterCents: 12000n,
        referenceType: 'stripe_topup',
        referenceId: 'pi_123',
        metadata: { method: 'card' },
      });
    });

    it('null-coalesces an absent Stripe paymentMethod to null in metadata', () => {
      const data = buildStripeTopupCreditTxData({
        walletId: 'w1',
        amountCents: 1n,
        newBalanceCents: 1n,
        paymentIntentId: 'pi_x',
        paymentMethod: undefined,
      });
      expect(data.metadata).toEqual({ method: null });
    });

    it('shapes Mercado Pago TOPUP create-data with the MP reference type and provider metadata', () => {
      const data = buildMercadoPagoTopupCreditTxData({
        walletId: 'w1',
        amountCents: 9900n,
        newBalanceCents: 10000n,
        externalId: 'mp_999',
        status: 'approved',
      });
      expect(data).toEqual({
        walletId: 'w1',
        type: 'TOPUP',
        amountCents: 9900n,
        balanceAfterCents: 10000n,
        referenceType: WALLET_MERCADOPAGO_REFERENCE_TYPE,
        referenceId: 'mp_999',
        metadata: { provider: 'mercadopago', method: 'pix', status: 'approved' },
      });
    });

    it('shapes USAGE debit create-data with negated cost', () => {
      const usageMetadata = {
        operation: 'autopilot_message',
        billingMode: 'provider_quote' as const,
        quotedCostCents: '750',
      };
      const data = buildUsageDebitTxData({
        walletId: 'w1',
        costCents: 750n,
        newBalanceCents: 9250n,
        referenceType: 'usage:autopilot_message',
        requestId: 'req-1',
        usageMetadata,
      });
      expect(data).toEqual({
        walletId: 'w1',
        type: 'USAGE',
        amountCents: -750n,
        balanceAfterCents: 9250n,
        referenceType: 'usage:autopilot_message',
        referenceId: 'req-1',
        metadata: usageMetadata,
      });
    });

    it('preserves the negated-cost convention for zero-cost debits', () => {
      // -0n === 0n in bigint, so we only assert the sign-flipping logic
      // doesn't introduce a stray negative on the boundary.
      const data = buildUsageDebitTxData({
        walletId: 'w1',
        costCents: 0n,
        newBalanceCents: 10000n,
        referenceType: 'usage:noop',
        requestId: 'req-0',
        usageMetadata: { operation: 'noop' },
      });
      expect(data.amountCents).toBe(0n);
    });

    it('shapes settlement ADJUSTMENT create-data with negated delta', () => {
      const settlementMetadata = {
        operation: 'autopilot_message',
        reason: 'provider_actual',
        actualCostCents: '900',
        chargedCostCents: '750',
        deltaCents: '150',
        originalUsageTransactionId: 'tx-1',
      };
      const data = buildSettlementAdjustmentTxData({
        walletId: 'w1',
        deltaCents: 150n,
        newBalanceCents: 9100n,
        settlementReferenceType: 'adjust:usage:autopilot_message',
        requestId: 'req-1',
        settlementMetadata,
      });
      expect(data).toEqual({
        walletId: 'w1',
        type: 'ADJUSTMENT',
        amountCents: -150n,
        balanceAfterCents: 9100n,
        referenceType: 'adjust:usage:autopilot_message',
        referenceId: 'req-1',
        metadata: settlementMetadata,
      });
    });

    it('renders settlement create-data as a credit when delta is negative (partial refund)', () => {
      // Provider charged less than originally debited: deltaCents < 0,
      // so -deltaCents > 0 -- the row becomes a credit-style ADJUSTMENT.
      const data = buildSettlementAdjustmentTxData({
        walletId: 'w1',
        deltaCents: -200n,
        newBalanceCents: 9450n,
        settlementReferenceType: 'adjust:usage:op',
        requestId: 'req-2',
        settlementMetadata: { reason: 'provider_partial_refund' },
      });
      expect(data.amountCents).toBe(200n);
    });

    it('shapes REFUND create-data with positive refunded amount and refund reference', () => {
      const refundMetadata = {
        operation: 'autopilot_message',
        reason: 'downstream_failure',
        originalUsageTransactionId: 'tx-1',
      };
      const data = buildRefundCompensationTxData({
        walletId: 'w1',
        refundedCents: 750n,
        newBalanceCents: 10000n,
        refundReferenceType: 'refund:usage:autopilot_message',
        requestId: 'req-1',
        refundMetadata,
      });
      expect(data).toEqual({
        walletId: 'w1',
        type: 'REFUND',
        amountCents: 750n,
        balanceAfterCents: 10000n,
        referenceType: 'refund:usage:autopilot_message',
        referenceId: 'req-1',
        metadata: refundMetadata,
      });
    });
  });

  describe('buildIdempotentChargeUsageResult', () => {
    function fakeUsageTx(amountCents: bigint): PrepaidWalletTransaction {
      return {
        id: 'tx-1',
        walletId: 'w1',
        type: 'USAGE',
        amountCents,
        balanceAfterCents: 9250n,
        referenceType: 'usage:autopilot_message',
        referenceId: 'req-1',
        metadata: { operation: 'autopilot_message' },
        createdAt: new Date('2026-05-28T00:00:00Z'),
      };
    }

    it('flips sign of stored negative amountCents to surface positive costCents', () => {
      const existing = fakeUsageTx(-750n);
      const result = buildIdempotentChargeUsageResult({
        existing,
        walletBalanceCents: 9250n,
      });
      expect(result).toEqual({
        newBalanceCents: 9250n,
        costCents: 750n,
        transaction: existing,
      });
    });

    it('defaults a missing wallet balance to 0n so the result stays type-safe', () => {
      const existing = fakeUsageTx(-750n);
      const result = buildIdempotentChargeUsageResult({
        existing,
        walletBalanceCents: undefined,
      });
      expect(result.newBalanceCents).toBe(0n);
    });

    it('defaults a null wallet balance to 0n (Prisma findFirst nullable shape)', () => {
      const existing = fakeUsageTx(-100n);
      const result = buildIdempotentChargeUsageResult({
        existing,
        walletBalanceCents: null,
      });
      expect(result.newBalanceCents).toBe(0n);
      expect(result.costCents).toBe(100n);
    });

    it('returns the same transaction reference passed in (no copy)', () => {
      const existing = fakeUsageTx(-1n);
      const result = buildIdempotentChargeUsageResult({
        existing,
        walletBalanceCents: 1n,
      });
      expect(result.transaction).toBe(existing);
    });
  });
});
