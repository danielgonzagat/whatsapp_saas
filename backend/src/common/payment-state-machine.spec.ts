import { isValidTransition, validatePaymentTransition } from './payment-state-machine';

describe('payment-state-machine — invariant I3 (monotonicity, fail-closed)', () => {
  describe('isValidTransition', () => {
    it('allows known valid transitions', () => {
      expect(isValidTransition('PENDING', 'RECEIVED')).toBe(true);
      expect(isValidTransition('PENDING', 'CONFIRMED')).toBe(true);
      expect(isValidTransition('PROCESSING', 'APPROVED')).toBe(true);
      expect(isValidTransition('CONFIRMED', 'REFUNDED')).toBe(true);
      expect(isValidTransition('RECEIVED', 'CHARGEBACK')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isValidTransition('pending', 'received')).toBe(true);
      expect(isValidTransition('Pending', 'Received')).toBe(true);
    });

    it('rejects invalid transitions from known states', () => {
      expect(isValidTransition('REFUNDED', 'RECEIVED')).toBe(false);
      expect(isValidTransition('EXPIRED', 'CONFIRMED')).toBe(false);
      expect(isValidTransition('CANCELED', 'RECEIVED')).toBe(false);
    });

    it('rejects all transitions from terminal states', () => {
      const TERMINAL = ['EXPIRED', 'CANCELED', 'DECLINED', 'FAILED', 'REFUNDED', 'CHARGEBACK'];
      const TARGETS = ['PENDING', 'RECEIVED', 'CONFIRMED', 'APPROVED', 'PROCESSING', 'REFUNDED'];
      for (const t of TERMINAL) {
        for (const target of TARGETS) {
          expect(isValidTransition(t, target)).toBe(false);
        }
      }
    });

    it('rejects transitions from unknown current states (fail-closed)', () => {
      // Unknown current state must not be a free pass. Previously returned true.
      expect(isValidTransition('GLITCH', 'RECEIVED')).toBe(false);
      expect(isValidTransition('typo', 'REFUNDED')).toBe(false);
      expect(isValidTransition('', 'CONFIRMED')).toBe(false);
      expect(isValidTransition('UNKNOWN_STATE_NEVER_DEFINED', 'APPROVED')).toBe(false);
    });
  });

  describe('validatePaymentTransition', () => {
    it('returns true when isValidTransition returns true', () => {
      expect(
        validatePaymentTransition('PENDING', 'RECEIVED', {
          paymentId: 'p1',
          provider: 'stripe',
          externalId: 'ext1',
        }),
      ).toBe(true);
    });

    it('returns false when isValidTransition returns false', () => {
      expect(
        validatePaymentTransition('REFUNDED', 'RECEIVED', {
          paymentId: 'p2',
          provider: 'stripe',
          externalId: 'ext2',
        }),
      ).toBe(false);
    });

    it('returns false for unknown current states (fail-closed)', () => {
      expect(
        validatePaymentTransition('GLITCH', 'RECEIVED', {
          paymentId: 'p3',
          provider: 'asaas',
          externalId: 'ext3',
        }),
      ).toBe(false);
    });
  });
});
