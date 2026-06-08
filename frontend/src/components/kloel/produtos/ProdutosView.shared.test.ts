import { describe, expect, it } from 'vitest';

import { getProductPlanPriceSummary } from './ProdutosView.shared';

describe('getProductPlanPriceSummary', () => {
  it('uses the product base price before a plan is configured', () => {
    const product = {
      minPlanPriceInCents: null,
      maxPlanPriceInCents: null,
      price: 197.9,
    } as Parameters<typeof getProductPlanPriceSummary>[0] & {
      price: number;
    };
    const summary = getProductPlanPriceSummary(product);

    expect(summary.hasPlanPricing).toBe(false);
    expect(summary.minPlanPriceInCents).toBeNull();
    expect(summary.maxPlanPriceInCents).toBeNull();
    expect(summary.priceLabel).toContain('197,90');
    expect(summary.priceLabel).not.toBe('Sem planos');
  });
});
