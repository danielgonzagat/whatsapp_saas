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
  };
}

describe('LedgerReconciliationService — invariant I8 (ledger consistency)', () => {
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
    const service = new LedgerReconciliationService(prisma as any);

    const result = await service.runReconciliation(24);

    expect(result.scannedOrders).toBe(1);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0]).toMatchObject({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      kind: 'order_without_payment',
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
              gateway: 'asaas',
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
  });
});
