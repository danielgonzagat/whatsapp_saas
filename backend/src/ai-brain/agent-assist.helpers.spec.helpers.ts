import type { PrepaidWalletTransaction } from '@prisma/client';
import type { ChargeUsageResult } from '../wallet/wallet.types';
import { WalletService } from '../wallet/wallet.service';

/**
 * Build a fully auto-mocked WalletService instance whose methods are all
 * `jest.fn()`s. Relies on `jest.mock('../wallet/wallet.service')` having been
 * declared by the calling spec.
 */
export function makeMockWalletService(): jest.Mocked<WalletService> {
  const Ctor = WalletService as jest.MockedClass<typeof WalletService>;
  // jest auto-mock fills in all method implementations; the constructor args
  // are erased so we pass `null` casts for the typed constructor positions.
  const instance = new Ctor(null as never, null as never, null as never);
  return instance as jest.Mocked<WalletService>;
}

/**
 * Build a minimal valid PrepaidWalletTransaction for tests.
 * Uses real Prisma model fields with deterministic values.
 */
export function makePrepaidWalletTransaction(
  overrides: Partial<PrepaidWalletTransaction> = {},
): PrepaidWalletTransaction {
  return {
    id: 'tx_test_1',
    walletId: 'wallet_test_1',
    type: 'USAGE',
    amountCents: BigInt(1000),
    balanceAfterCents: BigInt(9000),
    referenceType: 'usage',
    referenceId: 'req-1',
    metadata: null,
    createdAt: new Date('2026-04-25T00:00:00.000Z'),
    ...overrides,
  } satisfies PrepaidWalletTransaction;
}

/**
 * Build a minimal valid ChargeUsageResult for tests.
 */
export function makeChargeUsageResult(
  overrides: Partial<ChargeUsageResult> = {},
): ChargeUsageResult {
  return {
    newBalanceCents: BigInt(9000),
    costCents: BigInt(1000),
    transaction: makePrepaidWalletTransaction(),
    ...overrides,
  } satisfies ChargeUsageResult;
}
