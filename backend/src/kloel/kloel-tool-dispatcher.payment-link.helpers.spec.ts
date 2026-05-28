import {
  buildPaymentLinkArgs,
  buildPaymentLinkAuditDetails,
  buildPaymentLinkAuditEntry,
  extractAuditErrorMessage,
  extractPaymentResourceId,
} from './kloel-tool-dispatcher.payment-link.helpers';

describe('kloel-tool-dispatcher.payment-link.helpers', () => {
  describe('buildPaymentLinkArgs', () => {
    it('coerces missing fields to numeric/string fallbacks', () => {
      const result = buildPaymentLinkArgs({});
      expect(result).toEqual({ amount: 0, description: '' });
      expect(result.customerName).toBeUndefined();
    });

    it('keeps numeric amount, string description, and optional customerName', () => {
      const result = buildPaymentLinkArgs({
        amount: 49.9,
        description: 'Plano Pro',
        customerName: 'Daniel',
      });
      expect(result).toEqual({ amount: 49.9, description: 'Plano Pro', customerName: 'Daniel' });
    });

    it('drops non-string customerName (does not include the key)', () => {
      const result = buildPaymentLinkArgs({
        amount: 10,
        description: 'x',
        customerName: 42,
      });
      expect(Object.prototype.hasOwnProperty.call(result, 'customerName')).toBe(false);
    });

    it('coerces non-finite amount to 0', () => {
      const result = buildPaymentLinkArgs({ amount: Number.NaN, description: 'x' });
      expect(result.amount).toBe(0);
    });

    it('coerces non-string description to empty string', () => {
      const result = buildPaymentLinkArgs({ amount: 1, description: 123 });
      expect(result.description).toBe('');
    });
  });

  describe('extractPaymentResourceId', () => {
    it('returns the paymentId when it is a string', () => {
      expect(extractPaymentResourceId({ paymentId: 'pi_123' })).toBe('pi_123');
    });

    it('returns undefined for missing paymentId', () => {
      expect(extractPaymentResourceId({})).toBeUndefined();
    });

    it('returns undefined for null/number/object paymentId', () => {
      expect(extractPaymentResourceId({ paymentId: null })).toBeUndefined();
      expect(extractPaymentResourceId({ paymentId: 9 })).toBeUndefined();
      expect(extractPaymentResourceId({ paymentId: { id: 'x' } })).toBeUndefined();
    });
  });

  describe('buildPaymentLinkAuditDetails', () => {
    it('passes safe fields through unchanged', () => {
      const details = buildPaymentLinkAuditDetails({
        amount: 10,
        description: 'plano',
        customerName: 'Daniel',
      });
      expect(details).toEqual({ amount: 10, description: 'plano', customerName: 'Daniel' });
    });

    it('would strip a sensitive key if it ever appeared on the args record', () => {
      // The PaymentLinkArgs type does not declare a `password` field, but
      // sanitizeDetails must still strip it if it leaks in via a cast.
      const details = buildPaymentLinkAuditDetails({
        amount: 10,
        description: 'plano',
        // intentional shape drift to assert sanitizer guard
        ...{ password: 'p4ss', token: 't0k' },
      });
      expect(details.password).toBeUndefined();
      expect(details.token).toBeUndefined();
      expect(details.amount).toBe(10);
    });
  });

  describe('buildPaymentLinkAuditEntry', () => {
    it('sets deterministic action/resource and routes details through sanitizer', () => {
      const entry = buildPaymentLinkAuditEntry(
        { amount: 12.5, description: 'curso' },
        {},
        undefined,
      );
      expect(entry.action).toBe('KLOEL_TOOL_PAYMENT_LINK_DISPATCHED');
      expect(entry.resource).toBe('KloelToolDispatcher');
      expect(entry.details).toEqual({ amount: 12.5, description: 'curso' });
      expect(entry.resourceId).toBeUndefined();
      expect(entry.agentId).toBeUndefined();
    });

    it('spreads resourceId only when result.paymentId is a string', () => {
      const entry = buildPaymentLinkAuditEntry(
        { amount: 1, description: 'x' },
        { paymentId: 'pi_42' },
        undefined,
      );
      expect(entry.resourceId).toBe('pi_42');
    });

    it('spreads agentId only when userId is provided', () => {
      const entry = buildPaymentLinkAuditEntry({ amount: 1, description: 'x' }, {}, 'user_7');
      expect(entry.agentId).toBe('user_7');
    });

    it('omits resourceId/agentId keys entirely (not just sets undefined)', () => {
      const entry = buildPaymentLinkAuditEntry({ amount: 1, description: 'x' }, {}, undefined);
      expect(Object.prototype.hasOwnProperty.call(entry, 'resourceId')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(entry, 'agentId')).toBe(false);
    });
  });

  describe('extractAuditErrorMessage', () => {
    it('returns Error.message for Error instances', () => {
      expect(extractAuditErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('returns the string itself for string errors', () => {
      expect(extractAuditErrorMessage('thrown string')).toBe('thrown string');
    });

    it('returns "unknown" for null/undefined/object errors', () => {
      expect(extractAuditErrorMessage(null)).toBe('unknown');
      expect(extractAuditErrorMessage(undefined)).toBe('unknown');
      expect(extractAuditErrorMessage({ code: 'E_X' })).toBe('unknown');
      expect(extractAuditErrorMessage(123)).toBe('unknown');
    });
  });
});
