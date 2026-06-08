import { SaleLedgerReconcileScheduler } from './sale-ledger-reconcile.scheduler';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Covers the ADDITIVE, read-only runnable surface that wires the existing
 * `scanSaleLedgerDivergence` detector into a NestJS @Cron.
 *
 * Contract:
 *   - the scheduler enumerates active workspaces (distinct workspaceIds of
 *     terminal-paid Payments) and runs the READ-ONLY scan per workspace;
 *   - it NEVER writes — no `kloelSale.updateMany` (the gated back-fill is not
 *     reachable from this surface), regardless of KLOEL_SALE_LEDGER_RECONCILE;
 *   - the @Cron handler is fail-open: a thrown error is swallowed (it routes to
 *     the optional ops-alert sink and logs, but never re-throws).
 */
describe('SaleLedgerReconcileScheduler (read-only divergence scan surface)', () => {
  const originalFlag = process.env.KLOEL_SALE_LEDGER_RECONCILE;

  type MockPrisma = {
    payment: { findMany: jest.Mock };
    kloelSale: { findFirst: jest.Mock; updateMany: jest.Mock };
  };

  function buildPrisma(overrides?: {
    activeWorkspaceIds?: string[];
    payments?: unknown[];
    sale?: unknown;
  }): MockPrisma {
    const activeWorkspaceIds = overrides?.activeWorkspaceIds ?? ['ws-1'];
    const payment = {
      findMany: jest.fn(async (args: { distinct?: unknown; select?: unknown }) => {
        // The first call enumerates active workspaces (distinct workspaceId);
        // subsequent calls (inside scanSaleLedgerDivergence) load the payments.
        if (args && args.distinct) {
          return activeWorkspaceIds.map((workspaceId) => ({ workspaceId }));
        }
        return (
          overrides?.payments ?? [
            { id: 'pay-1', workspaceId: 'ws-1', externalId: 'pi_abc', status: 'RECEIVED' },
          ]
        );
      }),
    };
    return {
      payment,
      kloelSale: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            overrides && 'sale' in overrides
              ? overrides.sale
              : { id: 'sale-1', status: 'pending', externalPaymentId: 'pi_abc' },
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.KLOEL_SALE_LEDGER_RECONCILE;
    } else {
      process.env.KLOEL_SALE_LEDGER_RECONCILE = originalFlag;
    }
    jest.restoreAllMocks();
  });

  it('scans active workspaces read-only and reports divergences (no writes)', async () => {
    const prisma = buildPrisma();
    const scheduler = new SaleLedgerReconcileScheduler(prisma as unknown as PrismaService);

    const summary = await scheduler.scanActiveWorkspaces();

    expect(summary.scannedWorkspaces).toBe(1);
    expect(summary.scannedPayments).toBe(1);
    expect(summary.divergenceCount).toBe(1);
    expect(summary.byWorkspace).toEqual([{ workspaceId: 'ws-1', divergences: 1 }]);
    // Read-only invariant: the write delegate is NEVER called.
    expect(prisma.kloelSale.updateMany).not.toHaveBeenCalled();
  });

  it('never writes even when KLOEL_SALE_LEDGER_RECONCILE=true (flip not reachable here)', async () => {
    process.env.KLOEL_SALE_LEDGER_RECONCILE = 'true';
    const prisma = buildPrisma();
    const scheduler = new SaleLedgerReconcileScheduler(prisma as unknown as PrismaService);

    await scheduler.scanActiveWorkspaces();

    // The gated back-fill lives in reconcileSaleLedger, which this surface
    // never calls — so the flag being ON must still produce zero writes.
    expect(prisma.kloelSale.updateMany).not.toHaveBeenCalled();
  });

  it('reports clean when no active workspace has a divergence', async () => {
    const prisma = buildPrisma({
      sale: { id: 'sale-1', status: 'paid', externalPaymentId: 'pi_abc' },
    });
    const scheduler = new SaleLedgerReconcileScheduler(prisma as unknown as PrismaService);

    const summary = await scheduler.scanActiveWorkspaces();

    expect(summary.divergenceCount).toBe(0);
    expect(summary.byWorkspace).toEqual([]);
    expect(prisma.kloelSale.updateMany).not.toHaveBeenCalled();
  });

  it('aggregates across multiple active workspaces', async () => {
    const prisma = buildPrisma({ activeWorkspaceIds: ['ws-1', 'ws-2'] });
    const scheduler = new SaleLedgerReconcileScheduler(prisma as unknown as PrismaService);

    const summary = await scheduler.scanActiveWorkspaces();

    expect(summary.scannedWorkspaces).toBe(2);
    // Each workspace scan finds the one diverged sale row from the mock.
    expect(summary.divergenceCount).toBe(2);
  });

  it('cron handler is fail-open — swallows errors and never re-throws', async () => {
    const prisma = buildPrisma();
    prisma.payment.findMany.mockRejectedValueOnce(new Error('db down'));
    const opsAlert = { alertOnCriticalError: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new SaleLedgerReconcileScheduler(
      prisma as unknown as PrismaService,
      opsAlert as never,
    );

    await expect(scheduler.runSaleLedgerScanCron()).resolves.toBeUndefined();
    expect(opsAlert.alertOnCriticalError).toHaveBeenCalledTimes(1);
  });

  it('cron handler runs the scan when healthy', async () => {
    const prisma = buildPrisma();
    const scheduler = new SaleLedgerReconcileScheduler(prisma as unknown as PrismaService);

    await expect(scheduler.runSaleLedgerScanCron()).resolves.toBeUndefined();
    // distinct-enumeration call + one per-workspace payment load.
    expect(prisma.payment.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.kloelSale.updateMany).not.toHaveBeenCalled();
  });
});
