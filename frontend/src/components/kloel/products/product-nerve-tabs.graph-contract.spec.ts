import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PLAN_DETAIL_SUBTABS } from './product-nerve-tabs.const';

describe('ProductNerveCenter graph placement contract', () => {
  it('shows Checkout inside plan editing without changing the legacy inline sub-tab key', () => {
    expect(PLAN_DETAIL_SUBTABS.map((tab) => tab.k)).toEqual([
      'loja',
      'pagamento',
      'frete',
      'afiliacao',
      'bump',
    ]);
    expect(PLAN_DETAIL_SUBTABS.map((tab) => tab.l)).toContain('Checkout');
    expect(PLAN_DETAIL_SUBTABS).toContainEqual({ k: 'bump', l: 'Checkout' });
  });

  it('keeps the legacy plan detail route aligned with Checkout inside plan editing', () => {
    const planDetailPage = readFileSync(
      'src/app/(main)/products/[id]/plans/[planId]/page.tsx',
      'utf8',
    );
    const planDetailTabs = readFileSync(
      'src/app/(main)/products/[id]/plans/[planId]/plan-detail-tabs.ts',
      'utf8',
    );

    expect(planDetailTabs).toContain("id: 'checkout'");
    expect(planDetailTabs).toContain('Checkout');
    expect(planDetailTabs).not.toContain("id: 'orderbump'");
    expect(planDetailPage).toContain('CheckoutEditorPage');
    expect(planDetailPage).toContain("activeTab === 'checkout'");
    expect(planDetailPage).not.toContain('PlanOrderBumpTab');
  });

  it('keeps order bump deep-links inside the checkout editor instead of the old plan sub-tab', () => {
    const checkoutPage = readFileSync('src/app/(main)/checkout/[planId]/page.tsx', 'utf8');
    const campanhasTab = readFileSync(
      'src/components/kloel/products/ProductNerveCenterCampanhasTab.tsx',
      'utf8',
    );

    expect(checkoutPage).not.toContain('planSub=bump');
    expect(campanhasTab).not.toContain('planSub=bump');
    expect(checkoutPage).toContain('tab=checkouts&focus=order-bump');
    expect(campanhasTab).toContain('tab=checkouts&focus=order-bump');
  });
});
