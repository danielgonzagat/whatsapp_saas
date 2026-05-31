import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

type CheckoutServicePrismaMock = {
  checkoutPlanLink: {
    findFirst: jest.Mock;
  };
  checkoutProductPlan: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update?: jest.Mock;
    delete?: jest.Mock;
  };
  checkoutConfig: {
    findUnique: jest.Mock;
  };
  checkoutPixel: {
    createMany: jest.Mock;
  };
  affiliateLink: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
};

type ProductServiceMock = {
  createCheckout: jest.Mock;
  updateConfig: jest.Mock;
  syncCheckoutLinks: jest.Mock;
  getPlanLinkManager: jest.Mock;
};

type CheckoutServiceInternals = {
  logger: {
    log: (message: string) => void;
  };
  publicPayloadBuilder: {
    build: (
      plan: Record<string, unknown>,
      opts?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
  };
};

describe('CheckoutService — update (resolver path)', () => {
  let service: CheckoutService;
  let prisma: CheckoutServicePrismaMock;
  let productSvc: ProductServiceMock;
  let eventEmitter: { checkoutUpdated: jest.Mock };

  beforeEach(() => {
    prisma = {
      checkoutPlanLink: { findFirst: jest.fn().mockResolvedValue(null) },
      checkoutProductPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      checkoutConfig: { findUnique: jest.fn() },
      checkoutPixel: { createMany: jest.fn() },
      affiliateLink: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };

    productSvc = {
      createCheckout: jest.fn(),
      updateConfig: jest.fn(),
      syncCheckoutLinks: jest.fn(),
      getPlanLinkManager: jest.fn().mockReturnValue({
        ensurePlanReferenceCode: jest.fn().mockImplementation(async (p: unknown) => p),
      }),
    };

    eventEmitter = { checkoutUpdated: jest.fn() };

    service = new CheckoutService(
      prisma as never,
      productSvc as never,
      {} as never,
      {} as never,
      eventEmitter as never,
    );

    const internal = service as CheckoutServiceInternals;
    jest.spyOn(internal.logger, 'log').mockImplementation(() => undefined);
    internal.publicPayloadBuilder.build = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('update — happy path: verifies ownership, calls updatePlan, emits event', async () => {
    prisma.checkoutProductPlan.findFirst.mockResolvedValue({
      id: 'chk_1',
      productId: 'prod_1',
    });
    (productSvc as Record<string, unknown>).updatePlan = jest
      .fn()
      .mockResolvedValue({ id: 'chk_1', name: 'Atualizado' });

    const result = await service.update('ws_1', {
      checkoutId: 'chk_1',
      name: 'Atualizado',
    });

    expect(prisma.checkoutProductPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chk_1', kind: 'CHECKOUT', product: { workspaceId: 'ws_1' } },
      }),
    );
    expect(
      (productSvc as ProductServiceMock & { updatePlan: jest.Mock }).updatePlan,
    ).toHaveBeenCalledWith('chk_1', expect.objectContaining({ name: 'Atualizado' }));
    expect(eventEmitter.checkoutUpdated).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      checkoutId: 'chk_1',
    });
    expect(result).toEqual({ id: 'chk_1', name: 'Atualizado' });
  });

  it('update — throws when checkoutId is missing', async () => {
    await expect(service.update('ws_1', { name: 'Sem ID' })).rejects.toThrow(BadRequestException);
  });

  it('update — throws NotFoundException when workspace does not own checkout', async () => {
    prisma.checkoutProductPlan.findFirst.mockResolvedValue(null);

    await expect(service.update('ws_other', { checkoutId: 'chk_1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update — strips checkoutId from update data passed to updatePlan', async () => {
    prisma.checkoutProductPlan.findFirst.mockResolvedValue({
      id: 'chk_1',
      productId: 'prod_1',
    });
    (productSvc as ProductServiceMock & { updatePlan: jest.Mock }).updatePlan = jest
      .fn()
      .mockResolvedValue({ id: 'chk_1' });

    await service.update('ws_1', {
      checkoutId: 'chk_1',
      name: 'Novo Nome',
      isActive: false,
    });

    const updatePlanMock = (productSvc as ProductServiceMock & { updatePlan: jest.Mock })
      .updatePlan;
    const updateCalls = updatePlanMock.mock.calls as Array<[string, Record<string, unknown>]>;
    const updateCall = updateCalls[0]?.[1] ?? {};
    expect(updateCall).not.toHaveProperty('checkoutId');
    expect(updateCall).toHaveProperty('name', 'Novo Nome');
    expect(updateCall).toHaveProperty('isActive', false);
  });
});

describe('CheckoutService — delete (resolver path)', () => {
  let service: CheckoutService;
  let prisma: CheckoutServicePrismaMock;
  let productSvc: ProductServiceMock;

  beforeEach(() => {
    prisma = {
      checkoutPlanLink: { findFirst: jest.fn().mockResolvedValue(null) },
      checkoutProductPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      checkoutConfig: { findUnique: jest.fn() },
      checkoutPixel: { createMany: jest.fn() },
      affiliateLink: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };

    productSvc = {
      createCheckout: jest.fn(),
      updateConfig: jest.fn(),
      syncCheckoutLinks: jest.fn(),
      getPlanLinkManager: jest.fn(),
    };

    service = new CheckoutService(
      prisma as never,
      productSvc as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const internal = service as CheckoutServiceInternals;
    jest.spyOn(internal.logger, 'log').mockImplementation(() => undefined);
    internal.publicPayloadBuilder.build = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delete — happy path: verifies ownership and delegates to deletePlan', async () => {
    prisma.checkoutProductPlan.findFirst.mockResolvedValue({
      id: 'chk_1',
      productId: 'prod_1',
    });
    const deletePlanSpy = jest
      .spyOn(service, 'deletePlan')
      .mockResolvedValue({ id: 'chk_1' } as never);

    const result = await service.delete('ws_1', { checkoutId: 'chk_1' });

    expect(prisma.checkoutProductPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chk_1', kind: 'CHECKOUT', product: { workspaceId: 'ws_1' } },
      }),
    );
    expect(deletePlanSpy).toHaveBeenCalledWith('chk_1', 'ws_1');
    expect(result).toEqual({ id: 'chk_1' });

    deletePlanSpy.mockRestore();
  });

  it('delete — throws when checkoutId is missing', async () => {
    await expect(service.delete('ws_1', {})).rejects.toThrow(BadRequestException);
  });

  it('delete — throws NotFoundException when workspace does not own checkout', async () => {
    prisma.checkoutProductPlan.findFirst.mockResolvedValue(null);

    await expect(service.delete('ws_other', { checkoutId: 'chk_1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delete — does not call deletePlan when ownership check fails', async () => {
    prisma.checkoutProductPlan.findFirst.mockResolvedValue(null);
    const deletePlanSpy = jest.spyOn(service, 'deletePlan');

    await expect(service.delete('ws_other', { checkoutId: 'chk_1' })).rejects.toThrow();
    expect(deletePlanSpy).not.toHaveBeenCalled();

    deletePlanSpy.mockRestore();
  });
});

describe('CheckoutService — list (resolver path)', () => {
  let service: CheckoutService;
  let prisma: CheckoutServicePrismaMock;
  let productSvc: ProductServiceMock;

  beforeEach(() => {
    prisma = {
      checkoutPlanLink: { findFirst: jest.fn().mockResolvedValue(null) },
      checkoutProductPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      checkoutConfig: { findUnique: jest.fn() },
      checkoutPixel: { createMany: jest.fn() },
      affiliateLink: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };

    productSvc = {
      createCheckout: jest.fn(),
      updateConfig: jest.fn(),
      syncCheckoutLinks: jest.fn(),
      getPlanLinkManager: jest.fn(),
    };

    service = new CheckoutService(
      prisma as never,
      productSvc as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const internal = service as CheckoutServiceInternals;
    jest.spyOn(internal.logger, 'log').mockImplementation(() => undefined);
    internal.publicPayloadBuilder.build = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('list — returns checkouts scoped to workspace', async () => {
    const checkouts = [
      {
        id: 'chk_1',
        name: 'Checkout A',
        kind: 'CHECKOUT',
        checkoutConfig: null,
        checkoutLinks: [],
      },
      {
        id: 'chk_2',
        name: 'Checkout B',
        kind: 'CHECKOUT',
        checkoutConfig: null,
        checkoutLinks: [],
      },
    ];
    prisma.checkoutProductPlan.findMany.mockResolvedValue(checkouts);

    const result = await service.list('ws_1');

    expect(prisma.checkoutProductPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: 'CHECKOUT', product: { workspaceId: 'ws_1' } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result).toEqual(checkouts);
    expect(result).toHaveLength(2);
  });

  it('list — returns empty array when no checkouts exist', async () => {
    prisma.checkoutProductPlan.findMany.mockResolvedValue([]);

    const result = await service.list('ws_empty');

    expect(result).toEqual([]);
  });

  it('list — only returns CHECKOUT kind, never PLAN', async () => {
    prisma.checkoutProductPlan.findMany.mockResolvedValue([]);

    await service.list('ws_1');

    const findManyCalls = prisma.checkoutProductPlan.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    const findManyCall = findManyCalls[0]?.[0];
    expect(findManyCall?.where).toHaveProperty('kind', 'CHECKOUT');
  });
});
