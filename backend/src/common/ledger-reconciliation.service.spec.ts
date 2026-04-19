import { LedgerReconciliationService } from './ledger-reconciliation.service';

function makePrisma(overrides: any = {}) {
  return {
    checkoutOrder: {
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.checkoutOrder,
    },
    webhookEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...overrides.webhookEvent,
    },
    kloelWallet: {
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.kloelWallet,
    },
    kloelWalletLedger: {
      groupBy: jest.fn().mockResolvedValue([]),
      ...overrides.kloelWalletLedger,
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      ...overrides.adminAuditLog,
    },
  };
}

describe('LedgerReconciliationService — invariant I8 (ledger consistency)', () => {
  it('runs the checkout reconciliation cron on the default 24h window', async () => {
    const prisma = makePrisma();
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(prisma as any, financialAlert as any);
    const runSpy = jest.spyOn(service, 'runReconciliation').mockResolvedValue({
      scannedOrders: 0,
      drifts: [],
      scannedAt: new Date().toISOString(),
    });

    await service.runCheckoutCron();

    expect(runSpy).toHaveBeenCalledWith(24);
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
  });

  it('alerts when the checkout reconciliation cron itself fails', async () => {
    const prisma = makePrisma();
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(prisma as any, financialAlert as any);
    jest.spyOn(service, 'runReconciliation').mockRejectedValue(new Error('cron boom'));

    await service.runCheckoutCron();

    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'ledger reconciliation cron failed',
      {
        details: {
          error: 'cron boom',
        },
      },
    );
  });

  it('returns an empty result when no orders exist in the window', async () => {
    const prisma = makePrisma();
    const service = new LedgerReconciliationService(prisma as any);

    const result = await service.runReconciliation(24);

    expect(result.scannedOrders).toBe(0);
    expect(result.drifts).toHaveLength(0);
    expect(typeof result.scannedAt).toBe('string');
  });

  it('flags orders without a corresponding payment record', async () => {
    const prisma = makePrisma({
      checkoutOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-1',
            workspaceId: 'ws-1',
            status: 'PAID',
            paidAt: new Date(),
            payment: null,
          },
        ]),
      },
    });
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(prisma as any, financialAlert as any);

    const result = await service.runReconciliation(24);

    expect(result.scannedOrders).toBe(1);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0]).toMatchObject({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      kind: 'order_without_payment',
    });
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'ledger reconciliation drift detected',
      {
        details: {
          scannedOrders: 1,
          driftCount: 1,
        },
      },
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'system.checkout.reconcile_drift',
        entityType: 'checkout_order',
        details: {
          scannedOrders: 1,
          driftCount: 1,
          kinds: {
            order_without_payment: 1,
          },
          sampleDrifts: [
            {
              orderId: 'order-1',
              workspaceId: 'ws-1',
              kind: 'order_without_payment',
              details: { orderStatus: 'PAID' },
            },
          ],
        },
      },
    });
  });

  it('flags orders whose payment status does not match the order status', async () => {
    const prisma = makePrisma({
      checkoutOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-2',
            workspaceId: 'ws-1',
            status: 'PAID',
            paidAt: new Date(),
            payment: {
              id: 'pay-2',
              status: 'PENDING',
              gateway: 'stripe',
              externalId: 'ext-2',
            },
          },
        ]),
      },
    });
    const service = new LedgerReconciliationService(prisma as any);

    const result = await service.runReconciliation(24);

    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].kind).toBe('payment_status_mismatch');
    expect(result.drifts[0].details).toMatchObject({
      orderStatus: 'PAID',
      paymentStatus: 'PENDING',
    });
  });

  it('flags orders whose webhook event is missing', async () => {
    const prisma = makePrisma({
      checkoutOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-3',
            workspaceId: 'ws-1',
            status: 'PAID',
            paidAt: new Date(),
            payment: {
              id: 'pay-3',
              status: 'CONFIRMED',
              gateway: 'stripe',
              externalId: 'ext-3',
            },
          },
        ]),
      },
      webhookEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const service = new LedgerReconciliationService(prisma as any);

    const result = await service.runReconciliation(24);

    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].kind).toBe('webhook_event_missing');
  });

  it('flags webhook events that exist but are not processed', async () => {
    const prisma = makePrisma({
      checkoutOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-4',
            workspaceId: 'ws-1',
            status: 'PAID',
            paidAt: new Date(),
            payment: {
              id: 'pay-4',
              status: 'CONFIRMED',
              gateway: 'stripe',
              externalId: 'ext-4',
            },
          },
        ]),
      },
      webhookEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wh-4',
          status: 'failed',
        }),
      },
    });
    const service = new LedgerReconciliationService(prisma as any);

    const result = await service.runReconciliation(24);

    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].kind).toBe('webhook_event_unprocessed');
  });

  it('returns zero drifts when everything is consistent', async () => {
    const prisma = makePrisma({
      checkoutOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-5',
            workspaceId: 'ws-1',
            status: 'PAID',
            paidAt: new Date(),
            payment: {
              id: 'pay-5',
              status: 'CONFIRMED',
              gateway: 'stripe',
              externalId: 'ext-5',
            },
          },
        ]),
      },
      webhookEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wh-5',
          status: 'processed',
        }),
      },
    });
    const service = new LedgerReconciliationService(prisma as any);

    const result = await service.runReconciliation(24);

    expect(result.scannedOrders).toBe(1);
    expect(result.drifts).toHaveLength(0);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

describe('LedgerReconciliationService — invariant I12 (wallet ledger consistency)', () => {
  it('runs the wallet reconciliation cron', async () => {
    const prisma = makePrisma();
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(prisma as any, financialAlert as any);
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
    const service = new LedgerReconciliationService(prisma as any, financialAlert as any);
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
    const service = new LedgerReconciliationService(prisma as any);

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
    const service = new LedgerReconciliationService(prisma as any);

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
    const service = new LedgerReconciliationService(prisma as any, financialAlert as any);

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
    const service = new LedgerReconciliationService(prisma as any);

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
    const service = new LedgerReconciliationService(prisma as any);

    const result = await service.runWalletReconciliation();

    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].details.bucket).toBe('available');
    expect(result.drifts[0].details.storedInCents).toBe('123');
    expect(result.drifts[0].details.ledgerSumInCents).toBe('0');
  });
});
