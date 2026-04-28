import type { PrismaService } from '../prisma/prisma.service';
import { LedgerReconciliationService } from './ledger-reconciliation.service';
import { makePrisma } from './ledger-reconciliation.service.spec.helpers';

describe('LedgerReconciliationService — invariant I12 (wallet ledger consistency)', () => {
  it('runs the wallet reconciliation cron', async () => {
    const prisma = makePrisma();
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(
      prisma as never as PrismaService,
      financialAlert as never,
    );
    const runSpy = jest.spyOn(service, 'runWalletReconciliation').mockResolvedValue({
      scannedWallets: 0,
      drifts: [],
      scannedAt: new Date().toISOString(),
    });

    await service.runWalletCron();

    expect(runSpy).toHaveBeenCalled();
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
  });

  it('alerts when the wallet reconciliation cron itself fails', async () => {
    const prisma = makePrisma();
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(
      prisma as never as PrismaService,
      financialAlert as never,
    );
    jest.spyOn(service, 'runWalletReconciliation').mockRejectedValue(new Error('wallet cron boom'));

    await service.runWalletCron();

    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'wallet ledger reconciliation cron failed',
      {
        details: {
          error: 'wallet cron boom',
        },
      },
    );
  });

  it('returns zero drifts when no wallets exist', async () => {
    const prisma = makePrisma();
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result = await service.runWalletReconciliation();

    expect(result.scannedWallets).toBe(0);
    expect(result.drifts).toHaveLength(0);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('returns zero drifts when balance equals ledger sum across all buckets', async () => {
    const prisma = makePrisma({
      kloelWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-1',
            workspaceId: 'ws-1',
            availableBalanceInCents: BigInt(7000),
            pendingBalanceInCents: BigInt(2300),
            blockedBalanceInCents: BigInt(0),
          },
        ]),
      },
      kloelWalletLedger: {
        groupBy: jest.fn().mockResolvedValue([
          { bucket: 'available', direction: 'credit', _sum: { amountInCents: BigInt(9300) } },
          { bucket: 'available', direction: 'debit', _sum: { amountInCents: BigInt(2300) } },
          { bucket: 'pending', direction: 'credit', _sum: { amountInCents: BigInt(2300) } },
        ]),
      },
    });
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result = await service.runWalletReconciliation();

    expect(result.scannedWallets).toBe(1);
    expect(result.drifts).toHaveLength(0);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('flags wallets where stored balance does NOT equal ledger sum (I12)', async () => {
    const prisma = makePrisma({
      kloelWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-drift',
            workspaceId: 'ws-2',
            // Stored balance says 5000, but the ledger only sums to 4000.
            // This is exactly the drift the cron must catch.
            availableBalanceInCents: BigInt(5000),
            pendingBalanceInCents: BigInt(0),
            blockedBalanceInCents: BigInt(0),
          },
        ]),
      },
      kloelWalletLedger: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { bucket: 'available', direction: 'credit', _sum: { amountInCents: BigInt(4000) } },
          ]),
      },
    });
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(
      prisma as never as PrismaService,
      financialAlert as never,
    );

    const result = await service.runWalletReconciliation();

    expect(result.scannedWallets).toBe(1);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].kind).toBe('wallet_balance_ledger_mismatch');
    expect(result.drifts[0].workspaceId).toBe('ws-2');
    expect(result.drifts[0].details.bucket).toBe('available');
    expect(result.drifts[0].details.storedInCents).toBe('5000');
    expect(result.drifts[0].details.ledgerSumInCents).toBe('4000');
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'wallet ledger reconciliation drift detected',
      {
        details: {
          scannedWallets: 1,
          driftCount: 1,
        },
      },
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'system.wallet.reconcile_drift',
        entityType: 'kloel_wallet',
        details: {
          scannedWallets: 1,
          driftCount: 1,
          sampleDrifts: [
            {
              orderId: 'wallet-drift',
              workspaceId: 'ws-2',
              kind: 'wallet_balance_ledger_mismatch',
              details: {
                walletId: 'wallet-drift',
                bucket: 'available',
                storedInCents: '5000',
                ledgerSumInCents: '4000',
                creditInCents: '4000',
                debitInCents: '0',
              },
            },
          ],
        },
      },
    });
  });

  it('flags drift on multiple buckets independently', async () => {
    const prisma = makePrisma({
      kloelWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-multi-drift',
            workspaceId: 'ws-3',
            availableBalanceInCents: BigInt(1000),
            pendingBalanceInCents: BigInt(2000),
            blockedBalanceInCents: BigInt(0),
          },
        ]),
      },
      kloelWalletLedger: {
        // Available: 0 (mismatch with stored 1000)
        // Pending:   500 (mismatch with stored 2000)
        // Blocked:   0 (matches)
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { bucket: 'pending', direction: 'credit', _sum: { amountInCents: BigInt(500) } },
          ]),
      },
    });
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result = await service.runWalletReconciliation();

    expect(result.drifts.length).toBe(2);
    const buckets = result.drifts.map((d) => d.details.bucket).sort();
    expect(buckets).toEqual(['available', 'pending']);
  });

  it('treats a wallet with no ledger entries as drift if balance is non-zero', async () => {
    const prisma = makePrisma({
      kloelWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-orphan',
            workspaceId: 'ws-4',
            availableBalanceInCents: BigInt(123),
            pendingBalanceInCents: BigInt(0),
            blockedBalanceInCents: BigInt(0),
          },
        ]),
      },
      // groupBy returns empty — no ledger entries for this wallet.
      kloelWalletLedger: { groupBy: jest.fn().mockResolvedValue([]) },
    });
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result = await service.runWalletReconciliation();

    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].details.bucket).toBe('available');
    expect(result.drifts[0].details.storedInCents).toBe('123');
    expect(result.drifts[0].details.ledgerSumInCents).toBe('0');
  });
});
