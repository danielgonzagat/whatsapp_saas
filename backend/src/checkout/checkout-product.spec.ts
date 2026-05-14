import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CheckoutProductService } from './checkout-product.service';
jest.mock('./checkout-product.create', () => ({
  createCheckout: jest.fn(),
}));
jest.mock('./checkout-code.util', () => ({
  generateUniquePublicCheckoutCode: jest.fn().mockResolvedValue('CODE001'),
}));
let prisma: {
  product: {
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    deleteMany: jest.Mock;
  };
  checkoutProductPlan: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findUnique: jest.Mock;
  };
  checkoutConfig: {
    create: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
};
let auditService: { log: jest.Mock };
let productConfigService: {
  buildDefaultCheckoutConfigInput: jest.Mock;
  resolveMarketplaceFeePercent: jest.Mock;
  ensureLegacyCheckoutForPlan: jest.Mock;
  ensureLegacyCheckoutsForProduct: jest.Mock;
  buildPricingPreview: jest.Mock;
  resetConfig: jest.Mock;
};
let service: CheckoutProductService;
const makeProduct = (overrides = {}) => ({
  id: 'prod_1',
  workspaceId: 'ws_1',
  price: 0,
  name: 'Test Product',
  ...overrides,
});
const makePlan = (overrides = {}) => ({
  id: 'plan_1',
  productId: 'prod_1',
  kind: 'PLAN' as const,
  name: 'Test Plan',
  slug: 'test-plan',
  priceInCents: 9900,
  isActive: true,
  referenceCode: 'CODE001',
  ...overrides,
});
beforeEach(() => {
  prisma = {
    product: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    checkoutProductPlan: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
    checkoutConfig: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
  };

  auditService = { log: jest.fn().mockResolvedValue(undefined) };

  productConfigService = {
    buildDefaultCheckoutConfigInput: jest.fn().mockReturnValue({ brandName: 'Test' }),
    resolveMarketplaceFeePercent: jest.fn().mockResolvedValue(9.9),
    ensureLegacyCheckoutForPlan: jest.fn().mockResolvedValue(undefined),
    ensureLegacyCheckoutsForProduct: jest.fn().mockResolvedValue(undefined),
    buildPricingPreview: jest.fn().mockResolvedValue({ total: 9900 }),
    resetConfig: jest.fn().mockResolvedValue({ ok: true }),
  };

  service = new CheckoutProductService(
    prisma as never,
    auditService as never,
    productConfigService as never,
  );
});

describe('CheckoutProductService', () => {
  describe('createProduct', () => {
    it('creates product with workspaceId', async () => {
      const product = makeProduct();
      prisma.product.create.mockResolvedValue(product);

      const result = await service.createProduct('ws_1', { name: 'Test Product' });

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ workspaceId: 'ws_1', name: 'Test Product' }),
      });
      expect(result).toEqual(product);
    });
  });

  describe('updateProduct', () => {
    it('updates product by id and workspaceId', async () => {
      const product = makeProduct({ name: 'Updated' });
      prisma.product.update.mockResolvedValue(product);

      const result = await service.updateProduct('prod_1', 'ws_1', { name: 'Updated' });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod_1', workspaceId: 'ws_1' },
        data: { name: 'Updated' },
      });
      expect(result).toEqual(product);
    });

    it('throws NotFoundException on P2025', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: '5',
      });
      prisma.product.update.mockRejectedValue(err);

      await expect(service.updateProduct('prod_1', 'ws_1', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listProducts', () => {
    it('lists products filtered by workspaceId', async () => {
      const products = [makeProduct({ id: 'prod_1' }), makeProduct({ id: 'prod_2' })];
      prisma.product.findMany.mockResolvedValue(products);

      const result = await service.listProducts('ws_1');

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        take: 200,
        where: { workspaceId: 'ws_1' },
        include: expect.objectContaining({
          checkoutPlans: expect.objectContaining({ where: { kind: 'PLAN' } }),
        }),
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(products);
    });
  });

  describe('getProduct', () => {
    it('throws NotFoundException when product not found', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.getProduct('prod_1', 'ws_1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong workspaceId (workspace isolation)', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.getProduct('prod_1', 'ws_2')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteProduct', () => {
    it('deletes product transactionally and audits the action', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
      prisma.product.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteProduct('prod_1', 'ws_1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_1',
          action: 'DELETE_RECORD',
          resource: 'CheckoutProduct',
          resourceId: 'prod_1',
        }),
      );
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException inside transaction when product not found', async () => {
      prisma.$transaction.mockImplementation(async (fn) => {
        prisma.product.findFirst.mockResolvedValue(null);
        return fn(prisma);
      });

      await expect(service.deleteProduct('prod_1', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createPlan', () => {
    it('creates plan with default config in transaction', async () => {
      const plan = makePlan();
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
      prisma.checkoutProductPlan.create.mockResolvedValue(plan);
      prisma.checkoutConfig.create.mockResolvedValue({ id: 'cfg_1' });
      prisma.checkoutProductPlan.findUnique.mockResolvedValue({
        ...plan,
        checkoutConfig: { id: 'cfg_1' },
      });

      const result = await service.createPlan('prod_1', { name: 'Test Plan' } as never, 'ws_1');

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'prod_1', workspaceId: 'ws_1' },
        select: { id: true },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toHaveProperty('id', 'plan_1');
      expect(result).toHaveProperty('checkoutConfig');
    });

    it('throws NotFoundException when creating plan for non-existent product (workspace isolation)', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.createPlan('prod_1', { name: 'Test Plan' } as never, 'ws_2'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePlan', () => {
    it('updates plan and includes checkoutConfig', async () => {
      const plan = { ...makePlan(), checkoutConfig: { id: 'cfg_1' } };
      prisma.checkoutProductPlan.update.mockResolvedValue(plan);

      const result = await service.updatePlan('plan_1', { name: 'Updated Plan' });

      expect(prisma.checkoutProductPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan_1' },
        data: { name: 'Updated Plan' },
        include: { checkoutConfig: true },
      });
      expect(result).toEqual(plan);
    });

    it('throws NotFoundException when updating non-existent plan', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: '5',
      });
      prisma.checkoutProductPlan.update.mockRejectedValue(err);

      await expect(service.updatePlan('plan_1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deletePlan', () => {
    it('deletes plan with workspace isolation check', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue({
        id: 'plan_1',
        product: { workspaceId: 'ws_1' },
      });
      prisma.checkoutProductPlan.delete.mockResolvedValue({ id: 'plan_1' });

      const result = await service.deletePlan('plan_1', 'ws_1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'CheckoutProductPlan',
          resourceId: 'plan_1',
        }),
      );
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException when workspaceId does not match', async () => {
      prisma.checkoutProductPlan.findUnique.mockResolvedValue({
        id: 'plan_1',
        product: { workspaceId: 'ws_other' },
      });
      prisma.checkoutProductPlan.delete.mockResolvedValue({ id: 'plan_1' });

      await expect(service.deletePlan('plan_1', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateConfig', () => {
    it('updates checkout config with normalized input', async () => {
      const config = { id: 'cfg_1', planId: 'plan_1', pixels: [] };
      prisma.checkoutConfig.update.mockResolvedValue(config);

      const result = await service.updateConfig('plan_1', { brandName: 'New Brand' });

      expect(prisma.checkoutConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { planId: 'plan_1' },
          include: { pixels: true },
        }),
      );
      expect(result).toEqual(config);
    });

    it('throws NotFoundException when plan not found', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: '5',
      });
      prisma.checkoutConfig.update.mockRejectedValue(err);

      await expect(service.updateConfig('plan_1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('getConfig', () => {
    it('returns config with pricing preview', async () => {
      const config = {
        id: 'cfg_1',
        pixels: [],
        plan: {
          priceInCents: 19990,
          checkoutLinks: [],
        },
      };
      prisma.checkoutConfig.findUnique.mockResolvedValue(config);

      const result = await service.getConfig('plan_1');

      expect(prisma.checkoutConfig.findUnique).toHaveBeenCalledWith({
        where: { planId: 'plan_1' },
        include: expect.objectContaining({ pixels: true, plan: expect.objectContaining({}) }),
      });
      expect(productConfigService.buildPricingPreview).toHaveBeenCalledWith(19990);
      expect(result).toHaveProperty('pricing');
    });

    it('throws NotFoundException when config not found', async () => {
      prisma.checkoutConfig.findUnique.mockResolvedValue(null);

      await expect(service.getConfig('plan_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('syncCheckoutLinks', () => {
    it('syncs checkout links successfully', async () => {
      const links = [{ id: 'link_1', plan: { name: 'Plan A' } }];
      const planLinkManager = service.getPlanLinkManager();
      jest.spyOn(planLinkManager, 'syncCheckoutLinks').mockResolvedValue(links);

      const result = await service.syncCheckoutLinks('checkout_1', ['plan_1']);

      expect(result).toEqual(links);
    });

    it('throws BadRequestException on invalid plan selection', async () => {
      const planLinkManager = service.getPlanLinkManager();
      jest
        .spyOn(planLinkManager, 'syncCheckoutLinks')
        .mockRejectedValue(new Error('INVALID_PLAN_SELECTION'));

      await expect(service.syncCheckoutLinks('checkout_1', ['plan_invalid'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when checkout not found', async () => {
      const planLinkManager = service.getPlanLinkManager();
      jest
        .spyOn(planLinkManager, 'syncCheckoutLinks')
        .mockRejectedValue(new Error('CHECKOUT_NOT_FOUND'));

      await expect(service.syncCheckoutLinks('checkout_1', ['plan_1'])).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resetConfig', () => {
    it('delegates to productConfigService', async () => {
      productConfigService.resetConfig.mockResolvedValue({ ok: true });

      const result = await service.resetConfig('plan_1');

      expect(productConfigService.resetConfig).toHaveBeenCalledWith('plan_1');
      expect(result).toEqual({ ok: true });
    });
  });
});
