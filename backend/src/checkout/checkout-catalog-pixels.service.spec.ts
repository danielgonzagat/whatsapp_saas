import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CheckoutCatalogService } from './checkout-catalog.service';

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

  describe('validateCoupon', () => {
    it('delegates to validateCouponHelper with workspaceId', async () => {
      prisma.checkoutCoupon.findUnique.mockResolvedValue({
        id: 'coupon_1',
        code: 'SAVE10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        isActive: true,
        usedCount: 0,
        maxUses: null,
        minOrderValue: null,
        startsAt: null,
        expiresAt: null,
        appliesTo: [],
      });

      const result = await service.validateCoupon('ws_1', 'SAVE10', 'plan_1', 5000);

      expect(result).toHaveProperty('valid', true);
    });
  });

  describe('createPixel', () => {
    const pixelData = {
      type: 'FACEBOOK' as const,
      pixelId: 'fb_123',
      accessToken: 'token123',
    };

    it('creates a pixel for a valid checkout config', async () => {
      prisma.checkoutConfig.findUnique.mockResolvedValue({ id: 'cfg_1' });
      prisma.checkoutPixel.create.mockResolvedValue({ id: 'pixel_1', ...pixelData });

      const result = await service.createPixel('cfg_1', pixelData);

      expect(result).not.toBeNull();
    });

    it('throws BadRequestException when checkout config not found', async () => {
      prisma.checkoutConfig.findUnique.mockResolvedValue(null);

      await expect(service.createPixel('cfg_1', pixelData)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updatePixel', () => {
    it('updates a pixel', async () => {
      prisma.checkoutPixel.update.mockResolvedValue({ id: 'pixel_1', pixelId: 'fb_456' });

      const result = await service.updatePixel('pixel_1', {
        pixelId: 'fb_456',
      });

      expect(result).not.toBeNull();
    });

    it('throws NotFoundException on P2025', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      prisma.checkoutPixel.update.mockRejectedValue(error);

      await expect(service.updatePixel('pixel_1', { pixelId: 'fb_456' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deletePixel', () => {
    it('deletes pixel and logs audit', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutPixel: {
              findUnique: jest.fn().mockResolvedValue({ id: 'pixel_1' }),
              delete: jest.fn().mockResolvedValue({ id: 'pixel_1' }),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.deletePixel('pixel_1', 'ws_1');

      expect(result).toEqual({ deleted: true });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'CheckoutPixel' }),
      );
    });
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
