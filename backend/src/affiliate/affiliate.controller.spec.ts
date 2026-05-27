import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AffiliateController } from './affiliate.controller';
import { Prisma } from '@prisma/client';

jest.mock('../checkout/checkout-code.util', () => ({
  generateUniquePublicCheckoutCode: jest.fn(() => Promise.resolve('CODE-XXXX')),
}));

jest.mock('./affiliate-helpers', () => ({
  buildAffiliateLinkUrl: jest.fn((_req: unknown, code: string) => `https://app.test/ref/${code}`),
  enrichAffiliateProducts: jest.fn(() => Promise.resolve([])),
  serializeAffiliateProductForResponse: jest.fn((_req: unknown, p: unknown) => p),
}));

describe('AffiliateController', () => {
  const prisma = {
    checkoutProductPlan: { findFirst: jest.fn() },
    checkoutPlanLink: { findFirst: jest.fn() },
    affiliateLink: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    affiliateProduct: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    affiliateRequest: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    product: { findFirst: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  } as never;

  let controller: AffiliateController;

  const mockReq = (overrides: Partial<{ sub: string; workspaceId: string }> = {}) =>
    ({
      user: {
        sub: overrides.sub ?? 'u-1',
        workspaceId: overrides.workspaceId ?? 'ws-1',
      },
      headers: { host: 'app.test' },
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AffiliateController(prisma as never);
  });

  describe('requestAffiliation', () => {
    it('creates a pending request when auto-approve is off', async () => {
      (prisma as never).affiliateProduct.findUnique.mockResolvedValue({
        id: 'ap-1',
        approvalMode: 'MANUAL',
      });
      (prisma as never).affiliateRequest.findUnique.mockResolvedValue(null);
      (prisma as never).affiliateRequest.create.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING',
      });

      const result = await controller.requestAffiliation(mockReq(), 'ap-1', {
        name: 'Aff',
        email: 'aff@test.com',
      });

      expect(result.request.status).toBe('PENDING');
      expect(result.link).toBeNull();
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when product not found', async () => {
      (prisma as never).affiliateProduct.findUnique.mockResolvedValue(null);
      await expect(
        controller.requestAffiliation(mockReq(), 'nonexistent', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when already requested', async () => {
      (prisma as never).affiliateProduct.findUnique.mockResolvedValue({
        id: 'ap-1',
        approvalMode: 'MANUAL',
      });
      (prisma as never).affiliateRequest.findUnique.mockResolvedValue({ id: 'req-old' });
      await expect(
        controller.requestAffiliation(mockReq(), 'ap-1', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyProducts', () => {
    it('returns products the workspace is affiliated with', async () => {
      (prisma as never).affiliateRequest.findMany.mockResolvedValue([
        { id: 'req-1', affiliateProduct: { id: 'ap-1', productId: 'p-1' } },
      ]);
      const result = await controller.getMyProducts(mockReq());
      expect(result).toHaveProperty('products');
      expect(result).toHaveProperty('count', 1);
    });
  });

  describe('getMyLinks', () => {
    it('returns links with totals', async () => {
      (prisma as never).affiliateLink.findMany.mockResolvedValue([
        {
          id: 'link-1',
          code: 'ABC',
          clicks: 10,
          sales: 2,
          revenue: 200,
          commissionEarned: 20,
          affiliateProduct: { id: 'ap-1' },
        },
      ]);
      const result = await controller.getMyLinks(mockReq());
      expect(result).toHaveProperty('links');
      expect(result.totals.clicks).toBe(10);
      expect(result.totals.sales).toBe(2);
    });
  });

  describe('listProduct', () => {
    it('lists a product on the marketplace', async () => {
      (prisma as never).product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      (prisma as never).affiliateProduct.findUnique.mockResolvedValue(null);
      (prisma as never).affiliateProduct.create.mockResolvedValue({
        id: 'ap-1',
        productId: 'p-1',
        listed: true,
      });

      const result = await controller.listProduct(mockReq(), 'p-1', {});
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when product not in workspace', async () => {
      (prisma as never).product.findFirst.mockResolvedValue(null);
      await expect(controller.listProduct(mockReq(), 'p-other', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when already listed', async () => {
      (prisma as never).product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      (prisma as never).affiliateProduct.findUnique.mockResolvedValue({ id: 'ap-1' });
      await expect(controller.listProduct(mockReq(), 'p-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('configureProduct', () => {
    it('updates affiliate product config', async () => {
      (prisma as never).product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      (prisma as never).affiliateProduct.findUnique.mockResolvedValue({ id: 'ap-1' });
      (prisma as never).affiliateProduct.update.mockResolvedValue({
        id: 'ap-1',
        commissionPct: 50,
      });
      const result = await controller.configureProduct(mockReq(), 'p-1', {
        commissionPct: 50,
      });
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when not listed', async () => {
      (prisma as never).product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      (prisma as never).affiliateProduct.findUnique.mockResolvedValue(null);
      await expect(
        controller.configureProduct(mockReq(), 'p-1', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveProduct', () => {
    it('saves product for the workspace (idempotent)', async () => {
      (prisma as never).affiliateRequest.findFirst.mockResolvedValue(null);
      (prisma as never).affiliateRequest.create.mockResolvedValue({ id: 'req-1', status: 'SAVED' });
      const result = await controller.saveProduct(mockReq(), 'ap-1');
      expect(result.success).toBe(true);
      expect(result.saved).toBe(true);
    });

    it('returns saved=true when already saved', async () => {
      (prisma as never).affiliateRequest.findFirst.mockResolvedValue({ id: 'req-old', status: 'SAVED' });
      const result = await controller.saveProduct(mockReq(), 'ap-1');
      expect(result.saved).toBe(true);
    });
  });

  describe('unsaveProduct', () => {
    it('unsaves product and returns saved=false', async () => {
      (prisma as never).affiliateRequest.deleteMany.mockResolvedValue({ count: 1 });
      const result = await controller.unsaveProduct(mockReq(), 'ap-1');
      expect(result.success).toBe(true);
      expect(result.saved).toBe(false);
    });
  });
});
