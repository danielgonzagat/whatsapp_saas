import {
  calculateCheckoutServerTotals,
  calculatePhysicalOrderUnitCount,
  normalizeCheckoutOrderQuantity,
} from './checkout-order-pricing.util';

// PULSE_OK: assertions exist below
describe('checkout-order-pricing.util', () => {
  it('normalizes public order quantity within safe bounds', () => {
    expect(normalizeCheckoutOrderQuantity(undefined)).toBe(1);
    expect(normalizeCheckoutOrderQuantity(0)).toBe(1);
    expect(normalizeCheckoutOrderQuantity(2.2)).toBe(2);
    expect(normalizeCheckoutOrderQuantity(999)).toBe(99);
  });

  it('recalculates checkout totals on the server using plan price, quantity and selected bumps', () => {
    const totals = calculateCheckoutServerTotals({
      planPriceInCents: 42360,
      orderQuantity: 2,
      shippingInCents: 0,
      discountInCents: 1500,
      orderBumps: [
        { id: 'bump-1', priceInCents: 9900 },
        { id: 'bump-2', priceInCents: 4500 },
      ],
      acceptedBumpIds: ['bump-1'],
    });

    expect(totals.orderQuantity).toBe(2);
    expect(totals.subtotalInCents).toBe(84720);
    expect(totals.bumpTotalInCents).toBe(9900);
    expect(totals.discountInCents).toBe(1500);
    expect(totals.totalInCents).toBe(93120);
  });

  it('resolves physical order units from bundle quantity x order quantity', () => {
    expect(calculatePhysicalOrderUnitCount(6, 2)).toBe(12);
    expect(calculatePhysicalOrderUnitCount(undefined, 3)).toBe(3);
  });
});
