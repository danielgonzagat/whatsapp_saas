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
  buildRefundCompensationTxData,
  buildRefundReferenceType,
  buildSettlementAdjustmentTxData,
  buildSettlementReferenceType,
  buildUsageDebitTxData,
  buildUsageReferenceType,
  classifyTopupFraudDecision,
  resolveBackendOrigin,
} from './wallet.service.helpers';

describe('wallet.service.helpers (shared)', () => {
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

  describe('ledger create-data builders (provider-agnostic)', () => {
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

});
