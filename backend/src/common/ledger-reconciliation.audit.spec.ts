import type { FinancialAlertService } from './financial-alert.service';
import type { PrismaService } from '../prisma/prisma.service';
import { LedgerReconciliationService } from './ledger-reconciliation.service';
import { makePrisma } from './ledger-reconciliation.service.spec.helpers';

describe('LedgerReconciliationService — append-only invariant & double-entry balance', () => {
  it('enforces double-entry: credit - debit must equal stored balance', async () => {
    const prisma = makePrisma({
      kloelWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-de',
            workspaceId: 'ws-5',
            availableBalanceInCents: BigInt(5000),
            pendingBalanceInCents: BigInt(3000),
            blockedBalanceInCents: BigInt(2000),
          },
        ]),
      },
      kloelWalletLedger: {
        groupBy: jest.fn().mockResolvedValue([
          { bucket: 'available', direction: 'credit', _sum: { amountInCents: BigInt(7500) } },
          { bucket: 'available', direction: 'debit', _sum: { amountInCents: BigInt(2500) } },
          { bucket: 'pending', direction: 'credit', _sum: { amountInCents: BigInt(3000) } },
          { bucket: 'blocked', direction: 'credit', _sum: { amountInCents: BigInt(2000) } },
        ]),
      },
    });
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result = await service.runWalletReconciliation();

    expect(result.drifts).toHaveLength(0);
    // available: 7500 - 2500 = 5000 ✓
    // pending:  3000 - 0 = 3000 ✓
    // blocked:  2000 - 0 = 2000 ✓
  });

  it('detects when a debit violates double-entry (stored insufficient)', async () => {
    const prisma = makePrisma({
      kloelWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-over-debit',
            workspaceId: 'ws-6',
            availableBalanceInCents: BigInt(100),
            pendingBalanceInCents: BigInt(0),
            blockedBalanceInCents: BigInt(0),
          },
        ]),
      },
      kloelWalletLedger: {
        groupBy: jest.fn().mockResolvedValue([
          { bucket: 'available', direction: 'credit', _sum: { amountInCents: BigInt(500) } },
          { bucket: 'available', direction: 'debit', _sum: { amountInCents: BigInt(600) } },
        ]),
      },
    });
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result = await service.runWalletReconciliation();

    // 500 - 600 = -100, stored = 100 → mismatch
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].details.ledgerSumInCents).toBe('-100');
    expect(result.drifts[0].details.storedInCents).toBe('100');
  });
});

describe('LedgerReconciliationService — replay safety & transaction consistency', () => {
  it('scans each wallet exactly once despite multiple calls', async () => {
    const prisma = makePrisma({
      kloelWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-replay-safe',
            workspaceId: 'ws-7',
            availableBalanceInCents: BigInt(1000),
            pendingBalanceInCents: BigInt(0),
            blockedBalanceInCents: BigInt(0),
          },
        ]),
      },
      kloelWalletLedger: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { bucket: 'available', direction: 'credit', _sum: { amountInCents: BigInt(1000) } },
          ]),
      },
    });
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result1 = await service.runWalletReconciliation();
    const result2 = await service.runWalletReconciliation();

    expect(result1.scannedWallets).toBe(1);
    expect(result2.scannedWallets).toBe(1);
    expect(result1.drifts).toHaveLength(0);
    expect(result2.drifts).toHaveLength(0);
    expect(prisma.kloelWallet.findMany).toHaveBeenCalledTimes(2);
  });

  it('is read-only: does not mutate wallet or ledger tables', async () => {
    const prisma = makePrisma({
      kloelWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-readonly',
            workspaceId: 'ws-8',
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
            { bucket: 'available', direction: 'credit', _sum: { amountInCents: BigInt(5000) } },
          ]),
      },
    });
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    await service.runWalletReconciliation();

    // Only findMany and groupBy should be called, never create/update/delete
    expect(prisma.kloelWallet.findMany.mock.calls.length).toBeGreaterThan(0);
    expect(prisma.kloelWalletLedger.groupBy.mock.calls.length).toBeGreaterThan(0);
    // Ensure no mutation methods were called
    const walletMethods = Object.keys(prisma.kloelWallet);
    const ledgerMethods = Object.keys(prisma.kloelWalletLedger);
    const mutationMethods = ['create', 'update', 'upsert', 'delete'];
    for (const method of mutationMethods) {
      expect(walletMethods).not.toContain(method);
      expect(ledgerMethods).not.toContain(method);
    }
  });
});

describe('LedgerReconciliationService — missing transaction detection', () => {
  it('detects missing webhook event for paid checkout orders', async () => {
    const prisma = makePrisma({
      checkoutOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-missing-wh',
            workspaceId: 'ws-9',
            status: 'SHIPPED',
            paidAt: new Date(),
            payment: {
              id: 'pay-9',
              status: 'CONFIRMED',
              gateway: 'stripe',
              externalId: 'ch_missing',
            },
          },
        ]),
      },
      webhookEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result = await service.runReconciliation(24);

    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].kind).toBe('webhook_event_missing');
    expect(result.drifts[0].details.externalId).toBe('ch_missing');
  });

  it('detects when payment has no externalId and skips without flagging', async () => {
    const prisma = makePrisma({
      checkoutOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-no-ext',
            workspaceId: 'ws-10',
            status: 'PAID',
            paidAt: new Date(),
            payment: {
              id: 'pay-10',
              status: 'CONFIRMED',
              gateway: 'stripe',
              externalId: null,
            },
          },
        ]),
      },
    });
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result = await service.runReconciliation(24);

    // No drift flagged because externalId is missing (skip allowed)
    expect(result.drifts).toHaveLength(0);
    expect(result.scannedOrders).toBe(1);
  });
});

describe('LedgerReconciliationService — divergence reporting & audit trail', () => {
  it('logs divergence summary and individual drifts when found', async () => {
    const prisma = makePrisma({
      checkoutOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-drift-1',
            workspaceId: 'ws-11',
            status: 'PAID',
            paidAt: new Date(),
            payment: null,
          },
          {
            id: 'order-drift-2',
            workspaceId: 'ws-11',
            status: 'DELIVERED',
            paidAt: new Date(),
            payment: {
              id: 'pay-11',
              status: 'PENDING',
              gateway: 'stripe',
              externalId: 'ext-11',
            },
          },
        ]),
      },
    });
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(
      prisma as never as PrismaService,
      financialAlert as never as FinancialAlertService,
    );

    const result = await service.runReconciliation(24);

    // Two drifts detected
    expect(result.drifts).toHaveLength(2);
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'ledger reconciliation drift detected',
      expect.objectContaining({
        details: {
          scannedOrders: 2,
          driftCount: 2,
        },
      }),
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          action: 'system.checkout.reconcile_drift',
          entityType: 'checkout_order',
          details: expect.objectContaining({
            scannedOrders: 2,
            driftCount: 2,
          }),
        },
      }),
    );
  });

  it('does not alert or audit when reconciliation is clean', async () => {
    const prisma = makePrisma({
      checkoutOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-clean',
            workspaceId: 'ws-12',
            status: 'PAID',
            paidAt: new Date(),
            payment: {
              id: 'pay-12',
              status: 'CONFIRMED',
              gateway: 'stripe',
              externalId: 'ext-12',
            },
          },
        ]),
      },
      webhookEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wh-12',
          status: 'processed',
        }),
      },
    });
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(
      prisma as never as PrismaService,
      financialAlert as never as FinancialAlertService,
    );

    await service.runReconciliation(24);

    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('reports wallet drift counts per bucket in audit trail', async () => {
    const prisma = makePrisma({
      kloelWallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-multi-audit',
            workspaceId: 'ws-13',
            availableBalanceInCents: BigInt(1000),
            pendingBalanceInCents: BigInt(2000),
            blockedBalanceInCents: BigInt(3000),
          },
        ]),
      },
      kloelWalletLedger: {
        groupBy: jest.fn().mockResolvedValue([
          { bucket: 'available', direction: 'credit', _sum: { amountInCents: BigInt(500) } },
          { bucket: 'pending', direction: 'credit', _sum: { amountInCents: BigInt(1000) } },
        ]),
      },
    });
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(
      prisma as never as PrismaService,
      financialAlert as never as FinancialAlertService,
    );

    await service.runWalletReconciliation();

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'system.wallet.reconcile_drift',
          entityType: 'kloel_wallet',
          details: expect.objectContaining({
            driftCount: 3,
            sampleDrifts: expect.arrayContaining([
              expect.objectContaining({
                details: expect.objectContaining({ bucket: 'available' }),
              }),
              expect.objectContaining({
                details: expect.objectContaining({ bucket: 'pending' }),
              }),
              expect.objectContaining({
                details: expect.objectContaining({ bucket: 'blocked' }),
              }),
            ]),
          }),
        }),
      }),
    );
  });
});
