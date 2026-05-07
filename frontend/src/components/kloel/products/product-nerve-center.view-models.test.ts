import { describe, expect, it } from 'vitest';
import {
  mapProductEditorCheckouts,
  mapProductEditorPlans,
} from './product-nerve-center.view-models';

// PULSE_OK: assertions exist below
describe('product-nerve-center.view-models', () => {
  it('maps raw plans into stable editor view models', () => {
    const plans = mapProductEditorPlans([
      {
        id: 'plan_123456789',
        name: 'Plano Coreamy',
        referenceCode: 'ab12 cd34',
        priceInCents: 42360,
        quantity: 2,
        salesCount: 7,
        maxInstallments: 12,
        visibleToAffiliates: true,
        freeShipping: true,
        planLinks: [{ id: 'link_1' }],
      },
    ]);

    expect(plans).toEqual([
      expect.objectContaining({
        id: 'plan_123456789',
        name: 'Plano Coreamy',
        referenceCode: 'AB12CD34',
        ref: 'AB12CD34',
        price: 42360,
        qty: 2,
        sales: 7,
        inst: 12,
        vis: true,
        freeShip: true,
        checkoutLinks: [{ id: 'link_1' }],
      }),
    ]);
  });

  it('maps raw checkouts into stable editor view models with payment methods', () => {
    const checkouts = mapProductEditorCheckouts([
      {
        id: 'checkout_123456789',
        name: 'Checkout Noir',
        referenceCode: 'px12ab34',
        salesCount: 14,
        maxInstallments: 6,
        quantity: 1,
        checkoutConfig: {
          enablePix: true,
          enableCreditCard: false,
          enableBoleto: true,
          showCouponPopup: true,
          enableTimer: true,
        },
        checkoutLinks: [{ id: 'plan_link_1' }],
      },
    ]);

    expect(checkouts).toEqual([
      expect.objectContaining({
        id: 'checkout_123456789',
        code: 'PX12AB34',
        referenceCode: 'PX12AB34',
        desc: 'Checkout Noir',
        mt: ['PIX', 'BOLETO'],
        sales: 14,
        installments: 6,
        quantity: 1,
        coupon: true,
        urgency: true,
        popup: true,
        linkedPlans: [{ id: 'plan_link_1' }],
      }),
    ]);
  });
});
