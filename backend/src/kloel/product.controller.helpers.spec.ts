import { BadRequestException } from '@nestjs/common';

import {
  AFTER_PAY_SHIPPING_PROVIDERS,
  PRODUCT_ACTIVE_STATUS,
  PRODUCT_DEFAULT_CURRENCY,
  PRODUCT_DEFAULT_FORMAT,
  PRODUCT_DEFAULT_STATUS,
  PRODUCT_LIST_TAKE_CAP,
  buildCreateProductData,
  buildProductListWhere,
  buildUpdateProductData,
  calculateProductStats,
  countProductImportResults,
  extractCategoriesFromProducts,
  validateUpdateProductDto,
} from './product.controller.helpers';

describe('product.controller.helpers', () => {
  describe('constants', () => {
    it('caps list responses at 500 products', () => {
      expect(PRODUCT_LIST_TAKE_CAP).toBe(500);
    });

    it('exposes the canonical product defaults', () => {
      expect(PRODUCT_DEFAULT_CURRENCY).toBe('BRL');
      expect(PRODUCT_DEFAULT_FORMAT).toBe('DIGITAL');
      expect(PRODUCT_DEFAULT_STATUS).toBe('DRAFT');
      expect(PRODUCT_ACTIVE_STATUS).toBe('APPROVED');
    });

    it('lists the allowed after-pay shipping providers', () => {
      expect(AFTER_PAY_SHIPPING_PROVIDERS).toEqual(['correios', 'jadlog', 'melhor_envio', 'outro']);
    });
  });

  describe('buildProductListWhere', () => {
    it('returns a workspace-only where when no filters are supplied', () => {
      expect(buildProductListWhere({ workspaceId: 'ws_1' })).toEqual({ workspaceId: 'ws_1' });
    });

    it('adds the category filter when supplied', () => {
      expect(buildProductListWhere({ workspaceId: 'ws_1', category: 'cursos' })).toEqual({
        workspaceId: 'ws_1',
        category: 'cursos',
      });
    });

    it('coerces the active flag from query-string strings', () => {
      expect(buildProductListWhere({ workspaceId: 'ws_1', active: 'true' })).toEqual({
        workspaceId: 'ws_1',
        active: true,
      });
      expect(buildProductListWhere({ workspaceId: 'ws_1', active: 'false' })).toEqual({
        workspaceId: 'ws_1',
        active: false,
      });
    });

    it('omits the active filter when undefined', () => {
      const where = buildProductListWhere({ workspaceId: 'ws_1' });
      expect(where).not.toHaveProperty('active');
    });

    it('builds a case-insensitive name|description OR when search is supplied', () => {
      expect(buildProductListWhere({ workspaceId: 'ws_1', search: 'shopify' })).toEqual({
        workspaceId: 'ws_1',
        OR: [
          { name: { contains: 'shopify', mode: 'insensitive' } },
          { description: { contains: 'shopify', mode: 'insensitive' } },
        ],
      });
    });
  });

  describe('validateUpdateProductDto', () => {
    it('accepts an empty dto', () => {
      expect(() => validateUpdateProductDto({})).not.toThrow();
    });

    it('accepts in-range commissionPercent boundaries', () => {
      expect(() => validateUpdateProductDto({ commissionPercent: 0 })).not.toThrow();
      expect(() => validateUpdateProductDto({ commissionPercent: 100 })).not.toThrow();
      expect(() => validateUpdateProductDto({ commissionPercent: 42 })).not.toThrow();
    });

    it('rejects commissionPercent above 100', () => {
      expect(() => validateUpdateProductDto({ commissionPercent: 101 })).toThrow(BadRequestException);
    });

    it('rejects negative commissionPercent', () => {
      expect(() => validateUpdateProductDto({ commissionPercent: -1 })).toThrow(BadRequestException);
    });

    it('accepts in-range commissionCookieDays boundaries', () => {
      expect(() => validateUpdateProductDto({ commissionCookieDays: 1 })).not.toThrow();
      expect(() => validateUpdateProductDto({ commissionCookieDays: 3650 })).not.toThrow();
    });

    it('rejects commissionCookieDays out of range', () => {
      expect(() => validateUpdateProductDto({ commissionCookieDays: 0 })).toThrow(BadRequestException);
      expect(() => validateUpdateProductDto({ commissionCookieDays: 3651 })).toThrow(
        BadRequestException,
      );
    });

    it('rejects negative afterPayChargeValue but tolerates null/undefined', () => {
      expect(() => validateUpdateProductDto({ afterPayChargeValue: -1 })).toThrow(BadRequestException);
      expect(() => validateUpdateProductDto({ afterPayChargeValue: null })).not.toThrow();
      expect(() => validateUpdateProductDto({ afterPayChargeValue: undefined })).not.toThrow();
      expect(() => validateUpdateProductDto({ afterPayChargeValue: 0 })).not.toThrow();
    });

    it.each(AFTER_PAY_SHIPPING_PROVIDERS)(
      'accepts %s as afterPayShippingProvider',
      (provider) => {
        expect(() =>
          validateUpdateProductDto({ afterPayShippingProvider: provider }),
        ).not.toThrow();
      },
    );

    it('rejects unknown afterPayShippingProvider values', () => {
      expect(() =>
        validateUpdateProductDto({ afterPayShippingProvider: 'fedex' }),
      ).toThrow(BadRequestException);
    });

    it('treats empty / null afterPayShippingProvider as "no value"', () => {
      expect(() => validateUpdateProductDto({ afterPayShippingProvider: '' })).not.toThrow();
      expect(() => validateUpdateProductDto({ afterPayShippingProvider: null })).not.toThrow();
    });
  });

  describe('buildCreateProductData', () => {
    it('applies canonical defaults for sparse DTOs', () => {
      const data = buildCreateProductData('ws_1', { name: 'Curso X' });
      expect(data).toMatchObject({
        workspaceId: 'ws_1',
        name: 'Curso X',
        description: null,
        price: 0,
        currency: 'BRL',
        category: null,
        imageUrl: null,
        tags: [],
        format: 'DIGITAL',
        status: 'DRAFT',
        active: false,
        salesPageUrl: null,
        thankyouUrl: null,
        supportEmail: null,
        warrantyDays: null,
        isSample: false,
        shippingType: null,
        shippingValue: null,
        originCep: null,
        metadata: {},
      });
    });

    it('flips active to true when status is APPROVED', () => {
      const data = buildCreateProductData('ws_1', { name: 'X', status: 'APPROVED' });
      expect(data.active).toBe(true);
      expect(data.status).toBe('APPROVED');
    });

    it('preserves explicit fields verbatim', () => {
      const data = buildCreateProductData('ws_1', {
        name: 'Curso',
        description: 'desc',
        price: 199,
        currency: 'USD',
        category: 'edu',
        sku: 'SKU-1',
        tags: ['promo'],
        format: 'PHYSICAL',
        status: 'PENDING',
        slug: 'curso-1',
        metadata: { source: 'import' },
      });
      expect(data).toMatchObject({
        description: 'desc',
        price: 199,
        currency: 'USD',
        category: 'edu',
        sku: 'SKU-1',
        tags: ['promo'],
        format: 'PHYSICAL',
        status: 'PENDING',
        active: false,
        slug: 'curso-1',
        metadata: { source: 'import' },
      });
    });

    it('omits optional keys when not supplied', () => {
      const data = buildCreateProductData('ws_1', { name: 'X' });
      expect(data).not.toHaveProperty('sku');
      expect(data).not.toHaveProperty('thankyouBoletoUrl');
      expect(data).not.toHaveProperty('thankyouPixUrl');
      expect(data).not.toHaveProperty('reclameAquiUrl');
      expect(data).not.toHaveProperty('slug');
    });
  });

  describe('buildUpdateProductData', () => {
    it('returns an empty bag for an empty DTO', () => {
      expect(buildUpdateProductData({})).toEqual({});
    });

    it('forwards arbitrary fields verbatim', () => {
      expect(buildUpdateProductData({ name: 'New', supportEmail: 'a@b.c' })).toEqual({
        name: 'New',
        supportEmail: 'a@b.c',
      });
    });

    it('only writes active/featured when explicitly supplied', () => {
      expect(buildUpdateProductData({ active: true })).toEqual({ active: true });
      expect(buildUpdateProductData({ featured: false })).toEqual({ featured: false });
      expect(buildUpdateProductData({})).not.toHaveProperty('active');
      expect(buildUpdateProductData({})).not.toHaveProperty('featured');
    });

    it('forces afterPayChargeValue to null when afterPayAffiliateCharge flips to false', () => {
      const data = buildUpdateProductData({
        afterPayAffiliateCharge: false,
        afterPayChargeValue: 50,
      });
      expect(data.afterPayChargeValue).toBeNull();
    });

    it('leaves afterPayChargeValue untouched when afterPayAffiliateCharge is true', () => {
      const data = buildUpdateProductData({
        afterPayAffiliateCharge: true,
        afterPayChargeValue: 25,
      });
      expect(data.afterPayChargeValue).toBe(25);
    });

    it('coerces a falsy price to 0', () => {
      expect(buildUpdateProductData({ price: 0 }).price).toBe(0);
    });

    it('preserves a positive price', () => {
      expect(buildUpdateProductData({ price: 199 }).price).toBe(199);
    });

    it('does not emit a price key when none is supplied', () => {
      expect(buildUpdateProductData({})).not.toHaveProperty('price');
    });

    it('passes metadata through when provided', () => {
      const data = buildUpdateProductData({ metadata: { foo: 'bar' } });
      expect(data.metadata).toEqual({ foo: 'bar' });
    });
  });

  describe('calculateProductStats', () => {
    it('returns all-zero totals for an empty list', () => {
      expect(calculateProductStats([], new Map())).toEqual({
        totalProducts: 0,
        activeProducts: 0,
        totalSales: 0,
        totalRevenue: 0,
      });
    });

    it('counts active products only', () => {
      const stats = calculateProductStats(
        [
          { id: 'a', active: true },
          { id: 'b', active: false },
          { id: 'c', active: true },
        ],
        new Map(),
      );
      expect(stats.totalProducts).toBe(3);
      expect(stats.activeProducts).toBe(2);
    });

    it('sums totalSales and totalRevenue from the metrics map', () => {
      const stats = calculateProductStats(
        [
          { id: 'a', active: true },
          { id: 'b', active: true },
        ],
        new Map([
          ['a', { totalSales: 10, totalRevenue: 1000 }],
          ['b', { totalSales: 5, totalRevenue: 500 }],
        ]),
      );
      expect(stats.totalSales).toBe(15);
      expect(stats.totalRevenue).toBe(1500);
    });

    it('coerces string metric values via Number()', () => {
      const stats = calculateProductStats(
        [{ id: 'a', active: true }],
        new Map([['a', { totalSales: '7', totalRevenue: '70.5' }]]),
      );
      expect(stats.totalSales).toBe(7);
      expect(stats.totalRevenue).toBe(70.5);
    });

    it('treats missing metric rows as zero', () => {
      const stats = calculateProductStats(
        [
          { id: 'a', active: true },
          { id: 'b', active: false },
        ],
        new Map([['a', { totalSales: 3, totalRevenue: 30 }]]),
      );
      expect(stats.totalSales).toBe(3);
      expect(stats.totalRevenue).toBe(30);
    });
  });

  describe('extractCategoriesFromProducts', () => {
    it('returns the unique truthy categories', () => {
      expect(
        extractCategoriesFromProducts([
          { category: 'edu' },
          { category: 'fitness' },
          { category: 'edu' },
        ]),
      ).toEqual(['edu', 'fitness', 'edu']);
    });

    it('filters out null and empty values', () => {
      expect(
        extractCategoriesFromProducts([
          { category: 'edu' },
          { category: null },
          { category: '' },
          { category: undefined },
        ]),
      ).toEqual(['edu']);
    });

    it('returns an empty list when nothing matches', () => {
      expect(extractCategoriesFromProducts([{ category: null }, { category: undefined }])).toEqual(
        [],
      );
    });
  });

  describe('countProductImportResults', () => {
    it('returns zeros for an empty results array', () => {
      expect(countProductImportResults([])).toEqual({ imported: 0, failed: 0 });
    });

    it('counts successes and failures separately', () => {
      expect(
        countProductImportResults([
          { success: true },
          { success: false },
          { success: true },
          { success: true },
          { success: false },
        ]),
      ).toEqual({ imported: 3, failed: 2 });
    });
  });
});
