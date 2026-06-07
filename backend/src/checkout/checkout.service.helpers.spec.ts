import {
  buildDuplicateCheckoutInput,
  CHECKOUT_PLAN_LINK_INCLUDE,
  isActivePlanKind,
  isLegacyPlanEligibleForMigration,
  mapPixelsForDuplicate,
  PLAN_INCLUDE,
  stripConfigMetadata,
  type DuplicateCheckoutSource,
} from './checkout.service.helpers'; // ─── buildDuplicateCheckoutInput ────────────────────────────────────────

describe('buildDuplicateCheckoutInput', () => {
  const base: DuplicateCheckoutSource = {
    name: 'Plano Pro',
    priceInCents: 19990,
    currency: 'BRL',
    maxInstallments: 12,
    installmentsFee: false,
    quantity: 1,
    freeShipping: true,
    compareAtPrice: 29990,
    shippingPrice: null,
    checkoutConfig: { brandName: 'Marca Pro' },
  };

  it('appends (Copia) to name', () => {
    const result = buildDuplicateCheckoutInput(base);
    expect(result.name).toBe('Plano Pro (Copia)');
  });

  it('preserves price, currency, installments, quantity, freeShipping', () => {
    const result = buildDuplicateCheckoutInput(base);
    expect(result.priceInCents).toBe(19990);
    expect(result.currency).toBe('BRL');
    expect(result.maxInstallments).toBe(12);
    expect(result.installmentsFee).toBe(false);
    expect(result.quantity).toBe(1);
    expect(result.freeShipping).toBe(true);
  });

  it('uses checkoutConfig.brandName when available', () => {
    const result = buildDuplicateCheckoutInput(base);
    expect(result.brandName).toBe('Marca Pro');
  });

  it('falls back to source.name when checkoutConfig.brandName is missing', () => {
    const result = buildDuplicateCheckoutInput({
      ...base,
      checkoutConfig: null,
    });
    expect(result.brandName).toBe('Plano Pro');
  });

  it('includes compareAtPrice when non-null', () => {
    const result = buildDuplicateCheckoutInput(base);
    expect(result.compareAtPrice).toBe(29990);
  });

  it('omits compareAtPrice when null', () => {
    const result = buildDuplicateCheckoutInput({ ...base, compareAtPrice: null });
    expect(result).not.toHaveProperty('compareAtPrice');
  });

  it('omits compareAtPrice when undefined', () => {
    const { compareAtPrice: _, ...rest } = base;
    const result = buildDuplicateCheckoutInput(rest as DuplicateCheckoutSource);
    expect(result).not.toHaveProperty('compareAtPrice');
  });

  it('includes shippingPrice when non-null', () => {
    const result = buildDuplicateCheckoutInput({ ...base, shippingPrice: 1500 });
    expect(result.shippingPrice).toBe(1500);
  });

  it('omits shippingPrice when null', () => {
    const result = buildDuplicateCheckoutInput({ ...base, shippingPrice: null });
    expect(result).not.toHaveProperty('shippingPrice');
  });

  it('handles 0 compareAtPrice correctly', () => {
    const result = buildDuplicateCheckoutInput({ ...base, compareAtPrice: 0 });
    expect(result.compareAtPrice).toBe(0);
  });

  it('handles 0 shippingPrice correctly', () => {
    const result = buildDuplicateCheckoutInput({ ...base, shippingPrice: 0 });
    expect(result.shippingPrice).toBe(0);
  });
}); // ─── mapPixelsForDuplicate ──────────────────────────────────────────────

describe('mapPixelsForDuplicate', () => {
  const configId = 'config-abc';

  it('maps an empty array to an empty array', () => {
    expect(mapPixelsForDuplicate([], configId)).toEqual([]);
  });

  it('maps pixel fields, adding checkoutConfigId', () => {
    const pixels = [
      {
        type: 'FACEBOOK' as const,
        pixelId: 'fb-123',
        accessToken: 'tok',
        trackPageView: false,
        trackInitiateCheckout: true,
        trackAddPaymentInfo: false,
        trackPurchase: true,
      },
    ];
    const result = mapPixelsForDuplicate(pixels, configId);
    expect(result).toEqual([
      {
        checkoutConfigId: configId,
        type: 'FACEBOOK',
        pixelId: 'fb-123',
        accessToken: 'tok',
        trackPageView: false,
        trackInitiateCheckout: true,
        trackAddPaymentInfo: false,
        trackPurchase: true,
      },
    ]);
  });

  it('defaults missing boolean flags to true', () => {
    const pixels = [
      {
        type: 'TIKTOK' as const,
        pixelId: 'tt-456',
      },
    ];
    const result = mapPixelsForDuplicate(pixels, configId);
    expect(result[0].trackPageView).toBe(true);
    expect(result[0].trackInitiateCheckout).toBe(true);
    expect(result[0].trackAddPaymentInfo).toBe(true);
    expect(result[0].trackPurchase).toBe(true);
  });

  it('defaults null accessToken to null', () => {
    const pixels = [{ type: 'GOOGLE' as const, pixelId: 'g-789', accessToken: null }];
    const result = mapPixelsForDuplicate(pixels, configId);
    expect(result[0].accessToken).toBeNull();
  });

  it('defaults missing accessToken to null', () => {
    const pixels = [{ type: 'GOOGLE' as const, pixelId: 'g-789' }];
    const result = mapPixelsForDuplicate(pixels, configId);
    expect(result[0].accessToken).toBeNull();
  });

  it('preserves type and pixelId generically', () => {
    const pixels = [{ type: 42, pixelId: Symbol('x') as unknown as string }];
    const result = mapPixelsForDuplicate(pixels, configId);
    expect(result[0].type).toBe(42);
    expect(result[0].pixelId).toBe(pixels[0].pixelId);
  });
}); // ─── stripConfigMetadata ─────────────────────────────────────────────────

describe('stripConfigMetadata', () => {
  it('removes id, planId, pixels, createdAt, updatedAt', () => {
    const input = {
      id: 'cfg-1',
      planId: 'plan-1',
      pixels: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      headerColor: '#000',
      ctaLabel: 'Comprar',
    };
    const result = stripConfigMetadata(input);
    expect(result).toEqual({ headerColor: '#000', ctaLabel: 'Comprar' });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('planId');
    expect(result).not.toHaveProperty('pixels');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('updatedAt');
  });

  it('returns empty object when only metadata fields exist', () => {
    const input = {
      id: 'cfg-1',
      planId: 'plan-1',
      pixels: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = stripConfigMetadata(input);
    expect(result).toEqual({});
  });

  it('preserves additional unknown keys', () => {
    const input = {
      id: 'cfg-1',
      planId: 'plan-1',
      pixels: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      extraField: 42,
      nested: { deep: true },
    };
    const result = stripConfigMetadata(input);
    expect(result).toEqual({ extraField: 42, nested: { deep: true } });
  });
}); // ─── CHECKOUT_PLAN_LINK_INCLUDE ─────────────────────────────────────────

describe('CHECKOUT_PLAN_LINK_INCLUDE', () => {
  it('includes checkout with checkoutConfig.pixels', () => {
    const inc = CHECKOUT_PLAN_LINK_INCLUDE as Record<string, unknown>;
    expect(inc.checkout).toEqual({
      include: { checkoutConfig: { include: { pixels: true } } },
    });
  });

  it('includes plan with product, config, bumps, upsells', () => {
    const inc = CHECKOUT_PLAN_LINK_INCLUDE as Record<string, unknown>;
    const plan = inc.plan as Record<string, unknown>;
    const planInc = plan.include as Record<string, unknown>;
    expect(planInc.product).toBe(true);
    expect(planInc.checkoutConfig).toEqual({ include: { pixels: true } });
    expect(planInc.orderBumps).toEqual({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    expect(planInc.upsells).toEqual({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  });
}); // ─── PLAN_INCLUDE ───────────────────────────────────────────────────────

describe('PLAN_INCLUDE', () => {
  it('includes product, checkoutConfig.pixels, bumps, upsells', () => {
    const inc = PLAN_INCLUDE as Record<string, unknown>;
    expect(inc.product).toBe(true);
    expect(inc.checkoutConfig).toEqual({ include: { pixels: true } });
    expect(inc.orderBumps).toEqual({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    expect(inc.upsells).toEqual({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  });
}); // ─── isLegacyPlanEligibleForMigration ───────────────────────────────────

describe('isLegacyPlanEligibleForMigration', () => {
  it('returns true for active PLAN with legacyCheckoutEnabled and a published product', () => {
    expect(
      isLegacyPlanEligibleForMigration({
        isActive: true,
        kind: 'PLAN',
        legacyCheckoutEnabled: true,
        product: { active: true, status: 'APPROVED' },
      }),
    ).toBe(true);
  });

  it('returns false when legacyCheckoutEnabled is false', () => {
    expect(
      isLegacyPlanEligibleForMigration({
        isActive: true,
        kind: 'PLAN',
        legacyCheckoutEnabled: false,
      }),
    ).toBe(false);
  });

  it('returns false when the legacy plan product is not published', () => {
    expect(
      isLegacyPlanEligibleForMigration({
        isActive: true,
        kind: 'PLAN',
        legacyCheckoutEnabled: true,
        product: { active: true, status: 'DRAFT' },
      }),
    ).toBe(false);
  });

  it('returns false when legacyCheckoutEnabled is missing', () => {
    expect(isLegacyPlanEligibleForMigration({ isActive: true, kind: 'PLAN' })).toBe(false);
  });

  it('returns false when isActive is false', () => {
    expect(
      isLegacyPlanEligibleForMigration({
        isActive: false,
        kind: 'PLAN',
        legacyCheckoutEnabled: true,
      }),
    ).toBe(false);
  });

  it('returns false when kind is not PLAN', () => {
    expect(
      isLegacyPlanEligibleForMigration({
        isActive: true,
        kind: 'CHECKOUT',
        legacyCheckoutEnabled: true,
      }),
    ).toBe(false);
  });

  it('returns false for null', () => {
    expect(isLegacyPlanEligibleForMigration(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isLegacyPlanEligibleForMigration(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isLegacyPlanEligibleForMigration({})).toBe(false);
  });
}); // ─── isActivePlanKind ────────────────────────────────────────────────────

describe('isActivePlanKind', () => {
  it('returns true for active PLAN backed by a published product', () => {
    expect(
      isActivePlanKind({
        isActive: true,
        kind: 'PLAN',
        product: { active: true, status: 'APPROVED' },
      }),
    ).toBe(true);
  });

  it('returns false when the backing product is not published', () => {
    expect(
      isActivePlanKind({
        isActive: true,
        kind: 'PLAN',
        product: { active: false, status: 'DRAFT' },
      }),
    ).toBe(false);
  });

  it('returns false when isActive is false', () => {
    expect(isActivePlanKind({ isActive: false, kind: 'PLAN' })).toBe(false);
  });

  it('returns false when isActive is null', () => {
    expect(isActivePlanKind({ isActive: null, kind: 'PLAN' })).toBe(false);
  });

  it('returns false when isActive is missing', () => {
    expect(isActivePlanKind({ kind: 'PLAN' })).toBe(false);
  });

  it('returns false when kind is not PLAN', () => {
    expect(isActivePlanKind({ isActive: true, kind: 'CHECKOUT' })).toBe(false);
  });

  it('returns false when kind is null', () => {
    expect(isActivePlanKind({ isActive: true, kind: null })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isActivePlanKind(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isActivePlanKind(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isActivePlanKind({})).toBe(false);
  });
});
