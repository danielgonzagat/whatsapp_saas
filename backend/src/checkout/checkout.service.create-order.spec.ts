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
    };

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
    await expect(service.createOrder('ws_1', {})).rejects.toThrow(BadRequestException);
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
