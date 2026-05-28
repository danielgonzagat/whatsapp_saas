import {
  buildCheckoutProjection,
  buildCouponCreateProjection,
  buildListCheckoutsArgs,
  buildPlanCreateProjection,
  buildPlanUpdateProjection,
  LIST_CHECKOUTS_FIND_MANY_OPTIONS,
  readCouponCode,
  readCouponId,
  readDeleteCouponCode,
  readUrlUpdateLabel,
} from './kloel-product-sub-resource-tools.service.helpers';

describe('kloel-product-sub-resource-tools.service.helpers (projections + readers)', () => {
  describe('buildPlanCreateProjection', () => {
    it('extracts id/name/price only', () => {
      const plan = { id: 'p1', name: 'Plan A', price: 100, extra: 'ignored' };
      expect(buildPlanCreateProjection(plan)).toEqual({ id: 'p1', name: 'Plan A', price: 100 });
    });
  });

  describe('buildPlanUpdateProjection', () => {
    it('extracts the six update-visible fields', () => {
      const plan = {
        id: 'p1',
        name: 'A',
        price: 50,
        itemsPerPlan: 2,
        maxInstallments: 12,
        active: true,
        extra: 'nope',
      };
      expect(buildPlanUpdateProjection(plan)).toEqual({
        id: 'p1',
        name: 'A',
        price: 50,
        itemsPerPlan: 2,
        maxInstallments: 12,
        active: true,
      });
    });
  });

  describe('buildCheckoutProjection', () => {
    it('extracts id/name only', () => {
      expect(buildCheckoutProjection({ id: 'c1', name: 'C' })).toEqual({ id: 'c1', name: 'C' });
    });
  });

  describe('buildCouponCreateProjection', () => {
    it('extracts id/code only', () => {
      expect(buildCouponCreateProjection({ id: 'cp1', code: 'PROMO' })).toEqual({
        id: 'cp1',
        code: 'PROMO',
      });
    });
  });

  describe('LIST_CHECKOUTS_FIND_MANY_OPTIONS', () => {
    it('locks the projection/order/take contract', () => {
      expect(LIST_CHECKOUTS_FIND_MANY_OPTIONS).toEqual({
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });
  });

  describe('buildListCheckoutsArgs', () => {
    it('combines workspace filter with the find-many options', () => {
      expect(buildListCheckoutsArgs('ws-1')).toEqual({
        where: { product: { workspaceId: 'ws-1' } },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });
  });

  describe('readUrlUpdateLabel', () => {
    it('prefers args.label', () => {
      expect(readUrlUpdateLabel({ label: 'A', urlLabel: 'B' })).toBe('A');
    });

    it('falls back to urlLabel', () => {
      expect(readUrlUpdateLabel({ urlLabel: 'B' })).toBe('B');
    });

    it('returns empty when neither present', () => {
      expect(readUrlUpdateLabel({})).toBe('');
    });
  });

  describe('readCouponCode', () => {
    it('prefers args.code', () => {
      expect(readCouponCode({ code: 'X', couponCode: 'Y' })).toBe('X');
    });

    it('falls back to couponCode', () => {
      expect(readCouponCode({ couponCode: 'Y' })).toBe('Y');
    });

    it('returns empty when neither present', () => {
      expect(readCouponCode({})).toBe('');
    });
  });

  describe('readCouponId', () => {
    it('returns args.couponId as string', () => {
      expect(readCouponId({ couponId: 'c-1' })).toBe('c-1');
    });

    it('returns empty when missing', () => {
      expect(readCouponId({})).toBe('');
    });
  });

  describe('readDeleteCouponCode', () => {
    it('prefers args.couponCode', () => {
      expect(readDeleteCouponCode({ couponCode: 'A', code: 'B' })).toBe('A');
    });

    it('falls back to code', () => {
      expect(readDeleteCouponCode({ code: 'B' })).toBe('B');
    });

    it('returns empty when neither present', () => {
      expect(readDeleteCouponCode({})).toBe('');
    });
  });
});
