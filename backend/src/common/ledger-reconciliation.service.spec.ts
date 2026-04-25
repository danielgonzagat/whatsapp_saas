import type { FinancialAlertService } from './financial-alert.service';
import type { PrismaService } from '../prisma/prisma.service';
import { LedgerReconciliationService } from './ledger-reconciliation.service';
import { makePrisma } from './ledger-reconciliation.service.spec.helpers';

describe('LedgerReconciliationService — invariant I8 (ledger consistency)', () => {
  it('runs the checkout reconciliation cron on the default 24h window', async () => {
    const prisma = makePrisma();
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = new LedgerReconciliationService(
      prisma as never as PrismaService,
      financialAlert as never as FinancialAlertService,
    );
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
    const service = new LedgerReconciliationService(
      prisma as never as PrismaService,
      financialAlert as never as FinancialAlertService,
    );
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
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

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
    const service = new LedgerReconciliationService(
      prisma as never as PrismaService,
      financialAlert as never as FinancialAlertService,
    );

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
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

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
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

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
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

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
    const service = new LedgerReconciliationService(prisma as never as PrismaService);

    const result = await service.runReconciliation(24);

    expect(result.scannedOrders).toBe(1);
    expect(result.drifts).toHaveLength(0);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
