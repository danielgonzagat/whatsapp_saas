import { SalesController } from './sales.controller';

describe('SalesController', () => {
  let prisma: any;
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
    };

    controller = new SalesController(prisma, {} as any, {} as any);
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
});
