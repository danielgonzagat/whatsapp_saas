import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import {
  buildAffiliateLinkUrl,
  buildEnrichedAffiliateProduct,
  buildMarketplaceWhere,
  normalizePromoMaterials,
  serializeAffiliateProductForResponse,
} from './affiliate-helpers';
import { baseProduct, mockLookup } from './__companions__/affiliate-helpers.spec.companion';

function mockReq(): AuthenticatedRequest {
  return {
    protocol: 'https',
    get: () => undefined,
    header: () => undefined,
    user: { workspaceId: 'ws-1', agentId: 'agent-1', email: 'test@test.com' },
  } as unknown as AuthenticatedRequest;
}

describe('affiliate-helpers', () => {
  describe('serializeAffiliateProductForResponse', () => {
    it('returns null for null input', () => {
      expect(serializeAffiliateProductForResponse(mockReq(), null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(serializeAffiliateProductForResponse(mockReq(), undefined)).toBeNull();
    });

    it('returns product with thumbnailUrl set to null when product has null thumbnailUrl', () => {
      const product = { thumbnailUrl: null };
      const result = serializeAffiliateProductForResponse(mockReq(), product);
      expect(result).not.toBeNull();
      expect(result!.thumbnailUrl).toBeNull();
    });

    it('preserves other product fields', () => {
      const product = { thumbnailUrl: null, id: 'p-1', name: 'Test' };
      const result = serializeAffiliateProductForResponse(mockReq(), product);
      expect(result!.id).toBe('p-1');
      expect(result!.name).toBe('Test');
    });
  });

  describe('normalizePromoMaterials', () => {
    it('returns empty array for null', () => {
      expect(normalizePromoMaterials(null)).toEqual([]);
    });

    it('returns empty array for undefined', () => {
      expect(normalizePromoMaterials(undefined)).toEqual([]);
    });

    it('returns empty array for non-array non-object input', () => {
      expect(normalizePromoMaterials('string')).toEqual([]);
      expect(normalizePromoMaterials(42)).toEqual([]);
    });

    it('filters non-strings from array input', () => {
      expect(normalizePromoMaterials(['valid', 123, 'also-valid', null])).toEqual([
        'valid',
        'also-valid',
      ]);
    });

    it('handles empty array', () => {
      expect(normalizePromoMaterials([])).toEqual([]);
    });

    it('extracts strings from object with items property', () => {
      expect(normalizePromoMaterials({ items: ['a', 'b', 'c'] })).toEqual(['a', 'b', 'c']);
    });

    it('filters non-string entries from items array', () => {
      expect(normalizePromoMaterials({ items: ['x', 99, 'y'] })).toEqual(['x', 'y']);
    });

    it('returns empty array for object without items', () => {
      expect(normalizePromoMaterials({ other: 'value' })).toEqual([]);
    });

    it('returns empty array for object with non-array items', () => {
      expect(normalizePromoMaterials({ items: 'not-an-array' })).toEqual([]);
    });
  });

  describe('buildAffiliateLinkUrl', () => {
    it('calls buildPayCheckoutUrl with the provided code', () => {
      const result = buildAffiliateLinkUrl(mockReq(), 'CODE-123');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('handles null code', () => {
      const result = buildAffiliateLinkUrl(mockReq(), null);
      expect(result).toBeNull();
    });

    it('handles undefined code', () => {
      const result = buildAffiliateLinkUrl(mockReq(), undefined);
      expect(result).toBeNull();
    });
  });

  describe('buildMarketplaceWhere', () => {
    it('returns the input unchanged', () => {
      const where = { listed: true, category: 'Test' };
      expect(buildMarketplaceWhere(where)).toBe(where);
    });

    it('returns empty object unchanged', () => {
      const where = {};
      expect(buildMarketplaceWhere(where)).toBe(where);
    });
  });

  describe('buildEnrichedAffiliateProduct', () => {
    it('returns default values when product not found in lookup', () => {
      const result = buildEnrichedAffiliateProduct(mockReq(), baseProduct, mockLookup());

      expect(result.name).toBe('Produto');
      expect(result.description).toBe('');
      expect(result.price).toBe(0);
      expect(result.category).toBe('Electronics');
      expect(result.producer).toBe('Kloel');
      expect(result.commission).toBe(20);
      expect(result.rating).toBe(0);
      expect(result.totalReviews).toBe(0);
      expect(result.requestStatus).toBeNull();
      expect(result.isSaved).toBe(false);
      expect(result.isApproved).toBe(false);
      expect(result.isPending).toBe(false);
    });

    it('enriches with product name and description from lookup', () => {
      const lookup = mockLookup({
        productById: new Map([
          [
            'prod-1',
            {
              id: 'prod-1',
              workspaceId: 'ws-1',
              name: 'Widget Pro',
              description: 'A great widget',
              price: 99.99,
              category: 'Tools',
              imageUrl: 'https://img.example.com/w1.png',
              tags: ['widget', 'premium'],
            },
          ],
        ]),
      });

      const result = buildEnrichedAffiliateProduct(mockReq(), baseProduct, lookup);

      expect(result.name).toBe('Widget Pro');
      expect(result.description).toBe('A great widget');
      expect(result.price).toBe(99.99);
    });

    it('uses affiliateProduct category when present', () => {
      const lookup = mockLookup({
        productById: new Map([
          [
            'prod-1',
            {
              id: 'prod-1',
              workspaceId: 'ws-1',
              name: 'Widget',
              description: null,
              price: 10,
              category: 'ProductCat',
              imageUrl: null,
              tags: [],
            },
          ],
        ]),
      });

      const product = { ...baseProduct, category: 'AffiliateCat' };
      const result = buildEnrichedAffiliateProduct(mockReq(), product, lookup);

      expect(result.category).toBe('AffiliateCat');
    });

    it('falls back to product category when affiliateProduct category is absent', () => {
      const lookup = mockLookup({
        productById: new Map([
          [
            'prod-1',
            {
              id: 'prod-1',
              workspaceId: 'ws-1',
              name: 'Widget',
              description: null,
              price: 10,
              category: 'ProductCat',
              imageUrl: null,
              tags: [],
            },
          ],
        ]),
      });

      const product = { ...baseProduct, category: null };
      const result = buildEnrichedAffiliateProduct(mockReq(), product, lookup);

      expect(result.category).toBe('ProductCat');
    });

    it('uses affiliateProduct tags when present', () => {
      const lookup = mockLookup({
        productById: new Map([
          [
            'prod-1',
            {
              id: 'prod-1',
              workspaceId: 'ws-1',
              name: 'Widget',
              description: null,
              price: 10,
              category: null,
              imageUrl: null,
              tags: ['prod-tag'],
            },
          ],
        ]),
      });

      const product = { ...baseProduct, tags: ['aff-tag', 'aff-tag2'] };
      const result = buildEnrichedAffiliateProduct(mockReq(), product, lookup);

      expect(result.tags).toEqual(['aff-tag', 'aff-tag2']);
    });

    it('falls back to product tags when affiliateProduct tags are empty', () => {
      const lookup = mockLookup({
        productById: new Map([
          [
            'prod-1',
            {
              id: 'prod-1',
              workspaceId: 'ws-1',
              name: 'Widget',
              description: null,
              price: 10,
              category: null,
              imageUrl: null,
              tags: ['prod-tag'],
            },
          ],
        ]),
      });

      const product = { ...baseProduct, tags: [] };
      const result = buildEnrichedAffiliateProduct(mockReq(), product, lookup);

      expect(result.tags).toEqual(['prod-tag']);
    });

    it('sets requestStatus and status booleans for SAVED', () => {
      const lookup = mockLookup({
        requestByAffiliateProductId: new Map([
          ['ap-1', { affiliateProductId: 'ap-1', status: 'SAVED' }],
        ]),
      });

      const result = buildEnrichedAffiliateProduct(mockReq(), baseProduct, lookup);

      expect(result.requestStatus).toBe('SAVED');
      expect(result.isSaved).toBe(true);
      expect(result.isApproved).toBe(false);
      expect(result.isPending).toBe(false);
    });

    it('sets requestStatus and status booleans for APPROVED', () => {
      const lookup = mockLookup({
        requestByAffiliateProductId: new Map([
          ['ap-1', { affiliateProductId: 'ap-1', status: 'APPROVED' }],
        ]),
      });

      const result = buildEnrichedAffiliateProduct(mockReq(), baseProduct, lookup);

      expect(result.requestStatus).toBe('APPROVED');
      expect(result.isSaved).toBe(false);
      expect(result.isApproved).toBe(true);
      expect(result.isPending).toBe(false);
    });

    it('sets requestStatus and status booleans for PENDING', () => {
      const lookup = mockLookup({
        requestByAffiliateProductId: new Map([
          ['ap-1', { affiliateProductId: 'ap-1', status: 'PENDING' }],
        ]),
      });

      const result = buildEnrichedAffiliateProduct(mockReq(), baseProduct, lookup);

      expect(result.requestStatus).toBe('PENDING');
      expect(result.isSaved).toBe(false);
      expect(result.isApproved).toBe(false);
      expect(result.isPending).toBe(true);
    });

    it('builds affiliate link when link code exists', () => {
      const lookup = mockLookup({
        linkByAffiliateProductId: new Map([
          ['ap-1', { affiliateProductId: 'ap-1', code: 'CODE-123' }],
        ]),
      });

      const result = buildEnrichedAffiliateProduct(mockReq(), baseProduct, lookup);

      expect(result.affiliateLink).toBeTruthy();
      expect(typeof result.affiliateLink).toBe('string');
    });

    it('rounds rating to 1 decimal', () => {
      const lookup = mockLookup({
        ratingByProductId: new Map([['prod-1', { average: 4.567, total: 42 }]]),
      });

      const result = buildEnrichedAffiliateProduct(mockReq(), baseProduct, lookup);

      expect(result.rating).toBe(4.6);
      expect(result.totalReviews).toBe(42);
    });

    it('handles rating of 0', () => {
      const lookup = mockLookup({
        ratingByProductId: new Map([['prod-1', { average: 0, total: 0 }]]),
      });

      const result = buildEnrichedAffiliateProduct(mockReq(), baseProduct, lookup);

      expect(result.rating).toBe(0);
      expect(result.totalReviews).toBe(0);
    });

    it('sets producer from workspace name', () => {
      const lookup = mockLookup({
        productById: new Map([
          [
            'prod-1',
            {
              id: 'prod-1',
              workspaceId: 'ws-producer',
              name: 'Widget',
              description: null,
              price: 10,
              category: null,
              imageUrl: null,
              tags: [],
            },
          ],
        ]),
        workspaceById: new Map([['ws-producer', 'Producer Inc']]),
      });

      const result = buildEnrichedAffiliateProduct(mockReq(), baseProduct, lookup);

      expect(result.producer).toBe('Producer Inc');
    });

    it('normalizes promoMaterials from JSON value', () => {
      const product = { ...baseProduct, promoMaterials: ['banner.png', 'flyer.png'] };

      const result = buildEnrichedAffiliateProduct(mockReq(), product, mockLookup());

      expect(result.materials).toEqual(['banner.png', 'flyer.png']);
    });

    it('returns empty materials array for null promoMaterials', () => {
      const product = { ...baseProduct, promoMaterials: null };

      const result = buildEnrichedAffiliateProduct(mockReq(), product, mockLookup());

      expect(result.materials).toEqual([]);
    });
  });
});
