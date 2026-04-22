import { buildCheckoutMarketplacePricing } from './checkout-marketplace-pricing.util';

describe('buildCheckoutMarketplacePricing', () => {
  it('keeps the producer on base amount minus 9.9% while interest stays with Kloel', () => {
    const pricing = buildCheckoutMarketplacePricing({
      baseTotalInCents: 10000,
      paymentMethod: 'CREDIT_CARD',
      installments: 3,
      marketplaceFeePercent: 9.9,
      installmentInterestMonthlyPercent: 3.99,
      gatewayFeePercent: 4.99,
    });

    expect(pricing.baseTotalInCents).toBe(10000);
    expect(pricing.installmentInterestInCents).toBe(798);
    expect(pricing.chargedTotalInCents).toBe(10798);
    expect(pricing.marketplaceFeeInCents).toBe(990);
    expect(pricing.marketplaceRetainedInCents).toBe(1249);
    expect(pricing.sellerReceivableInCents).toBe(9010);
  });

  it('does not add installment interest to pix payments', () => {
    const pricing = buildCheckoutMarketplacePricing({
      baseTotalInCents: 10000,
      paymentMethod: 'PIX',
      installments: 12,
      marketplaceFeePercent: 9.9,
      installmentInterestMonthlyPercent: 3.99,
      gatewayFeePercent: 0,
    });

    expect(pricing.installments).toBe(1);
    expect(pricing.installmentInterestInCents).toBe(0);
    expect(pricing.chargedTotalInCents).toBe(10000);
    expect(pricing.marketplaceRetainedInCents).toBe(990);
  });
});
