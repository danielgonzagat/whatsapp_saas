import {
  buildAffiliateConfigPatch,
  buildPlanObservedPayload,
  buildPlanUpdatedPayload,
  buildPlanUpdatePatch,
  checkoutImagesObject,
  checkoutImagesWith,
  paymentMethodsJson,
  planPriceInCents,
  shippingConfigJson,
} from './plan.service.helpers';

describe('plan.service.helpers', () => {
  describe('checkoutImagesObject', () => {
    it('returns the value when it is a plain object', () => {
      const value = { imageUrl: 'a' };
      expect(checkoutImagesObject(value)).toBe(value);
    });

    it('returns {} when value is null', () => {
      expect(checkoutImagesObject(null)).toEqual({});
    });

    it('returns {} when value is an array', () => {
      expect(checkoutImagesObject([1, 2, 3])).toEqual({});
    });

    it('returns {} when value is a primitive', () => {
      expect(checkoutImagesObject(42)).toEqual({});
      expect(checkoutImagesObject('str')).toEqual({});
      expect(checkoutImagesObject(undefined)).toEqual({});
    });
  });

  describe('checkoutImagesWith', () => {
    it('merges patch on top of the current object', () => {
      expect(checkoutImagesWith({ a: 1, b: 2 }, { b: 9, c: 3 })).toEqual({ a: 1, b: 9, c: 3 });
    });

    it('treats null current as empty', () => {
      expect(checkoutImagesWith(null, { x: 1 })).toEqual({ x: 1 });
    });
  });

  describe('paymentMethodsJson', () => {
    it('omits undefined fields', () => {
      expect(paymentMethodsJson({ card: true })).toEqual({ card: true });
    });

    it('includes false explicitly', () => {
      expect(paymentMethodsJson({ card: false, pix: true })).toEqual({ card: false, pix: true });
    });

    it('returns empty when no fields are set', () => {
      expect(paymentMethodsJson({})).toEqual({});
    });
  });

  describe('shippingConfigJson', () => {
    it('forwards only set fields', () => {
      expect(shippingConfigJson({ type: 'FIXED', fixedValue: 1500 })).toEqual({
        type: 'FIXED',
        fixedValue: 1500,
      });
    });

    it('preserves zero fixedValue', () => {
      expect(shippingConfigJson({ fixedValue: 0 })).toEqual({ fixedValue: 0 });
    });

    it('returns empty when nothing is set', () => {
      expect(shippingConfigJson({})).toEqual({});
    });
  });

  describe('buildPlanUpdatePatch', () => {
    it('returns null when DTO has no recognised fields', () => {
      expect(buildPlanUpdatePatch({}, null)).toBeNull();
    });

    it('coerces price, maxInstallments, itemsPerPlan to Number', () => {
      const result = buildPlanUpdatePatch(
        {
          price: '12.5' as unknown as number,
          maxInstallments: '3' as unknown as number,
          itemsPerPlan: '2' as unknown as number,
        },
        null,
      );
      expect(result).not.toBeNull();
      expect(result!.updates.price).toBe(12.5);
      expect(result!.updates.maxInstallments).toBe(3);
      expect(result!.updates.itemsPerPlan).toBe(2);
    });

    it('coerces active and visibleToAffiliates to Boolean', () => {
      const result = buildPlanUpdatePatch(
        {
          active: 1 as unknown as boolean,
          visibleToAffiliates: 0 as unknown as boolean,
        },
        null,
      );
      expect(result).not.toBeNull();
      expect(result!.updates.active).toBe(true);
      expect(result!.updates.visibleToAffiliates).toBe(false);
    });

    it('lists the changed field names', () => {
      const result = buildPlanUpdatePatch({ name: 'X', price: 10 }, null);
      expect(result).not.toBeNull();
      // A price change additively dual-writes priceInCents (PRODUCT-PLAN PHASE A).
      expect(result!.changes.sort()).toEqual(['name', 'price', 'priceInCents']);
      expect(result!.updates.price).toBe(10);
      expect(result!.updates.priceInCents).toBe(1000);
    });

    it('merges acceptCoupons / imageUrl into checkoutImages on top of existing', () => {
      const result = buildPlanUpdatePatch(
        { acceptCoupons: true, imageUrl: 'https://x.png' },
        { existing: 'kept' },
      );
      expect(result).not.toBeNull();
      expect(result!.updates.checkoutImages).toEqual({
        existing: 'kept',
        acceptCoupons: true,
        imageUrl: 'https://x.png',
      });
      expect(result!.changes).toEqual(['checkoutImages']);
    });

    it('does not write to checkoutImages when neither acceptCoupons nor imageUrl was set', () => {
      const result = buildPlanUpdatePatch({ name: 'X' }, { keep: 'me' });
      expect(result).not.toBeNull();
      expect('checkoutImages' in result!.updates).toBe(false);
    });
  });

  describe('buildAffiliateConfigPatch', () => {
    it('returns empty updates / details when config is empty', () => {
      expect(buildAffiliateConfigPatch({}, null)).toEqual({ updates: {}, details: {} });
    });

    it('mirrors visibleToAffiliates into updates and details', () => {
      const { updates, details } = buildAffiliateConfigPatch({ visibleToAffiliates: true }, null);
      expect(updates).toEqual({ visibleToAffiliates: true });
      expect(details).toEqual({ visibleToAffiliates: true });
    });

    it('merges customCommission into checkoutImages and mirrors it into details', () => {
      const { updates, details } = buildAffiliateConfigPatch(
        { customCommission: 25 },
        { keep: 'me' },
      );
      expect(updates).toEqual({ checkoutImages: { keep: 'me', customCommission: 25 } });
      expect(details).toEqual({ customCommission: 25 });
    });

    it('handles both fields at once', () => {
      const { updates, details } = buildAffiliateConfigPatch(
        { visibleToAffiliates: false, customCommission: 10 },
        null,
      );
      expect(updates).toEqual({
        visibleToAffiliates: false,
        checkoutImages: { customCommission: 10 },
      });
      expect(details).toEqual({ visibleToAffiliates: false, customCommission: 10 });
    });
  });

  describe('planPriceInCents', () => {
    it('returns null for null price', () => {
      expect(planPriceInCents(null)).toBeNull();
    });

    it('rounds floating-point to integer cents', () => {
      expect(planPriceInCents(12.349)).toBe(1235);
      expect(planPriceInCents(0)).toBe(0);
    });

    it('parses string prices', () => {
      expect(planPriceInCents('19.99')).toBe(1999);
    });
  });

  describe('buildPlanObservedPayload', () => {
    it('builds the cognitive-spine payload with priceInCents', () => {
      const plan = { id: 'p1', name: 'Basic', price: 49.9 };
      expect(buildPlanObservedPayload(plan, 'prod-1')).toEqual({
        planId: 'p1',
        name: 'Basic',
        priceInCents: 4990,
        productId: 'prod-1',
      });
    });

    it('carries null price through', () => {
      const plan = { id: 'p1', name: 'Free', price: null };
      const payload = buildPlanObservedPayload(plan, 'prod-1');
      expect(payload.priceInCents).toBeNull();
    });
  });

  describe('buildPlanUpdatedPayload', () => {
    it('builds the updated payload with changes list', () => {
      const plan = { id: 'p1', name: 'Pro', price: '100.00' };
      expect(buildPlanUpdatedPayload(plan, 'prod-1', ['price', 'name'])).toEqual({
        planId: 'p1',
        name: 'Pro',
        priceInCents: 10000,
        productId: 'prod-1',
        changes: ['price', 'name'],
      });
    });
  });
});
