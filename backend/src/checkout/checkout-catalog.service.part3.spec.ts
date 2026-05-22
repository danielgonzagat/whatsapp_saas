import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CheckoutCatalogService } from './checkout-catalog.service';
import { Prisma } from "@prisma/client";

type PrismaMock = {
  checkoutProductPlan: { findUnique: jest.Mock };
  orderBump: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  upsell: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  checkoutCoupon: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    findUnique: jest.Mock;
  };
  checkoutConfig: { findUnique: jest.Mock };
  checkoutPixel: { create: jest.Mock; update: jest.Mock; delete: jest.Mock; findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const makePlan = (overrides: Record<string, unknown> = {}) => ({
  id: 'plan_1',
  name: 'Test Plan',
  ...overrides,
});

describe('CheckoutCatalogService', () => {
  let service: CheckoutCatalogService;
  let prisma: PrismaMock;
  let auditService: { log: jest.Mock };
  let catalogConfigService: { calculateShipping: jest.Mock; resetConfig: jest.Mock };
  let opsAlert: { alertOnCriticalError: jest.Mock };

  beforeEach(() => {
    prisma = {
      checkoutProductPlan: { findUnique: jest.fn() },
      orderBump: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      upsell: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      checkoutCoupon: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
      },
      checkoutConfig: { findUnique: jest.fn() },
      checkoutPixel: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    catalogConfigService = {
      calculateShipping: jest.fn(),
      resetConfig: jest.fn(),
    };
    opsAlert = { alertOnCriticalError: jest.fn() };

    service = new CheckoutCatalogService(
      prisma as never,
      auditService as never,
      catalogConfigService as never,
      opsAlert as never,
    );
  });

  describe('calculateShipping', () => {
    it('delegates to catalogConfigService', async () => {
      catalogConfigService.calculateShipping.mockResolvedValue({
        options: [{ carrier: 'free', price: 0 }],
      });

      const result = await service.calculateShipping('my-plan', '04538000');

      expect(catalogConfigService.calculateShipping).toHaveBeenCalledWith('my-plan', '04538000');
      expect(result).toHaveProperty('options');
    });
  });

  describe('resetConfig', () => {
    it('delegates to catalogConfigService', async () => {
      catalogConfigService.resetConfig.mockResolvedValue({ id: 'cfg_1', theme: 'BLANC' });

      const result = await service.resetConfig('plan_1');

      expect(catalogConfigService.resetConfig).toHaveBeenCalledWith('plan_1');
      expect(result).toEqual({ id: 'cfg_1', theme: 'BLANC' });
    });
  });

  describe('error propagation', () => {
    it('propagates unexpected errors from createBump', async () => {
      prisma.checkoutProductPlan.findUnique.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.createBump('plan_1', {
          title: 'Test',
          description: 'Test',
          productName: 'Test',
          priceInCents: 100,
        }),
      ).rejects.toThrow('Connection refused');
    });
  });
});
