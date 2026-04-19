import { PlatformWalletReconcileService } from './platform-wallet-reconcile.service';

type StubWallet = {
  id: string;
  currency: string;
  availableBalanceInCents: bigint;
  pendingBalanceInCents: bigint;
  reservedBalanceInCents: bigint;
};

function makePrisma(
  wallet: StubWallet | null,
  ledgerRows: Array<{ direction: string; bucket: string; amountInCents: bigint }>,
) {
  return {
    platformWallet: {
      findUnique: async () => wallet,
    },
    platformWalletLedger: {
      groupBy: async ({ where }: { where: { bucket: string } }) => {
        const byDir: Record<string, bigint> = {};
        for (const row of ledgerRows.filter((r) => r.bucket === where.bucket)) {
          byDir[row.direction] = (byDir[row.direction] ?? BigInt(0)) + row.amountInCents;
        }
        return Object.entries(byDir).map(([direction, amount]) => ({
          direction,
          _sum: { amountInCents: amount },
        }));
      },
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
    },
  };
}

describe('PlatformWalletReconcileService', () => {
  it('reports healthy=true when ledger matches the materialised wallet', async () => {
    const wallet: StubWallet = {
      id: 'w1',
      currency: 'BRL',
      availableBalanceInCents: BigInt(500),
      pendingBalanceInCents: BigInt(0),
      reservedBalanceInCents: BigInt(0),
    };
    const prisma = makePrisma(wallet, [
      { direction: 'credit', bucket: 'AVAILABLE', amountInCents: BigInt(700) },
      { direction: 'debit', bucket: 'AVAILABLE', amountInCents: BigInt(200) },
    ]);
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const svc = new PlatformWalletReconcileService(prisma as never, financialAlert as never);
    const report = await svc.reconcile('BRL');
    expect(report.healthy).toBe(true);
    expect(report.ledgerAvailableInCents).toBe(500);
    expect(report.walletAvailableInCents).toBe(500);
    expect(report.availableDriftInCents).toBe(0);
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('reports drift when the materialised wallet disagrees with the ledger', async () => {
    const wallet: StubWallet = {
      id: 'w1',
      currency: 'BRL',
      availableBalanceInCents: BigInt(999),
      pendingBalanceInCents: BigInt(0),
      reservedBalanceInCents: BigInt(0),
    };
    const prisma = makePrisma(wallet, [
      { direction: 'credit', bucket: 'AVAILABLE', amountInCents: BigInt(500) },
    ]);
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const svc = new PlatformWalletReconcileService(prisma as never, financialAlert as never);
    const report = await svc.reconcile('BRL');
    expect(report.healthy).toBe(false);
    expect(report.ledgerAvailableInCents).toBe(500);
    expect(report.walletAvailableInCents).toBe(999);
    expect(report.availableDriftInCents).toBe(499);
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'platform wallet reconcile drift detected',
      {
        details: {
          currency: 'BRL',
          availableDriftInCents: 499,
          pendingDriftInCents: 0,
          reservedDriftInCents: 0,
        },
      },
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'system.carteira.reconcile_drift',
        entityType: 'platform_wallet',
        entityId: 'BRL',
        details: {
          currency: 'BRL',
          ledgerAvailableInCents: 500,
          ledgerPendingInCents: 0,
          ledgerReservedInCents: 0,
          walletAvailableInCents: 999,
          walletPendingInCents: 0,
          walletReservedInCents: 0,
          availableDriftInCents: 499,
          pendingDriftInCents: 0,
          reservedDriftInCents: 0,
        },
      },
    });
  });

  it('returns a zero-state report when no wallet exists yet', async () => {
    const prisma = makePrisma(null, []);
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const svc = new PlatformWalletReconcileService(prisma as never, financialAlert as never);
    const report = await svc.reconcile('BRL');
    expect(report.healthy).toBe(true);
    expect(report.ledgerAvailableInCents).toBe(0);
    expect(report.walletAvailableInCents).toBe(0);
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
