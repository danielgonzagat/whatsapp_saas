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
        clientVersion: '5.0.0',
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
});
