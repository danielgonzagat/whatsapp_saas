import { PlatformLedgerKind, PlatformWalletBucket } from '@prisma/client';

import {
  PlatformWalletInsufficientAvailableBalanceError,
  PlatformWalletService,
} from './platform-wallet.service';

describe('PlatformWalletService', () => {
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
      platformWallet: {
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
      platformWalletLedger: {
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
      platformWallet: {
        upsert: jest.fn(),
      },
      platformWalletLedger: {
        create: jest.fn(),
      },
    };

    return {
      tx,
      prisma,
      service: new PlatformWalletService(prisma as never),
    };
  }

  it('debits available for payout with idempotent requestId semantics', async () => {
    const { service, tx } = buildService();

    await service.debitAvailableForPayout({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'platform_po_req_1',
      metadata: {
        requestId: 'platform_po_req_1',
      },
    });

    expect(tx.platformWallet.upsert).toHaveBeenCalledWith({
      where: { currency: 'BRL' },
      update: {},
      create: { currency: 'BRL' },
    });
    expect(tx.platformWalletLedger.findFirst).toHaveBeenCalledWith({
      where: {
        currency: 'BRL',
        kind: PlatformLedgerKind.PAYOUT_DEBIT,
        orderId: 'platform_po_req_1',
      },
    });
    expect(tx.platformWalletLedger.create).toHaveBeenCalledWith({
      data: {
        walletId: 'pw_brl',
        currency: 'BRL',
        direction: 'debit',
        bucket: PlatformWalletBucket.AVAILABLE,
        amountInCents: 5_000n,
        kind: PlatformLedgerKind.PAYOUT_DEBIT,
        orderId: 'platform_po_req_1',
        reason: 'platform_wallet_payout_debit',
        metadata: {
          requestId: 'platform_po_req_1',
        },
      },
    });
    expect(tx.platformWallet.update).toHaveBeenCalledWith({
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
      requestId: 'platform_po_req_dup',
    });

    expect(tx.platformWalletLedger.create).not.toHaveBeenCalled();
    expect(tx.platformWallet.update).not.toHaveBeenCalled();
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
        requestId: 'platform_po_req_short',
      }),
    ).rejects.toBeInstanceOf(PlatformWalletInsufficientAvailableBalanceError);

    expect(tx.platformWalletLedger.create).not.toHaveBeenCalled();
    expect(tx.platformWallet.update).not.toHaveBeenCalled();
  });

  it('credits available by adjustment with idempotent requestId semantics', async () => {
    const { service, tx } = buildService();

    await service.creditAvailableByAdjustment({
      currency: 'BRL',
      amountInCents: 5_000n,
      requestId: 'payout_failed:po_platform_123',
      reason: 'platform_wallet_payout_failed_credit',
      metadata: {
        stripePayoutId: 'po_platform_123',
      },
    });

    expect(tx.platformWalletLedger.findFirst).toHaveBeenLastCalledWith({
      where: {
        currency: 'BRL',
        kind: PlatformLedgerKind.ADJUSTMENT_CREDIT,
        orderId: 'payout_failed:po_platform_123',
      },
    });
    expect(tx.platformWalletLedger.create).toHaveBeenCalledWith({
      data: {
        walletId: 'pw_brl',
        currency: 'BRL',
        direction: 'credit',
        bucket: PlatformWalletBucket.AVAILABLE,
        amountInCents: 5_000n,
        kind: PlatformLedgerKind.ADJUSTMENT_CREDIT,
        orderId: 'payout_failed:po_platform_123',
        reason: 'platform_wallet_payout_failed_credit',
        metadata: {
          stripePayoutId: 'po_platform_123',
        },
      },
    });
    expect(tx.platformWallet.update).toHaveBeenCalledWith({
      where: { id: 'pw_brl' },
      data: {
        availableBalanceInCents: { increment: 5_000n },
      },
    });
  });
});
