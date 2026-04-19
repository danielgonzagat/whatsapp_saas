import { SalesController } from './sales.controller';

describe('SalesController', () => {
  let prisma: any;
  let stripeService: any;
  let controller: SalesController;

  beforeEach(() => {
    prisma = {
      customerSubscription: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productPlan: {
        findUnique: jest.fn(),
      },
      kloelSale: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    stripeService = {
      stripe: {
        refunds: {
          create: jest.fn().mockResolvedValue({ id: 're_1' }),
        },
      },
    };

    controller = new SalesController(prisma, {} as any, stripeService);
  });

  it('persists normalized plan transition fields when changing a subscription plan', async () => {
    prisma.customerSubscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: 'ACTIVE',
      planId: 'plan-old',
      metadata: { source: 'migration' },
    });
    prisma.productPlan.findUnique.mockResolvedValue({
      id: 'plan-new',
      name: 'Novo Plano',
      price: 199,
    });

    await controller.changeSubscriptionPlan(
      {
        user: { workspaceId: 'ws-1' },
      } as any,
      'sub-1',
      { newPlanId: 'plan-new' },
    );

    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1', workspaceId: 'ws-1' },
        data: expect.objectContaining({
          planName: 'Novo Plano',
          amount: 199,
          planId: 'plan-new',
          previousPlanId: 'plan-old',
        }),
      }),
    );
  });

  it('drops malformed previous plan ids instead of forwarding object values', async () => {
    prisma.customerSubscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: 'ACTIVE',
      planId: { broken: true },
      metadata: null,
    });
    prisma.productPlan.findUnique.mockResolvedValue({
      id: 'plan-new',
      name: 'Novo Plano',
      price: 199,
    });

    await controller.changeSubscriptionPlan(
      {
        user: { workspaceId: 'ws-1' },
      } as any,
      'sub-1',
      { newPlanId: 'plan-new' },
    );

    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planId: 'plan-new',
          previousPlanId: null,
        }),
      }),
    );
  });

  it('refunds Stripe-backed sales via payment_intent instead of a legacy gateway client', async () => {
    prisma.kloelSale.findFirst.mockResolvedValue({
      id: 'sale-1',
      status: 'paid',
      externalPaymentId: 'pi_stripe_123',
      amount: 139.9,
    });

    await controller.refundSale(
      {
        user: { workspaceId: 'ws-1', sub: 'agent-1' },
      } as any,
      'sale-1',
      'idem-1',
    );

    expect(stripeService.stripe.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_stripe_123',
      },
      {
        idempotencyKey: 'idem-1',
      },
    );
    expect(prisma.kloelSale.updateMany).toHaveBeenCalledWith({
      where: { id: 'sale-1', workspaceId: 'ws-1' },
      data: { status: 'refund_requested' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        action: 'refund_requested',
        resource: 'sale',
        resourceId: 'sale-1',
        agentId: 'agent-1',
        details: expect.objectContaining({ status: 'pending_webhook' }),
      }),
    });
  });
});
