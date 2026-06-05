import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductNerveCenterCuponsTab } from './ProductNerveCenterCuponsTab';
import {
  ProductNerveCenterProvider,
  type ProductNerveCenterContextValue,
} from './product-nerve-center.context';

function buildContext(overrides: Partial<ProductNerveCenterContextValue> = {}) {
  const context: ProductNerveCenterContextValue = {
    productId: 'product-1',
    p: { id: 'product-1', name: 'Produto QA' },
    refreshProduct: vi.fn().mockResolvedValue(undefined),
    updateProduct: vi.fn().mockResolvedValue(undefined),
    rawPlans: [],
    PLANS: [],
    plansLoading: false,
    updatePlan: vi.fn().mockResolvedValue(undefined),
    deletePlan: vi.fn().mockResolvedValue(undefined),
    createPlan: vi.fn().mockResolvedValue(undefined),
    duplicatePlan: vi.fn().mockResolvedValue(undefined),
    rawCheckouts: [],
    createCheckout: vi.fn().mockResolvedValue(undefined),
    duplicateCheckout: vi.fn().mockResolvedValue(undefined),
    deleteCheckout: vi.fn().mockResolvedValue(undefined),
    syncCheckoutLinks: vi.fn().mockResolvedValue(undefined),
    COUPONS: [],
    couponsLoading: false,
    loadCoupons: vi.fn().mockResolvedValue([]),
    bumps: [],
    createBump: vi.fn().mockResolvedValue(undefined),
    openCheckoutEditor: vi.fn(),
    setModal: vi.fn(),
    copied: null,
    cp: vi.fn(),
    flashActionFeedback: vi.fn(),
    router: {} as ProductNerveCenterContextValue['router'],
    ...overrides,
  };

  return context;
}

describe('ProductNerveCenterCuponsTab', () => {
  it('keeps the empty coupon guidance focused on coupon creation', () => {
    render(
      <ProductNerveCenterProvider value={buildContext()}>
        <ProductNerveCenterCuponsTab
          primaryPlanId={null}
          primaryCheckoutConfig={{}}
          onDeleteCoupon={vi.fn().mockResolvedValue(undefined)}
        />
      </ProductNerveCenterProvider>,
    );

    expect(screen.getByText('Cupom de recuperação')).toBeTruthy();
    expect(screen.getByText(/Crie um cupom para liberar descontos/)).toBeTruthy();
    expect(screen.queryByText(/Crie um checkout/)).toBeNull();
  });
});
