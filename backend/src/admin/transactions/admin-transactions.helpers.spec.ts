import {
  isRefundAlreadyRequested,
  mergeWebhookData,
  normalizeGateway,
  readRecord,
  resolveDebitBucket,
  resolveProducerNetInCents,
} from './admin-transactions.helpers';

describe('admin-transactions.helpers', () => {
  describe('isRefundAlreadyRequested', () => {
    it('returns true for refund_requested', () => {
      expect(isRefundAlreadyRequested('refund_requested')).toBe(true);
    });

    it('returns true for refunded', () => {
      expect(isRefundAlreadyRequested('refunded')).toBe(true);
    });

    it('returns false for paid', () => {
      expect(isRefundAlreadyRequested('paid')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isRefundAlreadyRequested('')).toBe(false);
    });

    it('is case-sensitive and rejects upper-case spellings', () => {
      expect(isRefundAlreadyRequested('REFUNDED')).toBe(false);
      expect(isRefundAlreadyRequested('Refund_Requested')).toBe(false);
    });
  });

  describe('resolveProducerNetInCents', () => {
    it('prefers producerNetInCents when present and positive', () => {
      expect(
        resolveProducerNetInCents(13_990, {
          producerNetInCents: 12_345,
          sellerReceivableInCents: 9_000,
          baseTotalInCents: 13_000,
        }),
      ).toBe(12_345);
    });

    it('falls back to sellerReceivableInCents when producerNet missing', () => {
      expect(
        resolveProducerNetInCents(13_990, {
          sellerReceivableInCents: 9_000,
          baseTotalInCents: 13_000,
        }),
      ).toBe(9_000);
    });

    it('falls back to baseTotalInCents when prior candidates missing', () => {
      expect(
        resolveProducerNetInCents(13_990, {
          baseTotalInCents: 13_000,
        }),
      ).toBe(13_000);
    });

    it('falls back to totalInCents when all metadata candidates missing', () => {
      expect(resolveProducerNetInCents(13_990, {})).toBe(13_990);
    });

    it('skips non-finite/NaN/0/negative candidates', () => {
      expect(
        resolveProducerNetInCents(13_990, {
          producerNetInCents: 'not-a-number',
          sellerReceivableInCents: 0,
          baseTotalInCents: -500,
        }),
      ).toBe(13_990);
    });

    it('rounds fractional cent candidates to integers', () => {
      expect(
        resolveProducerNetInCents(13_990, {
          producerNetInCents: 1234.6,
        }),
      ).toBe(1235);
    });

    it('returns 0 when no candidate yields a positive finite number', () => {
      expect(
        resolveProducerNetInCents(0, {
          producerNetInCents: 'x',
          sellerReceivableInCents: null,
          baseTotalInCents: undefined,
        }),
      ).toBe(0);
    });

    it('parses numeric strings into integers', () => {
      expect(
        resolveProducerNetInCents(0, {
          producerNetInCents: '4321',
        }),
      ).toBe(4321);
    });
  });

  describe('mergeWebhookData', () => {
    it('embeds the extra payload under adminOperation', () => {
      const merged = mergeWebhookData(
        { foo: 'bar' },
        { source: 'admin', action: 'REFUNDED', note: 'manual', operatedAt: '2026-05-28T00:00:00Z' },
      );
      expect(merged).toEqual({
        foo: 'bar',
        adminOperation: {
          source: 'admin',
          action: 'REFUNDED',
          note: 'manual',
          operatedAt: '2026-05-28T00:00:00Z',
        },
      });
    });

    it('overrides a pre-existing adminOperation key from metadata', () => {
      const merged = mergeWebhookData(
        { adminOperation: { old: true } },
        { source: 'admin', action: 'CHARGEBACK' },
      );
      expect(merged).toEqual({
        adminOperation: { source: 'admin', action: 'CHARGEBACK' },
      });
    });

    it('drops undefined values (JSON canonicalization)', () => {
      const merged = mergeWebhookData({ keep: 1, drop: undefined }, { note: undefined });
      expect(merged).toEqual({ keep: 1, adminOperation: {} });
    });
  });

  describe('readRecord', () => {
    it('returns the value when it is a plain object', () => {
      expect(readRecord({ a: 1, b: 'two' })).toEqual({ a: 1, b: 'two' });
    });

    it('returns {} for null', () => {
      expect(readRecord(null)).toEqual({});
    });

    it('returns {} for undefined', () => {
      expect(readRecord(undefined)).toEqual({});
    });

    it('returns {} for arrays (Prisma JSON arrays are not records)', () => {
      expect(readRecord([1, 2, 3])).toEqual({});
    });

    it('returns {} for scalar values', () => {
      expect(readRecord('string')).toEqual({});
      expect(readRecord(42)).toEqual({});
      expect(readRecord(true)).toEqual({});
    });
  });

  describe('normalizeGateway', () => {
    it('lower-cases and trims', () => {
      expect(normalizeGateway('  Stripe  ')).toBe('stripe');
    });

    it('returns "" for null/undefined/empty', () => {
      expect(normalizeGateway(null)).toBe('');
      expect(normalizeGateway(undefined)).toBe('');
      expect(normalizeGateway('')).toBe('');
    });

    it('lower-cases mixed case provider names', () => {
      expect(normalizeGateway('STRIPE')).toBe('stripe');
      expect(normalizeGateway('MercadoPago')).toBe('mercadopago');
    });
  });

  describe('resolveDebitBucket', () => {
    it('chooses pending when pending bucket fully covers the amount', () => {
      expect(resolveDebitBucket(BigInt(10_000), 10_000)).toBe('pending');
      expect(resolveDebitBucket(BigInt(15_000), 10_000)).toBe('pending');
    });

    it('falls back to available when pending is short', () => {
      expect(resolveDebitBucket(BigInt(9_999), 10_000)).toBe('available');
      expect(resolveDebitBucket(BigInt(0), 10_000)).toBe('available');
    });

    it('handles zero amount as pending (covered trivially)', () => {
      expect(resolveDebitBucket(BigInt(0), 0)).toBe('pending');
    });
  });
});
