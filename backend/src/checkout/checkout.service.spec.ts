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

    const internal = service as unknown as CheckoutServiceInternals;
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
    expect(productSvc.updateConfig).toHaveBeenCalledWith('dup_1', expect.any(Object));
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

    expect(productSvc.updateConfig).toHaveBeenCalledWith('dup_1', expect.any(Object));
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

    internal = service as unknown as CheckoutServiceInternals;
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
      expect.any(Object),
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
