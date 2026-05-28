import type { Prisma } from '@prisma/client';
import {
  buildEnrollmentLockKey,
  computeMemberAreaAvgCompletion,
  extractCheckoutOrderIdentity,
  extractErrorMessage,
  extractErrorStack,
  formatHookFailureMessage,
  formatShutdownFailureMessage,
  formatShutdownStartMessage,
  hasCheckoutPaymentLookupKey,
  isApprovedCheckoutPaymentUpdate,
  isPaidCheckoutOrderUpdate,
  pickEnrollmentStudentName,
  UNKNOWN_ERROR_MESSAGE,
  UNKNOWN_ERROR_TOKEN,
  UNKNOWN_SHUTDOWN_SIGNAL,
} from './prisma.service.helpers';

describe('prisma.service.helpers', () => {
  describe('extractErrorMessage', () => {
    it('returns the .message of an Error instance', () => {
      expect(extractErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('falls back to the default token for non-Error throws', () => {
      expect(extractErrorMessage('not an error')).toBe(UNKNOWN_ERROR_MESSAGE);
      expect(extractErrorMessage(undefined)).toBe(UNKNOWN_ERROR_MESSAGE);
      expect(extractErrorMessage(null)).toBe(UNKNOWN_ERROR_MESSAGE);
      expect(extractErrorMessage(42)).toBe(UNKNOWN_ERROR_MESSAGE);
    });

    it('honours a caller-supplied fallback', () => {
      expect(extractErrorMessage('x', UNKNOWN_ERROR_TOKEN)).toBe(UNKNOWN_ERROR_TOKEN);
    });

    it('uses the Error.message even when it is empty', () => {
      expect(extractErrorMessage(new Error(''))).toBe('');
    });
  });

  describe('extractErrorStack', () => {
    it('returns the stack of an Error instance', () => {
      const err = new Error('with stack');
      const stack = extractErrorStack(err);
      expect(typeof stack).toBe('string');
      expect(stack).toContain('with stack');
    });

    it('returns undefined for non-Error throws', () => {
      expect(extractErrorStack('nope')).toBeUndefined();
      expect(extractErrorStack(undefined)).toBeUndefined();
      expect(extractErrorStack(null)).toBeUndefined();
    });
  });

  describe('formatHookFailureMessage', () => {
    it('produces the canonical "<hook> hook failed: <message>" line', () => {
      expect(formatHookFailureMessage('Member access grant', new Error('rls denied'))).toBe(
        'Member access grant hook failed: rls denied',
      );
    });

    it('substitutes the fallback when the cause is not an Error', () => {
      expect(formatHookFailureMessage('Affiliate commission', 'string-thrown')).toBe(
        `Affiliate commission hook failed: ${UNKNOWN_ERROR_MESSAGE}`,
      );
    });
  });

  describe('formatShutdownStartMessage', () => {
    it('embeds the signal name when present', () => {
      expect(formatShutdownStartMessage('SIGTERM')).toBe(
        'Encerrando conexões Prisma antes do shutdown (SIGTERM).',
      );
    });

    it('falls back to "unknown" when the signal is missing', () => {
      expect(formatShutdownStartMessage()).toBe(
        `Encerrando conexões Prisma antes do shutdown (${UNKNOWN_SHUTDOWN_SIGNAL}).`,
      );
      expect(formatShutdownStartMessage(undefined)).toBe(
        `Encerrando conexões Prisma antes do shutdown (${UNKNOWN_SHUTDOWN_SIGNAL}).`,
      );
      expect(formatShutdownStartMessage('')).toBe(
        `Encerrando conexões Prisma antes do shutdown (${UNKNOWN_SHUTDOWN_SIGNAL}).`,
      );
    });
  });

  describe('formatShutdownFailureMessage', () => {
    it('uses the unknown_error token (not "unknown error") for non-Error throws', () => {
      expect(formatShutdownFailureMessage('something')).toBe(
        `Falha ao encerrar Prisma no shutdown: ${UNKNOWN_ERROR_TOKEN}`,
      );
    });

    it('embeds an Error message verbatim', () => {
      expect(formatShutdownFailureMessage(new Error('disconnect failed'))).toBe(
        'Falha ao encerrar Prisma no shutdown: disconnect failed',
      );
    });
  });

  describe('isPaidCheckoutOrderUpdate', () => {
    it('is true when args.data.status === PAID', () => {
      const args = { data: { status: 'PAID' } } as Prisma.CheckoutOrderUpdateManyArgs;
      expect(isPaidCheckoutOrderUpdate(args)).toBe(true);
    });

    it('is false for every other status', () => {
      const otherStatuses = ['PENDING', 'EXPIRED', 'CANCELLED', 'REFUNDED', ''];
      for (const status of otherStatuses) {
        const args = { data: { status } } as unknown as Prisma.CheckoutOrderUpdateManyArgs;
        expect(isPaidCheckoutOrderUpdate(args)).toBe(false);
      }
    });

    it('is false when status is omitted', () => {
      const args = { data: {} } as unknown as Prisma.CheckoutOrderUpdateManyArgs;
      expect(isPaidCheckoutOrderUpdate(args)).toBe(false);
    });
  });

  describe('isApprovedCheckoutPaymentUpdate', () => {
    it('is true when args.data.status === APPROVED', () => {
      const args = { data: { status: 'APPROVED' } } as Prisma.CheckoutPaymentUpdateManyArgs;
      expect(isApprovedCheckoutPaymentUpdate(args)).toBe(true);
    });

    it('is false for every other status', () => {
      const otherStatuses = ['PENDING', 'REJECTED', 'CHARGEBACK', 'PAID', ''];
      for (const status of otherStatuses) {
        const args = { data: { status } } as unknown as Prisma.CheckoutPaymentUpdateManyArgs;
        expect(isApprovedCheckoutPaymentUpdate(args)).toBe(false);
      }
    });
  });

  describe('hasCheckoutPaymentLookupKey', () => {
    it('is true when id is provided', () => {
      expect(hasCheckoutPaymentLookupKey({ id: 'pay_123' } as Prisma.CheckoutPaymentWhereInput)).toBe(
        true,
      );
    });

    it('is true when orderId is provided', () => {
      expect(
        hasCheckoutPaymentLookupKey({ orderId: 'ord_1' } as Prisma.CheckoutPaymentWhereInput),
      ).toBe(true);
    });

    it('is true when externalId is provided', () => {
      expect(
        hasCheckoutPaymentLookupKey({ externalId: 'evt_1' } as Prisma.CheckoutPaymentWhereInput),
      ).toBe(true);
    });

    it('is false for empty or undefined where', () => {
      expect(hasCheckoutPaymentLookupKey(undefined)).toBe(false);
      expect(hasCheckoutPaymentLookupKey({} as Prisma.CheckoutPaymentWhereInput)).toBe(false);
    });

    it('is false when only unrelated keys are present', () => {
      expect(
        hasCheckoutPaymentLookupKey({
          status: 'APPROVED',
        } as unknown as Prisma.CheckoutPaymentWhereInput),
      ).toBe(false);
    });
  });

  describe('extractCheckoutOrderIdentity', () => {
    it('returns both ids when both are strings', () => {
      const result = extractCheckoutOrderIdentity({
        id: 'ord_1',
        workspaceId: 'ws_1',
      } as Prisma.CheckoutOrderWhereInput);
      expect(result).toEqual({ orderId: 'ord_1', workspaceId: 'ws_1' });
    });

    it('returns null for non-string id', () => {
      const result = extractCheckoutOrderIdentity({
        id: { in: ['a', 'b'] },
        workspaceId: 'ws_1',
      } as unknown as Prisma.CheckoutOrderWhereInput);
      expect(result.orderId).toBeNull();
      expect(result.workspaceId).toBe('ws_1');
    });

    it('returns null for non-string workspaceId', () => {
      const result = extractCheckoutOrderIdentity({
        id: 'ord_1',
        workspaceId: { contains: 'ws' },
      } as unknown as Prisma.CheckoutOrderWhereInput);
      expect(result.orderId).toBe('ord_1');
      expect(result.workspaceId).toBeNull();
    });

    it('handles undefined where', () => {
      expect(extractCheckoutOrderIdentity(undefined)).toEqual({
        orderId: null,
        workspaceId: null,
      });
    });

    it('handles empty where', () => {
      expect(extractCheckoutOrderIdentity({})).toEqual({ orderId: null, workspaceId: null });
    });
  });

  describe('buildEnrollmentLockKey', () => {
    it('joins the three components with ":" and lowercases the email', () => {
      expect(
        buildEnrollmentLockKey({
          workspaceId: 'ws_1',
          memberAreaId: 'ma_42',
          customerEmail: 'Alice@Example.COM',
        }),
      ).toBe('ws_1:ma_42:alice@example.com');
    });

    it('is collision-proof across email casing variants', () => {
      const base = {
        workspaceId: 'ws_1',
        memberAreaId: 'ma_1',
      };
      const a = buildEnrollmentLockKey({ ...base, customerEmail: 'X@Y' });
      const b = buildEnrollmentLockKey({ ...base, customerEmail: 'x@y' });
      const c = buildEnrollmentLockKey({ ...base, customerEmail: 'x@Y' });
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('varies on every single component change', () => {
      const base = { workspaceId: 'a', memberAreaId: 'b', customerEmail: 'c@d' };
      const k = buildEnrollmentLockKey(base);
      expect(k).not.toBe(buildEnrollmentLockKey({ ...base, workspaceId: 'a2' }));
      expect(k).not.toBe(buildEnrollmentLockKey({ ...base, memberAreaId: 'b2' }));
      expect(k).not.toBe(buildEnrollmentLockKey({ ...base, customerEmail: 'c2@d' }));
    });
  });

  describe('computeMemberAreaAvgCompletion', () => {
    it('returns the numeric progress when finite', () => {
      expect(computeMemberAreaAvgCompletion(0.42)).toBe(0.42);
      expect(computeMemberAreaAvgCompletion(1)).toBe(1);
    });

    it('returns 0 for null / undefined / 0', () => {
      expect(computeMemberAreaAvgCompletion(null)).toBe(0);
      expect(computeMemberAreaAvgCompletion(undefined)).toBe(0);
      expect(computeMemberAreaAvgCompletion(0)).toBe(0);
    });

    it('does not produce NaN', () => {
      expect(Number.isNaN(computeMemberAreaAvgCompletion(null))).toBe(false);
      expect(Number.isNaN(computeMemberAreaAvgCompletion(undefined))).toBe(false);
    });
  });

  describe('pickEnrollmentStudentName', () => {
    it('prefers the customer name when provided', () => {
      expect(
        pickEnrollmentStudentName({ customerName: 'Alice', customerEmail: 'alice@x' }),
      ).toBe('Alice');
    });

    it('falls back to the email when name is missing', () => {
      expect(pickEnrollmentStudentName({ customerEmail: 'alice@x' })).toBe('alice@x');
      expect(
        pickEnrollmentStudentName({ customerName: null, customerEmail: 'alice@x' }),
      ).toBe('alice@x');
      expect(
        pickEnrollmentStudentName({ customerName: '', customerEmail: 'alice@x' }),
      ).toBe('alice@x');
    });
  });
});
