import type { AffiliateProduct } from '@prisma/client';
import type { AffiliateProductLookup } from '../affiliate-helpers';

export const baseProduct: AffiliateProduct = {
  id: 'ap-1',
  productId: 'prod-1',
  listed: true,
  commissionPct: 20,
  commissionType: 'PERCENTAGE',
  commissionFixed: null,
  cookieDays: 30,
  approvalMode: 'AUTO',
  category: 'Electronics',
  tags: [],
  thumbnailUrl: null,
  promoMaterials: null,
  temperature: 0.5,
  totalAffiliates: 10,
  totalSales: 100,
  totalRevenue: 5000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function mockLookup(
  overrides: Partial<AffiliateProductLookup> = {},
): AffiliateProductLookup {
  return {
    productById: new Map(),
    workspaceById: new Map(),
    ratingByProductId: new Map(),
    requestByAffiliateProductId: new Map(),
    linkByAffiliateProductId: new Map(),
    ...overrides,
  };
}
