import { describe, expect, it } from 'vitest';
import {
  buildCheckoutDisplayCode,
  buildCheckoutLinksForPlan,
  buildPublicCheckoutEntryUrl,
  normalizeCheckoutLinks,
} from '../checkout-links';

describe('checkout-links', () => {
  it('normalizes checkout display codes to 8 uppercase characters', () => {
    expect(buildCheckoutDisplayCode('ab-12 cd34ef')).toBe('AB12CD34');
    expect(buildCheckoutDisplayCode('', 'plan_123456789')).toBe('PLAN_123');
  });

  it('prefers the short checkout code over the slug when the code is valid', () => {
    expect(buildPublicCheckoutEntryUrl('coreamy-pdrn', 'ab12cd34', 'pay.localhost:3000')).toBe(
      'http://pay.localhost:3000/AB12CD34',
    );
  });

  it('falls back to the slug when the short code is invalid', () => {
    expect(buildPublicCheckoutEntryUrl('coreamy-pdrn', 'abc', 'pay.localhost:3000')).toBe(
      'http://pay.localhost:3000/coreamy-pdrn',
    );
  });

  it('normalizes checkout link metadata and payment methods', () => {
    expect(
      normalizeCheckoutLinks([
        {
          id: 'link_1',
          slug: 'checkout-1',
          referenceCode: 'px12-ab34',
          isPrimary: true,
          checkout: {
            id: 'checkout_1',
            name: 'Checkout 1',
            checkoutConfig: {
              enablePix: true,
              enableCreditCard: false,
              enableBoleto: true,
            },
          },
        },
      ]),
    ).toEqual([
      {
        id: 'link_1',
        slug: 'checkout-1',
        referenceCode: 'PX12AB34',
        isPrimary: true,
        isActive: true,
        checkoutName: 'Checkout 1',
        checkoutId: 'checkout_1',
        paymentMethods: ['PIX', 'BOLETO'],
      },
    ]);
  });

  it('builds public URLs for every checkout linked to a plan', () => {
    const links = buildCheckoutLinksForPlan(
      {
        checkoutLinks: [
          {
            id: 'link_1',
            slug: 'checkout-1',
            referenceCode: 'ab12cd34',
            isPrimary: true,
            checkout: { id: 'checkout_1', name: 'Checkout 1', checkoutConfig: {} },
          },
          {
            id: 'link_2',
            slug: 'checkout-2',
            checkout: { id: 'checkout_2', name: 'Checkout 2', checkoutConfig: {} },
          },
        ],
      },
      'pay.localhost:3000',
    );

    expect(links).toMatchObject([
      { id: 'link_1', url: 'http://pay.localhost:3000/AB12CD34' },
      { id: 'link_2', url: 'http://pay.localhost:3000/checkout-2' },
    ]);
  });
});
