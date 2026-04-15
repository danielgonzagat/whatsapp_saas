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
    const svc = new PlatformWalletReconcileService(prisma as never);
    const report = await svc.reconcile('BRL');
    expect(report.healthy).toBe(true);
    expect(report.ledgerAvailableInCents).toBe(500);
    expect(report.walletAvailableInCents).toBe(500);
    expect(report.availableDriftInCents).toBe(0);
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
    const svc = new PlatformWalletReconcileService(prisma as never);
    const report = await svc.reconcile('BRL');
    expect(report.healthy).toBe(false);
    expect(report.ledgerAvailableInCents).toBe(500);
    expect(report.walletAvailableInCents).toBe(999);
    expect(report.availableDriftInCents).toBe(499);
  });

  it('returns a zero-state report when no wallet exists yet', async () => {
    const prisma = makePrisma(null, []);
    const svc = new PlatformWalletReconcileService(prisma as never);
    const report = await svc.reconcile('BRL');
    expect(report.healthy).toBe(true);
    expect(report.ledgerAvailableInCents).toBe(0);
    expect(report.walletAvailableInCents).toBe(0);
  });
});
