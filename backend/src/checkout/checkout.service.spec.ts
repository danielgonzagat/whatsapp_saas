import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

type CheckoutServicePrismaMock = {
  checkoutPlanLink: {
    findFirst: jest.Mock;
  };
  checkoutProductPlan: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
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

function makeCheckoutPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chk_1',
    slug: 'plano-principal-checkout',
    referenceCode: 'CHKCODE1',
    productId: 'prod_1',
    name: 'Plano Principal',
    kind: 'CHECKOUT',
    isActive: true,
    priceInCents: 19990,
    compareAtPrice: 29990,
    currency: 'BRL',
    maxInstallments: 12,
    installmentsFee: false,
    quantity: 1,
    freeShipping: false,
    shippingPrice: null,
    checkoutConfig: {
      id: 'cfg_1',
      planId: 'chk_1',
      brandName: 'Plano Principal',
      pixels: [
        {
          type: 'FACEBOOK',
          pixelId: '123456',
          accessToken: 'token-fb',
          trackPageView: true,
          trackInitiateCheckout: true,
          trackAddPaymentInfo: true,
          trackPurchase: true,
        },
      ],
    },
    checkoutLinks: [{ planId: 'plan_1' }],
    ...overrides,
  };
}

describe('CheckoutService — duplicateCheckout', () => {
  let service: CheckoutService;
  let prisma: CheckoutServicePrismaMock;
  let productSvc: ProductServiceMock;

  beforeEach(() => {
    prisma = {
      checkoutPlanLink: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      checkoutProductPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      checkoutConfig: {
        findUnique: jest.fn(),
      },
      checkoutPixel: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      affiliateLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    productSvc = {
      createCheckout: jest.fn(),
      updateConfig: jest.fn().mockResolvedValue({}),
      syncCheckoutLinks: jest.fn().mockResolvedValue(undefined),
      getPlanLinkManager: jest.fn().mockReturnValue({
        ensurePlanReferenceCode: jest
          .fn()
          .mockImplementation(async (p: Record<string, unknown>) => p),
      }),
    };

    service = new CheckoutService(prisma as never, productSvc as never, {} as never, {} as never);

    const internal = service as CheckoutServiceInternals;
    jest.spyOn(internal.logger, 'log').mockImplementation(() => undefined);
    internal.publicPayloadBuilder.build = jest
      .fn()
      .mockResolvedValue({ id: 'payload', slug: 'test', checkoutCode: 'ABC', paymentProvider: {} });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('duplicateCheckout — happy path: copies config, pixels, and links', async () => {
    const original = makeCheckoutPayload();
    prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce(original);
    productSvc.createCheckout.mockResolvedValue({ id: 'dup_1' });
    prisma.checkoutConfig.findUnique.mockResolvedValue({ id: 'cfg_dup' });
    prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce({
      id: 'dup_1',
      name: 'Plano Principal (Copia)',
      slug: 'plano-principal-checkout-2',
      productId: 'prod_1',
      kind: 'CHECKOUT',
      checkoutConfig: { id: 'cfg_dup' },
      checkoutLinks: [{ plan: { id: 'plan_1', name: 'Plano A' } }],
    });

    const result = await service.duplicateCheckout('chk_1', 'ws_1');

    expect(prisma.checkoutProductPlan.findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: 'chk_1', product: { workspaceId: 'ws_1' } } }),
    );
    expect(productSvc.createCheckout).toHaveBeenCalledWith(
      'prod_1',
      expect.objectContaining({ name: 'Plano Principal (Copia)', priceInCents: 19990 }),
      'ws_1',
    );
    expect(productSvc.updateConfig).toHaveBeenCalledWith('dup_1', expect.objectContaining({}));
    const createManyCall = (
      prisma.checkoutPixel.createMany.mock as { calls: Array<[Record<string, unknown>]> }
    ).calls[0][0] as { data: Array<{ type: string; pixelId: string }> };
    expect(createManyCall.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'FACEBOOK', pixelId: '123456' })]),
    );
    expect(productSvc.syncCheckoutLinks).toHaveBeenCalledWith('dup_1', ['plan_1']);
    expect(prisma.checkoutProductPlan.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'dup_1', product: { workspaceId: 'ws_1' } } }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 'dup_1', name: 'Plano Principal (Copia)' }),
    );
  });

  it('duplicateCheckout — rejects when workspaceId does not match', async () => {
    prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce(null);

    await expect(service.duplicateCheckout('chk_1', 'ws_other')).rejects.toThrow(NotFoundException);
    expect(prisma.checkoutProductPlan.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chk_1', product: { workspaceId: 'ws_other' } },
      }),
    );
  });

  it('duplicateCheckout — rejects when checkout kind is not CHECKOUT', async () => {
    prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce({
      ...makeCheckoutPayload(),
      kind: 'PLAN',
    });

    await expect(service.duplicateCheckout('chk_1', 'ws_1')).rejects.toThrow(NotFoundException);
  });

  it('duplicateCheckout — throws when createCheckout returns no id', async () => {
    const original = makeCheckoutPayload();
    prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce(original);
    productSvc.createCheckout.mockResolvedValue(null);

    await expect(service.duplicateCheckout('chk_1', 'ws_1')).rejects.toThrow(BadRequestException);
  });

  it('duplicateCheckout — skips pixels when none exist on original config', async () => {
    const original = makeCheckoutPayload({
      checkoutConfig: {
        id: 'cfg_1',
        planId: 'chk_1',
        brandName: 'Plano Principal',
        pixels: [],
      },
    });
    prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce(original);
    productSvc.createCheckout.mockResolvedValue({ id: 'dup_1' });
    prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce({
      id: 'dup_1',
      name: 'Plano Principal (Copia)',
      kind: 'CHECKOUT',
      productId: 'prod_1',
      checkoutConfig: { id: 'cfg_dup' },
      checkoutLinks: [],
    });

    await service.duplicateCheckout('chk_1', 'ws_1');

    expect(prisma.checkoutConfig.findUnique).not.toHaveBeenCalled();
    expect(prisma.checkoutPixel.createMany).not.toHaveBeenCalled();
  });

  it('duplicateCheckout — copies config even when pixel lookup returns null', async () => {
    const original = makeCheckoutPayload({
      checkoutConfig: {
        id: 'cfg_1',
        planId: 'chk_1',
        brandName: 'Plano Principal',
        pixels: [{ type: 'FACEBOOK', pixelId: 'fb1' }],
      },
    });
    prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce(original);
    productSvc.createCheckout.mockResolvedValue({ id: 'dup_1' });
    prisma.checkoutConfig.findUnique.mockResolvedValue(null);
    prisma.checkoutProductPlan.findUnique.mockResolvedValueOnce({
      id: 'dup_1',
      name: '(Copia)',
      kind: 'CHECKOUT',
      productId: 'prod_1',
      checkoutConfig: null,
      checkoutLinks: [],
    });

    const result = await service.duplicateCheckout('chk_1', 'ws_1');

    expect(productSvc.updateConfig).toHaveBeenCalledWith('dup_1', expect.objectContaining({}));
    expect(prisma.checkoutPixel.createMany).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 'dup_1' }));
  });
});

describe('CheckoutService — getCheckoutBySlug', () => {
  let service: CheckoutService;
  let internal: CheckoutServiceInternals;
  let prisma: CheckoutServicePrismaMock;
  let productSvc: ProductServiceMock;

  beforeEach(() => {
    prisma = {
      checkoutPlanLink: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      checkoutProductPlan: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      checkoutConfig: {
        findUnique: jest.fn(),
      },
      checkoutPixel: {
        createMany: jest.fn(),
      },
      affiliateLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };

    productSvc = {
      createCheckout: jest.fn(),
      updateConfig: jest.fn(),
      syncCheckoutLinks: jest.fn(),
      getPlanLinkManager: jest.fn().mockReturnValue({
        ensurePlanReferenceCode: jest
          .fn()
          .mockImplementation(async (p: Record<string, unknown>) => p),
      }),
    };

    service = new CheckoutService(prisma as never, productSvc as never, {} as never, {} as never);

    internal = service as CheckoutServiceInternals;
    jest.spyOn(internal.logger, 'log').mockImplementation(() => undefined);
    internal.publicPayloadBuilder.build = jest
      .fn()
      .mockResolvedValue({ id: 'payload', slug: 'test', checkoutCode: 'ABC', paymentProvider: {} });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getCheckoutBySlug — resolves via checkoutPlanLink', async () => {
    const checkoutLink = {
      checkoutId: 'chk_1',
      planId: 'plan_1',
      slug: 'my-checkout',
      checkout: { isActive: true, kind: 'CHECKOUT', checkoutConfig: null },
      plan: {
        id: 'plan_1',
        slug: 'my-checkout',
        product: { workspaceId: 'ws_1', name: 'Prod' },
        checkoutConfig: null,
        orderBumps: [],
        upsells: [],
      },
    };
    prisma.checkoutPlanLink.findFirst.mockResolvedValue(checkoutLink);

    const result = await service.getCheckoutBySlug('my-checkout');

    expect(internal.publicPayloadBuilder.build).toHaveBeenCalledWith(
      checkoutLink.plan,
      expect.objectContaining({}),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'payload', slug: 'test' }));
  });

  it('getCheckoutBySlug — resolves via direct plan record', async () => {
    const planRecord = {
      id: 'plan_1',
      slug: 'my-plan',
      kind: 'PLAN',
      isActive: true,
      legacyCheckoutEnabled: false,
      product: { workspaceId: 'ws_1', name: 'Prod' },
      checkoutConfig: null,
      orderBumps: [],
      upsells: [],
    };
    prisma.checkoutProductPlan.findUnique.mockResolvedValue(planRecord);

    const result = await service.getCheckoutBySlug('my-plan');

    expect(internal.publicPayloadBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'plan_1' }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'payload' }));
  });

  it('getCheckoutBySlug — falls back to code lookup when slug not found', async () => {
    prisma.checkoutProductPlan.findUnique.mockResolvedValue(null);
    prisma.checkoutProductPlan.findFirst.mockResolvedValue({
      id: 'plan_1',
      slug: 'plan-slug',
      kind: 'PLAN',
      isActive: true,
      referenceCode: 'FALLBACK',
      product: { workspaceId: 'ws_1' },
      checkoutConfig: null,
      orderBumps: [],
      upsells: [],
    });
    prisma.affiliateLink.findFirst.mockResolvedValue(null);

    await service.getCheckoutBySlug('not-found');

    expect(internal.publicPayloadBuilder.build).toHaveBeenCalled();
  });
});

// ─── PI-K32: 5 new domain-service methods for capability resolver ─────────

describe('CheckoutService — create (resolver path)', () => {
  let service: CheckoutService;
  let productSvc: ProductServiceMock;
  let eventEmitter: { checkoutCreated: jest.Mock };

  beforeEach(() => {
    const prisma = {
      checkoutPlanLink: { findFirst: jest.fn().mockResolvedValue(null) },
      checkoutProductPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
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
        ensurePlanReferenceCode: jest.fn().mockImplementation(async (p) => p),
      }),
    };

    eventEmitter = { checkoutCreated: jest.fn() };

    service = new CheckoutService(
      prisma as never,
      productSvc as never,
      {} as never,
      {} as never,
      eventEmitter as never,
    );

    const internal = service as CheckoutServiceInternals;
    jest.spyOn(internal.logger, 'log').mockImplementation(() => undefined);
    internal.publicPayloadBuilder.build = jest
      .fn()
      .mockResolvedValue({ id: 'payload', slug: 'test' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('create — happy path: creates checkout and emits event', async () => {
    productSvc.createCheckout.mockResolvedValue({ id: 'chk_new', name: 'Meu Checkout' });

    const result = await service.create('ws_1', {
      productId: 'prod_1',
      name: 'Meu Checkout',
      priceInCents: 19990,
      currency: 'BRL',
    });

    expect(productSvc.createCheckout).toHaveBeenCalledWith(
      'prod_1',
      expect.objectContaining({ name: 'Meu Checkout', priceInCents: 19990, currency: 'BRL' }),
      'ws_1',
    );
    expect(eventEmitter.checkoutCreated).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      checkoutId: 'chk_new',
      productId: 'prod_1',
    });
    expect(result).toEqual({ id: 'chk_new', name: 'Meu Checkout' });
  });

  it('create — throws when productId is missing', async () => {
    await expect(service.create('ws_1', { name: 'Sem Produto' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('create — uses amount as priceInCents when priceInCents is absent', async () => {
    productSvc.createCheckout.mockResolvedValue({ id: 'chk_amt' });

    await service.create('ws_1', { productId: 'prod_1', amount: 5000 });

    expect(productSvc.createCheckout).toHaveBeenCalledWith(
      'prod_1',
      expect.objectContaining({ priceInCents: 5000 }),
      'ws_1',
    );
  });

  it('create — defaults name to "Checkout" when missing', async () => {
    productSvc.createCheckout.mockResolvedValue({ id: 'chk_def' });

    await service.create('ws_1', { productId: 'prod_1', priceInCents: 999 });

    expect(productSvc.createCheckout).toHaveBeenCalledWith(
      'prod_1',
      expect.objectContaining({ name: 'Checkout' }),
      'ws_1',
    );
  });

  it('create — does not emit event when createCheckout returns no id', async () => {
    productSvc.createCheckout.mockResolvedValue(null);

    const result = await service.create('ws_1', { productId: 'prod_1' });

    expect(eventEmitter.checkoutCreated).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

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
        ensurePlanReferenceCode: jest.fn().mockImplementation(async (p) => p),
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
    (productSvc as any).updatePlan = jest.fn().mockResolvedValue({ id: 'chk_1', name: 'Atualizado' });

    const result = await service.update('ws_1', {
      checkoutId: 'chk_1',
      name: 'Atualizado',
    });

    expect(prisma.checkoutProductPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chk_1', kind: 'CHECKOUT', product: { workspaceId: 'ws_1' } },
      }),
    );
    expect((productSvc as any).updatePlan).toHaveBeenCalledWith(
      'chk_1',
      expect.objectContaining({ name: 'Atualizado' }),
    );
    expect(eventEmitter.checkoutUpdated).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      checkoutId: 'chk_1',
    });
    expect(result).toEqual({ id: 'chk_1', name: 'Atualizado' });
  });

  it('update — throws when checkoutId is missing', async () => {
    await expect(service.update('ws_1', { name: 'Sem ID' })).rejects.toThrow(
      BadRequestException,
    );
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
    (productSvc as any).updatePlan = jest.fn().mockResolvedValue({ id: 'chk_1' });

    await service.update('ws_1', {
      checkoutId: 'chk_1',
      name: 'Novo Nome',
      isActive: false,
    });

    const updateCall = (productSvc as any).updatePlan.mock.calls[0][1];
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
    const deletePlanSpy = jest.spyOn(service, 'deletePlan').mockResolvedValue({ id: 'chk_1' } as any);

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
      { id: 'chk_1', name: 'Checkout A', kind: 'CHECKOUT', checkoutConfig: null, checkoutLinks: [] },
      { id: 'chk_2', name: 'Checkout B', kind: 'CHECKOUT', checkoutConfig: null, checkoutLinks: [] },
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

    const findManyCall = prisma.checkoutProductPlan.findMany.mock.calls[0][0];
    expect(findManyCall.where).toHaveProperty('kind', 'CHECKOUT');
  });
});

describe('CheckoutService — createOrder (resolver path)', () => {
  let service: CheckoutService;
  let prisma: CheckoutServicePrismaMock & { product: { findFirst: jest.Mock } };
  let orderSvc: { createOrder: jest.Mock };

  beforeEach(() => {
    orderSvc = { createOrder: jest.fn().mockResolvedValue({ id: 'ord_1', status: 'PENDING' }) };

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
      product: { findFirst: jest.fn() },
    } as any;

    const productSvc = {
      createCheckout: jest.fn(),
      updateConfig: jest.fn(),
      syncCheckoutLinks: jest.fn(),
      getPlanLinkManager: jest.fn(),
    };

    service = new CheckoutService(
      prisma as never,
      productSvc as never,
      {} as never,
      orderSvc as never,
      {} as never,
    );

    const internal = service as CheckoutServiceInternals;
    jest.spyOn(internal.logger, 'log').mockImplementation(() => undefined);
    internal.publicPayloadBuilder.build = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('createOrder — resolver path: looks up product and plan, creates order', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
    prisma.checkoutProductPlan.findFirst.mockResolvedValue({
      id: 'plan_1',
      priceInCents: 19990,
    });

    const result = await service.createOrder('ws_1', {
      productId: 'prod_1',
      amount: 19990,
    });

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prod_1', workspaceId: 'ws_1' } }),
    );
    expect(prisma.checkoutProductPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 'prod_1', kind: 'PLAN', isActive: true },
      }),
    );
    expect(orderSvc.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan_1',
        workspaceId: 'ws_1',
        subtotalInCents: 19990,
        totalInCents: 19990,
        paymentMethod: 'PIX',
      }),
    );
    expect(result).toEqual({ id: 'ord_1', status: 'PENDING' });
  });

  it('createOrder — resolver path: throws when productId is missing', async () => {
    await expect(service.createOrder('ws_1', {} as any)).rejects.toThrow(BadRequestException);
  });

  it('createOrder — resolver path: throws when product not found', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.createOrder('ws_1', { productId: 'bad_prod', amount: 1000 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createOrder — resolver path: throws when no active plan exists', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
    prisma.checkoutProductPlan.findFirst.mockResolvedValue(null);

    await expect(
      service.createOrder('ws_1', { productId: 'prod_1', amount: 1000 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createOrder — resolver path: uses plan price as default when amount is absent', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
    prisma.checkoutProductPlan.findFirst.mockResolvedValue({
      id: 'plan_1',
      priceInCents: 29990,
    });

    await service.createOrder('ws_1', { productId: 'prod_1' });

    expect(orderSvc.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotalInCents: 29990,
        totalInCents: 29990,
      }),
    );
  });

  it('createOrder — controller path: delegates single data object to orderService', async () => {
    const orderData = {
      planId: 'plan_x',
      workspaceId: 'ws_x',
      customerName: 'Fulano',
      customerEmail: 'f@test.com',
      subtotalInCents: 9990,
      totalInCents: 9990,
      paymentMethod: 'PIX' as const,
      shippingAddress: {},
    };

    const result = await service.createOrder(orderData);

    expect(orderSvc.createOrder).toHaveBeenCalledWith(orderData);
    expect(result).toEqual({ id: 'ord_1', status: 'PENDING' });
  });
});
