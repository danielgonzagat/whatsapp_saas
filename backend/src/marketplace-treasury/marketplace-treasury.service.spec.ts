import { MarketplaceTreasuryLedgerKind, MarketplaceTreasuryBucket } from '@prisma/client';

import { MarketplaceTreasuryInsufficientAvailableBalanceError } from './marketplace-treasury.errors';
import { MarketplaceTreasuryService } from './marketplace-treasury.service';

describe('MarketplaceTreasuryService', () => {
  function buildService({
    wallet,
    existingDebit = null,
    existingCredit = null,
  }: {
    wallet?: Record<string, unknown>;
    existingDebit?: Record<string, unknown> | null;
    existingCredit?: Record<string, unknown> | null;
  } = {}) {
    const tx = {
      marketplaceTreasury: {
        upsert: jest.fn().mockResolvedValue({
          id: 'pw_brl',
          currency: 'BRL',
          availableBalanceInCents: 10_000n,
          pendingBalanceInCents: 0n,
          reservedBalanceInCents: 0n,
          ...wallet,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      marketplaceTreasuryLedger: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(existingDebit)
          .mockResolvedValueOnce(existingCredit),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (inner: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
      marketplaceTreasury: {
        upsert: jest.fn(),
      },
      marketplaceTreasuryLedger: {
        create: jest.fn(),
      },
    };

    return {
      tx,
      prisma,
      service: new MarketplaceTreasuryService(prisma as never),
    };
  }

  it('debits available for payout with idempotent requestId semantics', async () => {
    const { service, tx } = buildService();

    await service.debitAvailableForPayout({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'marketplace_treasury_po_req_1',
      metadata: {
        requestId: 'marketplace_treasury_po_req_1',
      },
    });

    expect(tx.marketplaceTreasury.upsert).toHaveBeenCalledWith({
      where: { currency: 'BRL' },
      update: {},
      create: { currency: 'BRL' },
    });
    expect(tx.marketplaceTreasuryLedger.findFirst).toHaveBeenCalledWith({
      where: {
        currency: 'BRL',
        kind: MarketplaceTreasuryLedgerKind.PAYOUT_DEBIT,
        orderId: 'marketplace_treasury_po_req_1',
      },
    });
    expect(tx.marketplaceTreasuryLedger.create).toHaveBeenCalledWith({
      data: {
        walletId: 'pw_brl',
        currency: 'BRL',
        direction: 'debit',
        bucket: MarketplaceTreasuryBucket.AVAILABLE,
        amountInCents: 5_000n,
        kind: MarketplaceTreasuryLedgerKind.PAYOUT_DEBIT,
        orderId: 'marketplace_treasury_po_req_1',
        reason: 'marketplace_treasury_payout_debit',
        metadata: {
          requestId: 'marketplace_treasury_po_req_1',
        },
      },
    });
    expect(tx.marketplaceTreasury.update).toHaveBeenCalledWith({
      where: { id: 'pw_brl' },
      data: {
        availableBalanceInCents: { decrement: 5_000n },
      },
    });
  });

  it('skips a duplicate payout debit when the same requestId was already recorded', async () => {
    const { service, tx } = buildService({
      existingDebit: {
        id: 'pwl_existing',
      },
    });

    await service.debitAvailableForPayout({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'marketplace_treasury_po_req_dup',
    });

    expect(tx.marketplaceTreasuryLedger.create).not.toHaveBeenCalled();
    expect(tx.marketplaceTreasury.update).not.toHaveBeenCalled();
  });

  it('throws when the available balance is insufficient for a payout debit', async () => {
    const { service, tx } = buildService({
      wallet: {
        availableBalanceInCents: 999n,
      },
    });

    await expect(
      service.debitAvailableForPayout({
        currency: 'BRL',
        amountInCents: 5_000n,
        requestId: 'marketplace_treasury_po_req_short',
      }),
    ).rejects.toBeInstanceOf(MarketplaceTreasuryInsufficientAvailableBalanceError);

    expect(tx.marketplaceTreasuryLedger.create).not.toHaveBeenCalled();
    expect(tx.marketplaceTreasury.update).not.toHaveBeenCalled();
  });

  it('credits available by adjustment with idempotent requestId semantics', async () => {
    const { service, tx } = buildService();

    await service.creditAvailableByAdjustment({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'payout_failed:po_marketplace_treasury_123',
      reason: 'marketplace_treasury_payout_failed_credit',
      metadata: {
        stripePayoutId: 'po_marketplace_treasury_123',
      },
    });

    expect(tx.marketplaceTreasuryLedger.findFirst).toHaveBeenLastCalledWith({
      where: {
        currency: 'BRL',
        kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_CREDIT,
        orderId: 'payout_failed:po_marketplace_treasury_123',
      },
    });
    expect(tx.marketplaceTreasuryLedger.create).toHaveBeenCalledWith({
      data: {
        walletId: 'pw_brl',
        currency: 'BRL',
        direction: 'credit',
        bucket: MarketplaceTreasuryBucket.AVAILABLE,
        amountInCents: 5_000n,
        kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_CREDIT,
        orderId: 'payout_failed:po_marketplace_treasury_123',
        reason: 'marketplace_treasury_payout_failed_credit',
        metadata: {
          stripePayoutId: 'po_marketplace_treasury_123',
        },
      },
    });
    expect(tx.marketplaceTreasury.update).toHaveBeenCalledWith({
      where: { id: 'pw_brl' },
      data: {
        availableBalanceInCents: { increment: 5_000n },
      },
    });
  });
});
