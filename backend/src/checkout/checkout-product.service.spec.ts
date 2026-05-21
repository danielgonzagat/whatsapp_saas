import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CheckoutProductConfigService } from './checkout-product-config.service';
import { CheckoutProductService } from './checkout-product.service';

jest.mock('./checkout-plan-link.manager', () => ({
  CheckoutPlanLinkManager: jest.fn().mockImplementation(() => ({
    ensurePlansReferenceCodes: jest.fn().mockImplementation((nodes) => nodes),
    generatePublicCheckoutCode: jest.fn().mockResolvedValue('REF-1'),
  })),
}));

describe('CheckoutProductService', () => {
  let service: CheckoutProductService;
  let prisma: {
    product: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; deleteMany: jest.Mock };
    checkoutProductPlan: { create: jest.Mock; findUnique: jest.Mock };
    checkoutConfig: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let productConfigService: {
    ensureLegacyCheckoutsForProduct: jest.Mock;
    buildDefaultCheckoutConfigInput: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      product: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      checkoutProductPlan: {
        create: jest.fn().mockResolvedValue({ id: 'plan-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'plan-1', checkoutConfig: {} }),
      },
      checkoutConfig: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    productConfigService = {
      ensureLegacyCheckoutsForProduct: jest.fn().mockResolvedValue(undefined),
      buildDefaultCheckoutConfigInput: jest.fn().mockReturnValue({}),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: CheckoutProductConfigService, useValue: productConfigService },
      ],
    }).compile();
    service = module.get(CheckoutProductService);
  });

  describe('createProduct', () => {
    it('writes with workspaceId and default price=0', async () => {
      const result = await service.createProduct('ws-1', { name: 'X' } as never);
      expect((result as { workspaceId: string }).workspaceId).toBe('ws-1');
      const data = prisma.product.create.mock.calls[0][0].data;
      expect(data.price).toBe(0);
    });

    it('respects explicit price', async () => {
      await service.createProduct('ws-1', { name: 'X', price: 1234 } as never);
      const data = prisma.product.create.mock.calls[0][0].data;
      expect(data.price).toBe(1234);
    });
  });

  describe('updateProduct', () => {
    it('updates row scoped to id + workspaceId', async () => {
      await service.updateProduct('p-1', 'ws-1', { name: 'New' });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1', workspaceId: 'ws-1' },
        data: { name: 'New' },
      });
    });

    it('throws NotFoundException when Prisma P2025', async () => {
      prisma.product.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('not found', {
          code: 'P2025',
          clientVersion: '5.0.0',
        }),
      );
      await expect(
        service.updateProduct('p-missing', 'ws-1', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rethrows non-P2025 errors', async () => {
      prisma.product.update.mockRejectedValue(new Error('db down'));
      await expect(service.updateProduct('p', 'ws-1', { name: 'x' })).rejects.toThrow('db down');
    });
  });

  describe('listProducts', () => {
    it('filters by workspace and orders by createdAt desc, take=200', async () => {
      await service.listProducts('ws-tenant-A');
      const arg = prisma.product.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ workspaceId: 'ws-tenant-A' });
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
      expect(arg.take).toBe(200);
    });
  });

  describe('getProduct', () => {
    it('throws NotFoundException when product missing', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.getProduct('p-missing', 'ws-1')).rejects.toThrow(NotFoundException);
    });

    it('returns product with checkoutPlans + checkoutTemplates split by kind', async () => {
      prisma.product.findFirst
        .mockResolvedValueOnce({ id: 'p-1' })
        .mockResolvedValueOnce({
          id: 'p-1',
          checkoutPlans: [
            { id: 'pl-1', kind: 'PLAN' },
            { id: 'co-1', kind: 'CHECKOUT' },
          ],
        });
      const result = await service.getProduct('p-1', 'ws-1');
      expect(result.checkoutPlans).toHaveLength(1);
      expect(result.checkoutTemplates).toHaveLength(1);
    });
  });

  describe('deleteProduct', () => {
    it('throws NotFoundException when product missing', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.deleteProduct('p', 'ws-1')).rejects.toThrow(NotFoundException);
    });

    it('logs audit DELETE_RECORD on success', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'p-1' });
      await service.deleteProduct('p-1', 'ws-1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          action: 'DELETE_RECORD',
          resource: 'CheckoutProduct',
          resourceId: 'p-1',
        }),
      );
    });
  });

  describe('createPlan', () => {
    it('throws NotFoundException when product not found', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        service.createPlan('missing-product', { name: 'P1' } as never, 'ws-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates plan + checkoutConfig in a transaction', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'p-1' });
      await service.createPlan('p-1', { name: 'P1', priceInCents: 1000 } as never, 'ws-1');
      expect(prisma.checkoutProductPlan.create).toHaveBeenCalled();
      expect(prisma.checkoutConfig.create).toHaveBeenCalled();
    });
  });
});
