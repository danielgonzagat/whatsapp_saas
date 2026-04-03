import { describe, expect, it } from 'vitest';
import { buildCheckoutPricing } from '../checkout-pricing';

describe('buildCheckoutPricing', () => {
  it('adds 3.99% per extra installment month only for credit card', () => {
    const pricing = buildCheckoutPricing({
      baseTotalInCents: 10000,
      paymentMethod: 'credit',
      installments: 3,
      installmentInterestMonthlyPercent: 3.99,
    });

    expect(pricing.installmentInterestInCents).toBe(798);
    expect(pricing.chargedTotalInCents).toBe(10798);
  });

  it('keeps pix at the base amount', () => {
    const pricing = buildCheckoutPricing({
      baseTotalInCents: 10000,
      paymentMethod: 'pix',
      installments: 12,
      installmentInterestMonthlyPercent: 3.99,
    });

    expect(pricing.installments).toBe(1);
    expect(pricing.installmentInterestInCents).toBe(0);
    expect(pricing.chargedTotalInCents).toBe(10000);
  });
});
