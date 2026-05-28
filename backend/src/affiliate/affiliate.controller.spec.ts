import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import type { PrismaService } from '../prisma/prisma.service';
import { AffiliateController } from './affiliate.controller';

jest.mock('../checkout/checkout-code.util', () => ({
  generateUniquePublicCheckoutCode: jest.fn(() => Promise.resolve('CODE-XXXX')),
}));

jest.mock('./affiliate-helpers', () => ({
  buildAffiliateLinkUrl: jest.fn((_req: unknown, code: string) => `https://app.test/ref/${code}`),
  enrichAffiliateProducts: jest.fn(() => Promise.resolve([])),
  serializeAffiliateProductForResponse: jest.fn((_req: unknown, p: unknown) => p),
}));

describe('AffiliateController', () => {
  let prisma: ReturnType<typeof createPartialPrismaMock>;

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
    prisma = createPartialPrismaMock({
      checkoutProductPlan: ['findFirst'],
      checkoutPlanLink: ['findFirst'],
      affiliateLink: ['findFirst', 'findMany', 'create', 'updateMany'],
      affiliateProduct: ['findUnique', 'create', 'update'],
      affiliateRequest: ['findUnique', 'findMany', 'findFirst', 'create', 'update', 'deleteMany'],
      product: ['findFirst'],
    });
    controller = new AffiliateController(prisma as PrismaService);
  });

  describe('requestAffiliation', () => {
    it('creates a pending request when auto-approve is off', async () => {
      prisma.affiliateProduct.findUnique.mockResolvedValue({
        id: 'ap-1',
        approvalMode: 'MANUAL',
      });
      prisma.affiliateRequest.findUnique.mockResolvedValue(null);
      prisma.affiliateRequest.create.mockResolvedValue({
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
      prisma.affiliateProduct.findUnique.mockResolvedValue(null);
      await expect(controller.requestAffiliation(mockReq(), 'nonexistent', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when already requested', async () => {
      prisma.affiliateProduct.findUnique.mockResolvedValue({
        id: 'ap-1',
        approvalMode: 'MANUAL',
      });
      prisma.affiliateRequest.findUnique.mockResolvedValue({ id: 'req-old' });
      await expect(controller.requestAffiliation(mockReq(), 'ap-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getMyProducts', () => {
    it('returns products the workspace is affiliated with', async () => {
      prisma.affiliateRequest.findMany.mockResolvedValue([
        { id: 'req-1', affiliateProduct: { id: 'ap-1', productId: 'p-1' } },
      ]);
      const result = await controller.getMyProducts(mockReq());
      expect(result).toHaveProperty('products');
      expect(result).toHaveProperty('count', 1);
    });
  });

  describe('getMyLinks', () => {
    it('returns links with totals', async () => {
      prisma.affiliateLink.findMany.mockResolvedValue([
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
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      prisma.affiliateProduct.findUnique.mockResolvedValue(null);
      prisma.affiliateProduct.create.mockResolvedValue({
        id: 'ap-1',
        productId: 'p-1',
        listed: true,
      });

      const result = await controller.listProduct(mockReq(), 'p-1', {});
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when product not in workspace', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(controller.listProduct(mockReq(), 'p-other', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when already listed', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      prisma.affiliateProduct.findUnique.mockResolvedValue({ id: 'ap-1' });
      await expect(controller.listProduct(mockReq(), 'p-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('configureProduct', () => {
    it('updates affiliate product config', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      prisma.affiliateProduct.findUnique.mockResolvedValue({ id: 'ap-1' });
      prisma.affiliateProduct.update.mockResolvedValue({
        id: 'ap-1',
        commissionPct: 50,
      });
      const result = await controller.configureProduct(mockReq(), 'p-1', {
        commissionPct: 50,
      });
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when not listed', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      prisma.affiliateProduct.findUnique.mockResolvedValue(null);
      await expect(controller.configureProduct(mockReq(), 'p-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('saveProduct', () => {
    it('saves product for the workspace (idempotent)', async () => {
      prisma.affiliateRequest.findFirst.mockResolvedValue(null);
      prisma.affiliateRequest.create.mockResolvedValue({ id: 'req-1', status: 'SAVED' });
      const result = await controller.saveProduct(mockReq(), 'ap-1');
      expect(result.success).toBe(true);
      expect(result.saved).toBe(true);
    });

    it('returns saved=true when already saved', async () => {
      prisma.affiliateRequest.findFirst.mockResolvedValue({
        id: 'req-old',
        status: 'SAVED',
      });
      const result = await controller.saveProduct(mockReq(), 'ap-1');
      expect(result.saved).toBe(true);
    });
  });

  describe('unsaveProduct', () => {
    it('unsaves product and returns saved=false', async () => {
      prisma.affiliateRequest.deleteMany.mockResolvedValue({ count: 1 });
      const result = await controller.unsaveProduct(mockReq(), 'ap-1');
      expect(result.success).toBe(true);
      expect(result.saved).toBe(false);
    });
  });
});
