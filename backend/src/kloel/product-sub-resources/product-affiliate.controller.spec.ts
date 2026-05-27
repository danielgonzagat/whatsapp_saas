import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductAffiliateController } from './product-affiliate.controller';

jest.mock('./helpers/affiliate.helpers', () => ({
  buildAffiliateProductData: jest.fn(() => ({})),
  buildAffiliateSummary: jest.fn(() =>
    Promise.resolve({
      product: { id: 'p-1' },
      affiliateProduct: null,
      totalAffiliates: 0,
      totalLinks: 0,
      totalClicks: 0,
      totalSales: 0,
      totalRevenue: 0,
      requests: [],
      links: [],
    }),
  ),
  generateAffiliatePublicCode: jest.fn(() => Promise.resolve('CODE-XXXX')),
  recalculateAffiliateProductCounters: jest.fn(() => Promise.resolve()),
  PRODUCT_COMMISSION_TYPE_VALUES: ['percentage', 'fixed', 'proportional'],
}));

jest.mock('./helpers/common.helpers', () => ({
  assertPercentageRange: jest.fn((v: number | undefined, _label: string) => {
    if (v !== undefined && (v < 0 || v > 100)) {
      throw new BadRequestException('Fora do intervalo permitido');
    }
  }),
  ensureWorkspaceProductAccess: jest.fn((_prisma: unknown, productId: string, _wsId: string) =>
    Promise.resolve({
      id: productId,
      workspaceId: 'ws-1',
      affiliateEnabled: true,
      affiliateVisible: true,
      commissionType: 'percentage',
      commissionPercent: 30,
      commissionCookieDays: 30,
      commissionLastClickPercent: 70,
      commissionOtherClicksPercent: 30,
      imageUrl: null,
    }),
  ),
  getWorkspaceId: jest.fn(() => 'ws-1'),
  normalizeOptionalText: jest.fn((v: string) => v),
  parseNumber: jest.fn((v: unknown) =>
    v !== undefined && v !== null ? Number(v) : undefined,
  ),
  removeUndefined: jest.fn((obj: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) result[k] = v;
    }
    return result;
  }),
  safeStr: jest.fn((v: unknown) => String(v ?? '')),
}));

describe('ProductAffiliateController', () => {
  const prisma = {
    product: {
      updateMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    affiliateProduct: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    affiliateRequest: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    affiliateLink: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  } as never;

  let controller: ProductAffiliateController;

  const mockReq = (overrides: Partial<{ sub: string; workspaceId: string }> = {}) =>
    ({
      user: {
        sub: overrides.sub ?? 'u-1',
        workspaceId: overrides.workspaceId ?? 'ws-1',
      },
      headers: {},
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProductAffiliateController(prisma as never);
  });

  describe('getSummary', () => {
    it('returns affiliate summary for a product', async () => {
      const result = await controller.getSummary('p-1', mockReq());
      expect(result).toHaveProperty('product');
      expect(result).toHaveProperty('totalAffiliates');
    });
  });

  describe('updateConfig', () => {
    it('updates product affiliate config and returns summary', async () => {
      (prisma as never).product.updateMany.mockResolvedValue({ count: 1 });
      (prisma as never).product.findFirstOrThrow.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
        affiliateEnabled: true,
        affiliateVisible: true,
        commissionType: 'percentage',
        commissionPercent: 30,
        commissionCookieDays: 30,
        commissionLastClickPercent: 70,
        commissionOtherClicksPercent: 30,
        imageUrl: null,
      });
      (prisma as never).affiliateProduct.findUnique.mockResolvedValue(null);
      (prisma as never).affiliateProduct.upsert.mockResolvedValue({ id: 'ap-1' });

      const result = await controller.updateConfig('p-1', { commissionPercent: 50 }, mockReq());
      expect(result).toHaveProperty('product');
    });

    it('throws BadRequestException when commissionType is invalid', async () => {
      await expect(
        controller.updateConfig('p-1', { commissionType: 'invalid_type' }, mockReq()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when proportional weights do not sum to 100', async () => {
      await expect(
        controller.updateConfig(
          'p-1',
          {
            commissionType: 'proportional',
            commissionLastClickPercent: 50,
            commissionOtherClicksPercent: 30,
          },
          mockReq(),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveRequest', () => {
    it('approves a pending request and creates link', async () => {
      (prisma as never).affiliateRequest.findFirst.mockResolvedValue({
        id: 'req-1',
        affiliateProductId: 'ap-1',
        affiliateWorkspaceId: 'ws-2',
      });
      (prisma as never).affiliateLink.findFirst.mockResolvedValue(null);
      (prisma as never).affiliateLink.create.mockResolvedValue({ id: 'link-1', code: 'ABC' });

      const result = await controller.approveRequest('p-1', 'req-1', mockReq());
      expect(result).toHaveProperty('product');
    });

    it('throws NotFoundException when request not found', async () => {
      (prisma as never).affiliateRequest.findFirst.mockResolvedValue(null);
      await expect(
        controller.approveRequest('p-1', 'nonexistent', mockReq()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectRequest', () => {
    it('rejects a request and deactivates associated links', async () => {
      (prisma as never).affiliateRequest.findFirst.mockResolvedValue({
        id: 'req-1',
        affiliateProductId: 'ap-1',
        affiliateWorkspaceId: 'ws-2',
      });

      const result = await controller.rejectRequest('p-1', 'req-1', mockReq());
      expect(result).toHaveProperty('product');
    });

    it('throws NotFoundException when request not found', async () => {
      (prisma as never).affiliateRequest.findFirst.mockResolvedValue(null);
      await expect(
        controller.rejectRequest('p-1', 'nonexistent', mockReq()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateLink', () => {
    it('updates link active state', async () => {
      (prisma as never).affiliateLink.findFirst.mockResolvedValue({
        id: 'link-1',
        affiliateProductId: 'ap-1',
        affiliateWorkspaceId: 'ws-2',
        active: true,
      });

      const result = await controller.updateLink('p-1', 'link-1', { active: false }, mockReq());
      expect(result).toHaveProperty('product');
    });

    it('throws BadRequestException when active field is missing', async () => {
      await expect(
        controller.updateLink('p-1', 'link-1', {}, mockReq()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when link not found', async () => {
      (prisma as never).affiliateLink.findFirst.mockResolvedValue(null);
      await expect(
        controller.updateLink('p-1', 'nonexistent', { active: true }, mockReq()),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
