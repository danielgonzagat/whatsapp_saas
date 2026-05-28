import type { PrepaidWalletTransaction } from '@prisma/client';

import { buildIdempotentChargeUsageResult } from './wallet.service.helpers';

describe('wallet.service.helpers (idempotency)', () => {
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
