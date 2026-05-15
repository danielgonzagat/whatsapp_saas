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

  describe('createBump', () => {
    const bumpData = {
      title: 'Order Bump',
      description: 'Add this item',
      productName: 'Bump Item',
      priceInCents: 1500,
      image: undefined,
      compareAtPrice: undefined,
      highlightColor: undefined,
      checkboxLabel: undefined,
      position: undefined,
      sortOrder: undefined,
    };

    it('creates a bump for a valid plan', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlan());
      prisma.orderBump.create.mockResolvedValue({ id: 'bump_1', ...bumpData, planId: 'plan_1' });

      const result = await service.createBump('plan_1', bumpData);

      expect(result).not.toBeNull();
      expect(prisma.orderBump.create).toHaveBeenCalledWith({
        data: { planId: 'plan_1', ...bumpData },
      });
    });

    it('throws BadRequestException when plan not found', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(null);

      await expect(service.createBump('plan_1', bumpData)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateBump', () => {
    it('updates a bump', async () => {
      prisma.orderBump.update.mockResolvedValue({ id: 'bump_1', title: 'Updated' });

      const result = await service.updateBump('bump_1', {
        title: 'Updated',
      });

      expect(result).not.toBeNull();
      expect(prisma.orderBump.update).toHaveBeenCalledWith({
        where: { id: 'bump_1' },
        data: { title: 'Updated' },
      });
    });

    it('throws NotFoundException on P2025 error', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5',
      });
      prisma.orderBump.update.mockRejectedValue(error);

      await expect(service.updateBump('bump_1', { title: 'Updated' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('re-throws unknown errors', async () => {
      prisma.orderBump.update.mockRejectedValue(new Error('Unknown DB error'));

      await expect(service.updateBump('bump_1', { title: 'Updated' })).rejects.toThrow(
        'Unknown DB error',
      );
    });
  });

  describe('deleteBump', () => {
    it('deletes a bump within a transaction and logs audit', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            orderBump: {
              findUnique: jest.fn().mockResolvedValue({ id: 'bump_1' }),
              delete: jest.fn().mockResolvedValue({ id: 'bump_1' }),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.deleteBump('bump_1', 'ws_1');

      expect(result).toEqual({ deleted: true });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_1',
          action: 'DELETE_RECORD',
          resource: 'OrderBump',
        }),
      );
    });

    it('throws NotFoundException when bump does not exist', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            orderBump: {
              findUnique: jest.fn().mockResolvedValue(null),
              delete: jest.fn(),
            },
          };
          return fn(tx);
        },
      );

      await expect(service.deleteBump('bump_1', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listBumps', () => {
    it('returns bumps for a plan ordered by sortOrder', async () => {
      const bumps = [{ id: 'bump_1' }, { id: 'bump_2' }];
      prisma.orderBump.findMany.mockResolvedValue(bumps);

      const result = await service.listBumps('plan_1');

      expect(prisma.orderBump.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { planId: 'plan_1' },
          orderBy: { sortOrder: 'asc' },
          take: 20,
        }),
      );
      expect(result).toEqual(bumps);
    });
  });

  describe('createUpsell', () => {
    const upsellData = {
      title: 'Upsell Offer',
      headline: 'Special deal',
      description: 'Upgrade now',
      productName: 'Premium',
      priceInCents: 4900,
    };

    it('creates an upsell for a valid plan', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlan());
      prisma.upsell.create.mockResolvedValue({ id: 'upsell_1', ...upsellData, planId: 'plan_1' });

      const result = await service.createUpsell('plan_1', upsellData);

      expect(result).not.toBeNull();
    });

    it('rejects invalid chargeType', async () => {
      await expect(
        service.createUpsell('plan_1', {
          ...upsellData,
          chargeType: 'INVALID' as 'ONE_CLICK',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when plan not found', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(null);

      await expect(service.createUpsell('plan_1', upsellData)).rejects.toThrow(BadRequestException);
    });

    it('accepts valid chargeType NEW_PAYMENT', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue(makePlan());
      prisma.upsell.create.mockResolvedValue({ id: 'upsell_2' });

      const result = await service.createUpsell('plan_1', {
        ...upsellData,
        chargeType: 'NEW_PAYMENT' as const,
      });

      expect(result).not.toBeNull();
    });
  });

  describe('updateUpsell', () => {
    it('updates an upsell', async () => {
      prisma.upsell.update.mockResolvedValue({ id: 'upsell_1', title: 'Updated' });

      const result = await service.updateUpsell('upsell_1', {
        title: 'Updated',
      });

      expect(result).not.toBeNull();
    });

    it('throws NotFoundException on P2025', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5',
      });
      prisma.upsell.update.mockRejectedValue(error);

      await expect(service.updateUpsell('upsell_1', { title: 'Updated' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteUpsell', () => {
    it('deletes an upsell and logs audit', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            upsell: {
              findUnique: jest.fn().mockResolvedValue({ id: 'upsell_1' }),
              delete: jest.fn().mockResolvedValue({ id: 'upsell_1' }),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.deleteUpsell('upsell_1', 'ws_1');

      expect(result).toEqual({ deleted: true });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'Upsell' }),
      );
    });
  });

  describe('listUpsells', () => {
    it('returns upsells for a plan', async () => {
      prisma.upsell.findMany.mockResolvedValue([{ id: 'upsell_1' }]);

      const result = await service.listUpsells('plan_1');

      expect(result).toHaveLength(1);
    });
  });

  describe('createCoupon', () => {
    const couponData = {
      code: 'SAVE10',
      discountType: 'PERCENTAGE' as const,
      discountValue: 10,
    };

    it('creates coupon with idempotency — returns existing when code exists', async () => {
      const existing = {
        id: 'coupon_existing',
        code: 'SAVE10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
      };
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutCoupon: {
              findUnique: jest.fn().mockResolvedValue(existing),
              create: jest.fn(),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.createCoupon('ws_1', couponData);

      expect(result).toEqual(existing);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('creates new coupon when code does not exist', async () => {
      const newCoupon = { id: 'coupon_new', ...couponData, workspaceId: 'ws_1' };
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutCoupon: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue(newCoupon),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.createCoupon('ws_1', couponData);

      expect(result).toEqual(newCoupon);
    });

    it('rejects invalid discountType', async () => {
      await expect(
        service.createCoupon('ws_1', {
          ...couponData,
          discountType: 'INVALID' as 'PERCENTAGE',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateCoupon', () => {
    it('updates coupon scoped to workspace', async () => {
      prisma.checkoutCoupon.update.mockResolvedValue({ id: 'coupon_1', discountValue: 20 });

      const result = await service.updateCoupon('coupon_1', 'ws_1', {
        discountValue: 20,
      });

      expect(prisma.checkoutCoupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon_1', workspaceId: 'ws_1' },
        data: { discountValue: 20 },
      });
      expect(result).not.toBeNull();
    });

    it('throws BadRequestException when workspaceId is missing', async () => {
      await expect(
        service.updateCoupon('coupon_1', undefined, {
          discountValue: 20,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException on P2025', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5',
      });
      prisma.checkoutCoupon.update.mockRejectedValue(error);

      await expect(
        service.updateCoupon('coupon_1', 'ws_1', {
          discountValue: 20,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteCoupon', () => {
    it('deletes coupon requiring workspaceId', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutCoupon: {
              findFirst: jest.fn().mockResolvedValue({ id: 'coupon_1' }),
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.deleteCoupon('coupon_1', 'ws_1');

      expect(result).toEqual({ deleted: true });
    });

    it('throws BadRequestException when workspaceId is missing', async () => {
      await expect(service.deleteCoupon('coupon_1', undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when coupon not found', async () => {
      prisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            checkoutCoupon: {
              findFirst: jest.fn().mockResolvedValue(null),
              deleteMany: jest.fn(),
            },
          };
          return fn(tx);
        },
      );

      await expect(service.deleteCoupon('coupon_1', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listCoupons', () => {
    it('returns coupons for workspace with tenant isolation', async () => {
      const coupons = [{ id: 'coupon_1', workspaceId: 'ws_1', code: 'SAVE10' }];
      prisma.checkoutCoupon.findMany.mockResolvedValue(coupons);

      const result = await service.listCoupons('ws_1');

      expect(prisma.checkoutCoupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws_1' },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      );
      expect(result).toEqual(coupons);
    });

    it('enforces workspaceId in where clause for tenant isolation', async () => {
      prisma.checkoutCoupon.findMany.mockResolvedValue([]);

      await service.listCoupons('ws_1');

      expect(prisma.checkoutCoupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws_1' },
        }),
      );
    });
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
        clientVersion: '5',
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
