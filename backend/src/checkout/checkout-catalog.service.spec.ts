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
        clientVersion: '5.0.0',
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
        clientVersion: '5.0.0',
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
});
