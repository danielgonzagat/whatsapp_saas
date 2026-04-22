import { MarketplaceTreasuryBucket, MarketplaceTreasuryLedgerKind } from '@prisma/client';

import { MarketplaceTreasuryMaturationService } from './marketplace-treasury-maturation.service';

describe('MarketplaceTreasuryMaturationService.matureDueCredits', () => {
  it('moves due marketplace fee credits from pending to available using append-only entries', async () => {
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pwl_1',
            currency: 'BRL',
            amountInCents: 4_980n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn(async (cb: (tx: object) => Promise<void>) => cb({})),
    };
    const wallet = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

    const service = new MarketplaceTreasuryMaturationService(
      prisma as never,
      wallet as never,
      financialAlert as never,
    );
    const result = await service.matureDueCredits(new Date('2026-04-10T00:00:00Z'));

    expect(prisma.marketplaceTreasuryLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: MarketplaceTreasuryLedgerKind.MARKETPLACE_FEE_CREDIT,
          direction: 'credit',
          bucket: MarketplaceTreasuryBucket.PENDING,
        }),
      }),
    );
    expect(wallet.append).toHaveBeenNthCalledWith(
      1,
      {
        currency: 'BRL',
        direction: 'debit',
        bucket: MarketplaceTreasuryBucket.PENDING,
        amountInCents: 4_980n,
        kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_DEBIT,
        orderId: 'mature:pending:pwl_1',
        reason: 'marketplace_treasury_mature_pending_debit',
        metadata: {
          sourceLedgerEntryId: 'pwl_1',
        },
      },
      {},
    );
    expect(wallet.append).toHaveBeenNthCalledWith(
      2,
      {
        currency: 'BRL',
        direction: 'credit',
        bucket: MarketplaceTreasuryBucket.AVAILABLE,
        amountInCents: 4_980n,
        kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_CREDIT,
        orderId: 'mature:available:pwl_1',
        reason: 'marketplace_treasury_mature_available_credit',
        metadata: {
          sourceLedgerEntryId: 'pwl_1',
        },
      },
      {},
    );
    expect(result).toEqual({ scanned: 1, matured: 1, skipped: 0, failed: 0 });
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('skips credits already matured idempotently', async () => {
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pwl_1',
            currency: 'BRL',
            amountInCents: 4_980n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn(),
    };
    const wallet = {
      append: jest.fn(),
    };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

    const service = new MarketplaceTreasuryMaturationService(
      prisma as never,
      wallet as never,
      financialAlert as never,
    );
    const result = await service.matureDueCredits(new Date('2026-04-10T00:00:00Z'));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(wallet.append).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, matured: 0, skipped: 1, failed: 0 });
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('counts failures without aborting the whole batch', async () => {
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pwl_fail',
            currency: 'BRL',
            amountInCents: 100n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn(async (cb: (tx: object) => Promise<void>) => cb({})),
    };
    const wallet = {
      append: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

    const service = new MarketplaceTreasuryMaturationService(
      prisma as never,
      wallet as never,
      financialAlert as never,
    );
    const result = await service.matureDueCredits(new Date('2026-04-10T00:00:00Z'));

    expect(result).toEqual({ scanned: 1, matured: 0, skipped: 0, failed: 1 });
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'marketplace treasury maturation failed',
      {
        details: {
          entryId: 'pwl_fail',
          currency: 'BRL',
          error: 'boom',
        },
      },
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'system.carteira.maturation_failed',
        entityType: 'marketplace_treasury_ledger',
        entityId: 'pwl_fail',
        details: {
          entryId: 'pwl_fail',
          currency: 'BRL',
          error: 'boom',
        },
      },
    });
  });
});
