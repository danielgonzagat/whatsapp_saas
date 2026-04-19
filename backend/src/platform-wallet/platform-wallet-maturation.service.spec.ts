import { PlatformWalletBucket, PlatformLedgerKind } from '@prisma/client';

import { PlatformWalletMaturationService } from './platform-wallet-maturation.service';

describe('PlatformWalletMaturationService.matureDueCredits', () => {
  it('moves due platform fee credits from pending to available using append-only entries', async () => {
    const prisma = {
      platformWalletLedger: {
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

    const service = new PlatformWalletMaturationService(
      prisma as never,
      wallet as never,
      financialAlert as never,
    );
    const result = await service.matureDueCredits(new Date('2026-04-10T00:00:00Z'));

    expect(prisma.platformWalletLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: PlatformLedgerKind.PLATFORM_FEE_CREDIT,
          direction: 'credit',
          bucket: PlatformWalletBucket.PENDING,
        }),
      }),
    );
    expect(wallet.append).toHaveBeenNthCalledWith(
      1,
      {
        currency: 'BRL',
        direction: 'debit',
        bucket: PlatformWalletBucket.PENDING,
        amountInCents: 4_980n,
        kind: PlatformLedgerKind.ADJUSTMENT_DEBIT,
        orderId: 'mature:pending:pwl_1',
        reason: 'platform_wallet_mature_pending_debit',
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
        bucket: PlatformWalletBucket.AVAILABLE,
        amountInCents: 4_980n,
        kind: PlatformLedgerKind.ADJUSTMENT_CREDIT,
        orderId: 'mature:available:pwl_1',
        reason: 'platform_wallet_mature_available_credit',
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
      platformWalletLedger: {
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

    const service = new PlatformWalletMaturationService(
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
      platformWalletLedger: {
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

    const service = new PlatformWalletMaturationService(
      prisma as never,
      wallet as never,
      financialAlert as never,
    );
    const result = await service.matureDueCredits(new Date('2026-04-10T00:00:00Z'));

    expect(result).toEqual({ scanned: 1, matured: 0, skipped: 0, failed: 1 });
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'platform wallet maturation failed',
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
        entityType: 'platform_wallet_ledger',
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
