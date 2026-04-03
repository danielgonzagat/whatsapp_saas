import { describe, expect, it } from 'vitest';
import { isValidCheckoutCode, isValidCheckoutEntrySegment } from '../subdomains';

describe('checkout entry segment validation', () => {
  it('accepts public checkout codes with 8 characters', () => {
    expect(isValidCheckoutCode('MPX9Q2Z7')).toBe(true);
    expect(isValidCheckoutEntrySegment('MPX9Q2Z7')).toBe(true);
  });

  it('accepts legacy checkout slugs and long reference ids on pay host', () => {
    expect(isValidCheckoutEntrySegment('pdrn-coreamy-1-frasco-coreamy-pdrn-mngndimj')).toBe(true);
    expect(isValidCheckoutEntrySegment('cmngndimq0004onpob5pkbli3')).toBe(true);
  });

  it('rejects unsafe or non-checkout segments', () => {
    expect(isValidCheckoutEntrySegment('')).toBe(false);
    expect(isValidCheckoutEntrySegment('../checkout')).toBe(false);
    expect(isValidCheckoutEntrySegment('checkout.html')).toBe(false);
    expect(isValidCheckoutEntrySegment('/checkout')).toBe(false);
  });
});
