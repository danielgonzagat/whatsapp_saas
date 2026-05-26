import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';

describe('KloelProductSubResourceToolsService', () => {
  let service: KloelProductSubResourceToolsService;
  let prisma: {
    product: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    productPlan: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    productCheckout: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    productCoupon: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    productUrl: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    kloelSale: {
      create: jest.Mock;
    };
  };

  const ws = 'ws-1';

  beforeEach(async () => {
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: 'prod-1', name: 'Test Product' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productPlan: {
        create: jest.fn().mockResolvedValue({ id: 'plan-1', name: 'Basic', price: 29.9 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'plan-1', name: 'Basic' }),
        update: jest.fn().mockResolvedValue({ id: 'plan-1', name: 'Updated', price: 49.9 }),
        delete: jest.fn().mockResolvedValue({}),
      },
      productCheckout: {
        create: jest.fn().mockResolvedValue({ id: 'co-1', name: 'Checkout' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'co-1', name: 'Checkout' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'co-1', name: 'Updated' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      productCoupon: {
        create: jest.fn().mockResolvedValue({ id: 'coup-1', code: 'SAVE10' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'coup-1', code: 'SAVE10' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      productUrl: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue({ id: 'url-1', url: 'https://x.com' }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      kloelSale: {
        create: jest.fn().mockResolvedValue({ id: 'sale-1', amount: 100 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelProductSubResourceToolsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(KloelProductSubResourceToolsService);
  });

  describe('executeTool', () => {
    it('dispatches create_plan to toolCreatePlan', async () => {
      const result = await service.executeTool('create_plan', ws, { productId: 'prod-1', planName: 'Basic', price: 29.9 });
      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
    });

    it('dispatches create_checkout to toolCreateCheckout', async () => {
      const result = await service.executeTool('create_checkout', ws, { productId: 'prod-1', checkoutName: 'CO1' });
      expect(result.success).toBe(true);
      expect(result.checkout).toBeDefined();
    });

    it('dispatches create_coupon to toolCreateCoupon', async () => {
      const result = await service.executeTool('create_coupon', ws, { productId: 'prod-1', code: 'SAVE10', discountValue: 10 });
      expect(result.success).toBe(true);
      expect(result.coupon).toBeDefined();
    });

    it('dispatches list_coupons to toolListCoupons', async () => {
      prisma.productCoupon.findMany.mockResolvedValue([{ id: 'c1', code: 'SAVE10' }]);
      const result = await service.executeTool('list_coupons', ws, {});
      expect(result.success).toBe(true);
    });

    it('dispatches list_checkouts to toolListCheckouts', async () => {
      prisma.productCheckout.findMany.mockResolvedValue([{ id: 'co-1', name: 'CO' }]);
      const result = await service.executeTool('list_checkouts', ws, {});
      expect(result.success).toBe(true);
    });

    it('returns error for unknown tool', async () => {
      const result = await service.executeTool('unknown_tool', ws, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });

    it('dispatches update_plan', async () => {
      const result = await service.executeTool('update_plan', ws, { planId: 'plan-1', planName: 'Updated', price: 49.9 });
      expect(result.success).toBe(true);
    });

    it('dispatches delete_plan', async () => {
      const result = await service.executeTool('delete_plan', ws, { planName: 'Basic' });
      expect(result.success).toBe(true);
    });

    it('dispatches delete_coupon', async () => {
      const result = await service.executeTool('delete_coupon', ws, { couponId: 'coup-1' });
      expect(result.success).toBe(true);
    });

    it('dispatches update_coupon', async () => {
      const result = await service.executeTool('update_coupon', ws, { code: 'SAVE10', discountValue: 20 });
      expect(result.success).toBe(true);
    });

    it('dispatches add_url', async () => {
      const result = await service.executeTool('add_url', ws, { productName: 'Test Product', url: 'https://x.com', label: 'Site' });
      expect(result.success).toBe(true);
    });

    it('dispatches update_url', async () => {
      const result = await service.executeTool('update_url', ws, { productName: 'Test Product', label: 'Site', url: 'https://y.com' });
      expect(result.success).toBe(true);
    });

    it('dispatches delete_url', async () => {
      const result = await service.executeTool('delete_url', ws, { urlLabel: 'Site' });
      expect(result.success).toBe(true);
    });

    it('dispatches generate_boleto', async () => {
      const result = await service.executeTool('generate_boleto', ws, { amount: 100, customerPhone: '5511999999999', productName: 'Widget' });
      expect(result.success).toBe(true);
      expect(result.boletoCode).toBeDefined();
    });
  });

  describe('toolCreatePlan', () => {
    it('creates a plan by productId', async () => {
      const result = await service.toolCreatePlan(ws, { productId: 'prod-1', planName: 'Pro', price: 99.9 });
      expect(result.success).toBe(true);
      expect(prisma.productPlan.create).toHaveBeenCalled();
    });

    it('returns error when product not found', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      const result = await service.toolCreatePlan(ws, { productName: 'Nonexistent', planName: 'Plan' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('nao encontrado');
    });
  });

  describe('toolCreateCoupon', () => {
    it('creates a coupon', async () => {
      const result = await service.toolCreateCoupon(ws, { productId: 'prod-1', code: 'WELCOME', discountValue: 15 });
      expect(result.success).toBe(true);
    });

    it('returns error when no product exists in workspace', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      const result = await service.toolCreateCoupon(ws, { code: 'WELCOME', discountValue: 15 });
      expect(result.success).toBe(false);
    });
  });

  describe('toolDeleteCoupon', () => {
    it('deletes by couponId', async () => {
      const result = await service.toolDeleteCoupon(ws, { couponId: 'coup-1' });
      expect(result.success).toBe(true);
    });

    it('returns error when coupon not found', async () => {
      prisma.productCoupon.findFirst.mockResolvedValue(null);
      const result = await service.toolDeleteCoupon(ws, { couponCode: 'NONE' });
      expect(result.success).toBe(false);
    });
  });

  describe('toolUpdateCoupon', () => {
    it('updates coupon by code', async () => {
      const result = await service.toolUpdateCoupon(ws, { code: 'SAVE10', discountValue: 25 });
      expect(result.success).toBe(true);
    });

    it('returns error when code is missing', async () => {
      const result = await service.toolUpdateCoupon(ws, {});
      expect(result.success).toBe(false);
    });
  });

  describe('toolAddUrl', () => {
    it('adds a URL to a product', async () => {
      const result = await service.toolAddUrl(ws, { productName: 'Test Product', url: 'https://x.com' });
      expect(result.success).toBe(true);
    });

    it('returns error when url is missing', async () => {
      const result = await service.toolAddUrl(ws, { productName: 'Test Product' });
      expect(result.success).toBe(false);
    });
  });

  describe('toolGenerateBoleto', () => {
    it('generates boleto with amount and customer info', async () => {
      const result = await service.toolGenerateBoleto(ws, { amount: 150, customerPhone: '5511999999999', productName: 'Widget' });
      expect(result.success).toBe(true);
      expect(result.saleId).toBeDefined();
      expect(result.boletoHtml).toContain('BOLETO');
    });
  });
});
