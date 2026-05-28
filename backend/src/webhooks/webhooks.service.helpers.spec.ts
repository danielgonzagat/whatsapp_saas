import {
  asRecord,
  extractPhone,
  normalizeMessageStatus,
  resolveFinanceFlowId,
  toPrismaJsonValue,
} from './webhooks.service.helpers';
import { extractAsciiDigits } from '../common/phone/phone-normalization.util';

describe('webhooks.service.helpers', () => {
  describe('asRecord', () => {
    it('returns the value when it is a non-null object', () => {
      const v = { a: 1 };
      expect(asRecord(v)).toBe(v);
    });

    it('returns null for null', () => {
      expect(asRecord(null)).toBeNull();
    });

    it('returns null for primitives', () => {
      expect(asRecord('string')).toBeNull();
      expect(asRecord(7)).toBeNull();
      expect(asRecord(true)).toBeNull();
      expect(asRecord(undefined)).toBeNull();
    });

    it('returns the array value as record (typeof object is true)', () => {
      const arr = [1, 2];
      expect(asRecord(arr)).toBe(arr as unknown as Record<string, unknown>);
    });
  });

  describe('toPrismaJsonValue', () => {
    it('round-trips a plain object', () => {
      expect(toPrismaJsonValue({ a: 1, b: 'two' })).toEqual({ a: 1, b: 'two' });
    });

    it('treats undefined as null', () => {
      expect(toPrismaJsonValue(undefined)).toBeNull();
    });

    it('returns a structured error marker on cyclic input', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      const result = toPrismaJsonValue(obj);
      expect(result).toEqual({ serializationError: true, valueType: 'object' });
    });
  });

  describe('extractPhone', () => {
    it('returns digits from a flat top-level phone field', () => {
      expect(extractPhone({ phone: '+55 (11) 99999-0000' })).toBe('5511999990000');
    });

    it('prefers explicit phone over nested fields when both present', () => {
      const payload = {
        phone: '+55 (11) 99999-0000',
        data: { object: { phone: '+1 555 444 3333' } },
      };
      expect(extractPhone(payload)).toBe('5511999990000');
    });

    it('walks Stripe-style nested customer_details.phone', () => {
      const payload = {
        data: { object: { customer_details: { phone: '+1 (415) 555-2671' } } },
      };
      expect(extractPhone(payload)).toBe('14155552671');
    });

    it('walks Hotmart-style buyer.phone', () => {
      expect(extractPhone({ buyer: { phone: '+55 21 98765-4321' } })).toBe('5521987654321');
    });

    it('returns null when no candidate has enough digits', () => {
      expect(extractPhone({ phone: '123' })).toBeNull();
    });

    it('returns null when no candidate is present', () => {
      expect(extractPhone({ unrelated: 'value' })).toBeNull();
    });

    it('ignores non-string candidates', () => {
      expect(extractPhone({ phone: 12345678901 } as Record<string, unknown>)).toBeNull();
    });
  });

  describe('resolveFinanceFlowId', () => {
    it('returns the status-specific flow id when configured', () => {
      const finance = {
        flowPaidId: 'flow-paid',
        flowPendingId: 'flow-pending',
        flowDefaultId: 'flow-default',
      };
      expect(resolveFinanceFlowId(finance, 'paid')).toBe('flow-paid');
      expect(resolveFinanceFlowId(finance, 'pending')).toBe('flow-pending');
    });

    it('normalises status case before lookup', () => {
      const finance = { flowPaidId: 'flow-paid' };
      expect(resolveFinanceFlowId(finance, 'PAID')).toBe('flow-paid');
      expect(resolveFinanceFlowId(finance, 'Paid')).toBe('flow-paid');
    });

    it('falls back to flowDefaultId when status has no specific flow', () => {
      const finance = { flowDefaultId: 'flow-default' };
      expect(resolveFinanceFlowId(finance, 'paid')).toBe('flow-default');
      expect(resolveFinanceFlowId(finance, 'whatever')).toBe('flow-default');
    });

    it('returns undefined when neither status-specific nor default is set', () => {
      expect(resolveFinanceFlowId({}, 'paid')).toBeUndefined();
    });

    it('handles canceled and overdue statuses', () => {
      const finance = {
        flowCanceledId: 'flow-canceled',
        flowOverdueId: 'flow-overdue',
      };
      expect(resolveFinanceFlowId(finance, 'canceled')).toBe('flow-canceled');
      expect(resolveFinanceFlowId(finance, 'overdue')).toBe('flow-overdue');
    });
  });

  describe('normalizeMessageStatus', () => {
    it('upper-cases the status string', () => {
      expect(normalizeMessageStatus('delivered')).toBe('DELIVERED');
      expect(normalizeMessageStatus('Read')).toBe('READ');
    });

    it('returns an empty string for undefined input', () => {
      expect(normalizeMessageStatus(undefined)).toBe('');
    });

    it('returns an empty string for an empty input', () => {
      expect(normalizeMessageStatus('')).toBe('');
    });
  });

  // Phone-digit normalization is delegated to the canonical
  // {@link extractAsciiDigits} helper from
  // `backend/src/common/phone/phone-normalization.util.ts`. The webhooks
  // service composes `extractAsciiDigits(input.phone) || undefined` at the
  // call site to preserve the "omit-when-empty" semantic the Prisma write
  // expects. Tests below pin that composition so the contract stays stable.
  describe('canonical phone-digit composition', () => {
    const normalizeForWebhook = (phone: string | undefined): string | undefined =>
      extractAsciiDigits(phone) || undefined;

    it('strips non-digit characters', () => {
      expect(normalizeForWebhook('+55 (11) 99999-0000')).toBe('5511999990000');
    });

    it('returns undefined for undefined input', () => {
      expect(normalizeForWebhook(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string input', () => {
      expect(normalizeForWebhook('')).toBeUndefined();
    });

    it('returns undefined when stripping yields an empty string', () => {
      expect(normalizeForWebhook('---')).toBeUndefined();
    });
  });
});
