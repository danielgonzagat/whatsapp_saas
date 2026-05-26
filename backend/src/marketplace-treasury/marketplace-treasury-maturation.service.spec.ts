import { MarketplaceTreasuryBucket, MarketplaceTreasuryLedgerKind } from '@prisma/client';

import { MarketplaceTreasuryMaturationService } from './marketplace-treasury-maturation.service';describe('MarketplaceTreasuryMaturationService.matureDueCredits', () => {
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
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn(
        async (cb: (tx: object) => Promise<void>) => {
          const tx = {
            marketplaceTreasuryLedger: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
          };
          await cb(tx);
        },
      ),
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
    const result = await service.matureDueCredits(
      new Date('2026-04-10T00:00:00Z'),
    );

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
      expect.anything(),
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
      expect.anything(),
    );
    expect(result).toEqual({ scanned: 1, matured: 1, skipped: 0, failed: 0 });
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });  it('skips credits already matured idempotently via in-transaction check', async () => {
    const txFindFirst = jest.fn().mockResolvedValue({ id: 'existing' });
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
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn(
        async (cb: (tx: object) => Promise<void>) => {
          const tx = {
            marketplaceTreasuryLedger: {
              findFirst: txFindFirst,
            },
          };
          await cb(tx);
        },
      ),
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
    const result = await service.matureDueCredits(
      new Date('2026-04-10T00:00:00Z'),
    );

    // Transaction is entered but wallet.append is never called
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(wallet.append).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, matured: 0, skipped: 1, failed: 0 });
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });  it('counts failures without aborting the whole batch', async () => {
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
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn().mockRejectedValue(new Error('boom')),
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
    const result = await service.matureDueCredits(
      new Date('2026-04-10T00:00:00Z'),
    );

    expect(result).toEqual({ scanned: 1, matured: 0, skipped: 0, failed: 1 });
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'marketplace treasury maturation failed',
      {
        details: {
          entryId: 'pwl_fail',
          currency: 'BRL',
          error: 'boom',
          errorCode: undefined,
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
          errorCode: undefined,
        },
      },
    });
  });  it('treats P2002 unique-constraint violation as idempotent skip', async () => {
    const p2002Error = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pwl_p2002',
            currency: 'BRL',
            amountInCents: 5_000n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ]),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn().mockRejectedValue(p2002Error),
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
    const result = await service.matureDueCredits(
      new Date('2026-04-10T00:00:00Z'),
    );

    // P2002 is an idempotent skip, NOT a failure
    expect(result).toEqual({ scanned: 1, matured: 0, skipped: 1, failed: 0 });
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });  it('treats P2025 record-not-found as skip', async () => {
    const p2025Error = Object.assign(
      new Error('Record to update not found'),
      { code: 'P2025' },
    );
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pwl_p2025',
            currency: 'BRL',
            amountInCents: 3_000n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ]),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn().mockRejectedValue(p2025Error),
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
    const result = await service.matureDueCredits(
      new Date('2026-04-10T00:00:00Z'),
    );

    // P2025 is a skip, NOT a failure
    expect(result).toEqual({ scanned: 1, matured: 0, skipped: 1, failed: 0 });
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });  it('handles mixed results across a batch', async () => {
    const p2002Error = Object.assign(new Error('Unique constraint'), {
      code: 'P2002',
    });
    let callCount = 0;
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pwl_ok',
            currency: 'BRL',
            amountInCents: 1_000n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
          {
            id: 'pwl_skip',
            currency: 'BRL',
            amountInCents: 2_000n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
          {
            id: 'pwl_p2002',
            currency: 'BRL',
            amountInCents: 3_000n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
          {
            id: 'pwl_fail',
            currency: 'BRL',
            amountInCents: 4_000n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ]),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn(
        async (cb: (tx: object) => Promise<void>) => {
          callCount += 1;
          if (callCount === 1) {
            // pwl_ok: success
            const tx = {
              marketplaceTreasuryLedger: {
                findFirst: jest.fn().mockResolvedValue(null),
              },
            };
            await cb(tx);
          } else if (callCount === 2) {
            // pwl_skip: already matured
            const tx = {
              marketplaceTreasuryLedger: {
                findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
              },
            };
            await cb(tx);
          } else if (callCount === 3) {
            // pwl_p2002: unique constraint
            throw p2002Error;
          } else {
            // pwl_fail: generic error
            throw new Error('connection lost');
          }
        },
      ),
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
    const result = await service.matureDueCredits(
      new Date('2026-04-10T00:00:00Z'),
    );

    expect(result).toEqual({
      scanned: 4,
      matured: 1,
      skipped: 2, // one idempotent + one P2002
      failed: 1,
    });
    expect(wallet.append).toHaveBeenCalledTimes(2); // only pwl_ok
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledTimes(1); // only pwl_fail
  });  it('handles non-Error rejection strings', async () => {
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pwl_str',
            currency: 'BRL',
            amountInCents: 100n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ]),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn().mockRejectedValue('raw string failure'),
    };
    const wallet = { append: jest.fn() };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

    const service = new MarketplaceTreasuryMaturationService(
      prisma as never,
      wallet as never,
      financialAlert as never,
    );
    const result = await service.matureDueCredits(
      new Date('2026-04-10T00:00:00Z'),
    );

    expect(result).toEqual({ scanned: 1, matured: 0, skipped: 0, failed: 1 });
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'marketplace treasury maturation failed',
      {
        details: {
          entryId: 'pwl_str',
          currency: 'BRL',
          error: 'raw string failure',
          errorCode: undefined,
        },
      },
    );
  });  it('handles empty batch', async () => {
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      adminAuditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const wallet = { append: jest.fn() };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

    const service = new MarketplaceTreasuryMaturationService(
      prisma as never,
      wallet as never,
      financialAlert as never,
    );
    const result = await service.matureDueCredits(
      new Date('2026-04-10T00:00:00Z'),
    );

    expect(result).toEqual({ scanned: 0, matured: 0, skipped: 0, failed: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(wallet.append).not.toHaveBeenCalled();
  });  it('handles P2002 error without code property via duck-typing', async () => {
    // prismaErrorCode should handle errors where 'code' exists as a property
    // but the object is not a PrismaClientKnownRequestError instance
    const duckError = { code: 'P2002', message: 'duck' };
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pwl_duck',
            currency: 'BRL',
            amountInCents: 1_000n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ]),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      $transaction: jest.fn().mockRejectedValue(duckError),
    };
    const wallet = { append: jest.fn() };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

    const service = new MarketplaceTreasuryMaturationService(
      prisma as never,
      wallet as never,
      financialAlert as never,
    );
    const result = await service.matureDueCredits(
      new Date('2026-04-10T00:00:00Z'),
    );

    expect(result).toEqual({ scanned: 1, matured: 0, skipped: 1, failed: 0 });
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
  });  it('runCron delegates to matureDueCredits', async () => {
    const prisma = {
      marketplaceTreasuryLedger: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      adminAuditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const wallet = { append: jest.fn() };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };

    const service = new MarketplaceTreasuryMaturationService(
      prisma as never,
      wallet as never,
      financialAlert as never,
    );
    await service.runCron();

    expect(prisma.marketplaceTreasuryLedger.findMany).toHaveBeenCalled();
  });
});