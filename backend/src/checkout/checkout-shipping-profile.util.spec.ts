import {
  buildCheckoutShippingQuote,
  calculateVariableShippingInCents,
  resolveCheckoutShippingProfile,
} from './checkout-shipping-profile.util';

describe('checkout-shipping-profile.util', () => {
  it('resolves free shipping from plan defaults', () => {
    const profile = resolveCheckoutShippingProfile(
      {
        freeShipping: true,
        shippingPrice: 0,
      },
      null,
    );

    expect(profile).toMatchObject({
      mode: 'FREE',
      fixedShippingInCents: 0,
      variableMinInCents: 0,
      variableMaxInCents: 0,
      useKloelCalculator: false,
    });
  });

  it('keeps fixed shipping from the plan when config does not override it', () => {
    const quote = buildCheckoutShippingQuote({
      plan: {
        priceInCents: 19700,
        freeShipping: false,
        shippingPrice: 2490,
      },
      checkoutConfig: null,
      destinationZip: '01310-100',
    });

    expect(quote).toMatchObject({
      mode: 'FIXED',
      priceInCents: 2490,
      method: 'fixed',
      label: 'Frete fixo',
    });
  });

  it('calculates variable shipping inside the configured window', () => {
    const profile = resolveCheckoutShippingProfile(
      {
        priceInCents: 19700,
        freeShipping: false,
        shippingPrice: 0,
      },
      {
        shippingMode: 'VARIABLE',
        shippingOriginZip: '01310-100',
        shippingVariableMinInCents: 1500,
        shippingVariableMaxInCents: 4900,
        shippingUseKloelCalculator: true,
      },
    );

    const priceInCents = calculateVariableShippingInCents({
      profile,
      destinationZip: '69900-200',
      planPriceInCents: 19700,
    });

    expect(priceInCents).toBeGreaterThanOrEqual(1500);
    expect(priceInCents).toBeLessThanOrEqual(4900);
  });

  it('falls back to the configured minimum when variable shipping has no valid destination zip', () => {
    const quote = buildCheckoutShippingQuote({
      plan: {
        priceInCents: 8900,
        freeShipping: false,
        shippingPrice: 0,
      },
      checkoutConfig: {
        shippingMode: 'VARIABLE',
        shippingOriginZip: '01310-100',
        shippingVariableMinInCents: 990,
        shippingVariableMaxInCents: 3990,
        shippingUseKloelCalculator: false,
      },
      destinationZip: '',
    });

    expect(quote).toMatchObject({
      mode: 'VARIABLE',
      priceInCents: 990,
      method: 'variable',
    });
  });
});
