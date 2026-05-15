import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { buildMarketplaceWhere, enrichAffiliateProducts } from './affiliate-helpers';
import { AffiliateMarketplaceController } from './affiliate-marketplace.controller';

jest.mock('./affiliate-helpers', () => ({
  buildMarketplaceWhere: jest.fn(),
  enrichAffiliateProducts: jest.fn(),
}));

const mockBuildMarketplaceWhere = buildMarketplaceWhere as jest.Mock;
const mockEnrichAffiliateProducts = enrichAffiliateProducts as jest.Mock;

describe('AffiliateMarketplaceController', () => {
  const affiliateProductFindMany = jest.fn();
  const affiliateProductCount = jest.fn();
  const productFindMany = jest.fn();
  const prismaMock = {
    affiliateProduct: {
      findMany: affiliateProductFindMany,
      count: affiliateProductCount,
    },
    product: {
      findMany: productFindMany,
    },
  };

  let controller: AffiliateMarketplaceController;

  const mockReq = {
    user: { sub: 'user-1', workspaceId: 'ws-1' },
  } as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBuildMarketplaceWhere.mockImplementation((where: unknown) => where);

    controller = new AffiliateMarketplaceController(prismaMock as never);
  });

  describe('listMarketplace', () => {
    it('returns paginated enriched products with correct args (happy path)', async () => {
      const mockProducts = [{ id: 'ap-1', productId: 'p-1', listed: true }];
      const mockEnriched = [{ id: 'ap-1', name: 'Enriched Product', listed: true }];

      affiliateProductFindMany.mockResolvedValue(mockProducts);
      affiliateProductCount.mockResolvedValue(5);
      mockEnrichAffiliateProducts.mockResolvedValue(mockEnriched);

      const result = await controller.listMarketplace(
        mockReq,
        'marketing',
        undefined,
        'newest',
        '2',
        '10',
      );

      expect(mockBuildMarketplaceWhere).toHaveBeenCalledWith(
        expect.objectContaining({ listed: true, category: 'marketing' }),
      );
      expect(affiliateProductFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ listed: true }),
          orderBy: { createdAt: 'desc' },
          take: 10,
          skip: 10,
        }),
      );
      expect(affiliateProductCount).toHaveBeenCalled();
      expect(mockEnrichAffiliateProducts).toHaveBeenCalledWith(
        prismaMock,
        mockReq,
        mockProducts,
        'ws-1',
      );
      expect(result).toEqual({
        products: mockEnriched,
        total: 5,
        page: 2,
        totalPages: 1,
      });
    });

    it('propagates workspaceId from the authenticated user into enrichAffiliateProducts', async () => {
      const adminReq = {
        user: { sub: 'admin-1', workspaceId: 'ws-admin' },
      } as AuthenticatedRequest;

      affiliateProductFindMany.mockResolvedValue([]);
      affiliateProductCount.mockResolvedValue(0);
      mockEnrichAffiliateProducts.mockResolvedValue([]);

      await controller.listMarketplace(adminReq);

      expect(mockEnrichAffiliateProducts).toHaveBeenCalledWith(
        prismaMock,
        adminReq,
        [],
        'ws-admin',
      );
    });
  });

  describe('getMarketplaceStats', () => {
    it('returns aggregated marketplace statistics (alternate route happy)', async () => {
      affiliateProductCount.mockResolvedValue(3);
      affiliateProductFindMany.mockResolvedValue([
        { totalAffiliates: 5, totalSales: 10, totalRevenue: 1000, commissionPct: 10 },
        { totalAffiliates: 3, totalSales: 7, totalRevenue: 700, commissionPct: 15 },
        { totalAffiliates: 2, totalSales: 3, totalRevenue: 300, commissionPct: 5 },
      ]);

      const result = await controller.getMarketplaceStats();

      expect(mockBuildMarketplaceWhere).toHaveBeenCalledWith({ listed: true });
      expect(affiliateProductCount).toHaveBeenCalled();
      expect(affiliateProductFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { listed: true } }),
      );
      expect(result).toEqual({
        totalProducts: 3,
        totalAffiliates: 10,
        totalSales: 20,
        totalRevenue: 2000,
        avgCommission: 10,
      });
    });
  });

  describe('error path', () => {
    it('propagates errors from Prisma calls to the caller', async () => {
      const dbError = new Error('Connection refused');
      affiliateProductFindMany.mockRejectedValue(dbError);

      await expect(controller.listMarketplace(mockReq)).rejects.toThrow('Connection refused');
    });
  });
});
