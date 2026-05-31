import { ForbiddenException } from '@nestjs/common';
import type { Product } from '@prisma/client';
import {
  assertWorkspaceId,
  buildCommercialPayload,
  buildListWhere,
  priceInCentsOf,
  resolvePagination,
} from './product.helpers';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    workspaceId: 'ws-1',
    name: 'Widget',
    description: 'A widget',
    price: 19.9,
    category: 'cat',
    sku: 'SKU-1',
    format: 'PHYSICAL',
    status: 'DRAFT',
    active: false,
    imageUrl: null,
    tags: [],
    salesPageUrl: null,
    thankyouUrl: null,
    thankyouBoletoUrl: null,
    thankyouPixUrl: null,
    reclameAquiUrl: null,
    supportEmail: null,
    warrantyDays: null,
    shippingType: null,
    shippingValue: null,
    originCep: null,
    affiliateEnabled: false,
    affiliateVisible: false,
    affiliateAutoApprove: false,
    affiliateAccessData: false,
    affiliateAccessAbandoned: false,
    affiliateFirstInstallment: false,
    commissionType: null,
    commissionPercent: null,
    commissionCookieDays: null,
    stockQuantity: null,
    trackStock: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Product;
}

describe('product.helpers', () => {
  describe('priceInCentsOf', () => {
    it('rounds float prices to integer cents', () => {
      expect(priceInCentsOf(19.9)).toBe(1990);
    });

    it('handles integer prices', () => {
      expect(priceInCentsOf(10)).toBe(1000);
    });

    it('rounds half up via Math.round', () => {
      expect(priceInCentsOf(0.005)).toBe(1);
    });

    it('coerces decimal-like values via Number()', () => {
      // Prisma.Decimal stringifies — emulate
      expect(priceInCentsOf('12.34' as unknown as number)).toBe(1234);
    });
  });

  describe('buildCommercialPayload', () => {
    it('emits the canonical product fields', () => {
      const product = makeProduct();
      const payload = buildCommercialPayload(product);
      expect(payload).toEqual({
        productId: 'prod-1',
        name: 'Widget',
        priceInCents: 1990,
        format: 'PHYSICAL',
        status: 'DRAFT',
        active: false,
      });
    });

    it('merges extras after the canonical fields', () => {
      const product = makeProduct();
      const payload = buildCommercialPayload(product, { changes: ['active'] });
      expect(payload).toMatchObject({ changes: ['active'], productId: 'prod-1' });
    });

    it('lets extras override canonical fields when explicitly passed', () => {
      const product = makeProduct();
      const payload = buildCommercialPayload(product, { name: 'override' });
      expect(payload.name).toBe('override');
    });
  });

  describe('buildListWhere', () => {
    it('always scopes to workspaceId', () => {
      const where = buildListWhere('ws-7');
      expect(where).toEqual({ workspaceId: 'ws-7' });
    });

    it('adds case-insensitive search across name and description', () => {
      const where = buildListWhere('ws-1', { search: 'foo' });
      expect(where.OR).toEqual([
        { name: { contains: 'foo', mode: 'insensitive' } },
        { description: { contains: 'foo', mode: 'insensitive' } },
      ]);
    });

    it('applies category/status/format/active filters when provided', () => {
      const where = buildListWhere('ws-1', {
        category: 'C',
        status: 'APPROVED',
        format: 'DIGITAL',
        active: true,
      });
      expect(where).toMatchObject({
        workspaceId: 'ws-1',
        category: 'C',
        status: 'APPROVED',
        format: 'DIGITAL',
        active: true,
      });
    });

    it('omits filters that are undefined', () => {
      const where = buildListWhere('ws-1', { active: false });
      expect(where.active).toBe(false);
      expect(where.category).toBeUndefined();
    });
  });

  describe('resolvePagination', () => {
    it('defaults to page 1 / limit 20', () => {
      expect(resolvePagination()).toEqual({ page: 1, limit: 20, skip: 0 });
    });

    it('computes skip from page and limit', () => {
      expect(resolvePagination({ page: 3, limit: 25 })).toEqual({
        page: 3,
        limit: 25,
        skip: 50,
      });
    });
  });

  describe('assertWorkspaceId', () => {
    it('throws ForbiddenException for empty string', () => {
      expect(() => assertWorkspaceId('')).toThrow(ForbiddenException);
    });

    it('throws for null/undefined', () => {
      expect(() => assertWorkspaceId(null)).toThrow(ForbiddenException);
      expect(() => assertWorkspaceId(undefined)).toThrow(ForbiddenException);
    });

    it('returns silently for non-empty strings', () => {
      expect(() => assertWorkspaceId('ws-1')).not.toThrow();
    });
  });
});
