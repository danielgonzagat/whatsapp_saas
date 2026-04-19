import { describe, expect, it } from 'vitest';
import { encodeAppleCheckoutState, parseAppleAuthState } from './apple-auth-state';

describe('apple-auth-state', () => {
  it('round-trips structured checkout Apple state payloads', () => {
    const encoded = encodeAppleCheckoutState({
      flow: 'checkout',
      slug: 'checkout-demo',
      checkoutCode: 'CHK-001',
      deviceFingerprint: 'device-123',
      returnPath: '/checkout-demo?coupon=VIP',
      sourceUrl: 'https://pay.kloel.com/checkout-demo?coupon=VIP',
      refererUrl: 'https://instagram.com/kloel',
    });

    const parsed = parseAppleAuthState(encoded);

    expect(parsed.checkout).toEqual({
      flow: 'checkout',
      slug: 'checkout-demo',
      checkoutCode: 'CHK-001',
      deviceFingerprint: 'device-123',
      returnPath: '/checkout-demo?coupon=VIP',
      sourceUrl: 'https://pay.kloel.com/checkout-demo?coupon=VIP',
      refererUrl: 'https://instagram.com/kloel',
    });
    expect(parsed.nextPath).toBe('/checkout-demo?coupon=VIP');
  });

  it('keeps legacy auth flow state as a simple next path', () => {
    const parsed = parseAppleAuthState('/billing');

    expect(parsed.checkout).toBeNull();
    expect(parsed.nextPath).toBe('/billing');
  });

  it('falls back safely when the structured state payload is malformed', () => {
    const parsed = parseAppleAuthState('checkout:%7Bbad-json', '/');

    expect(parsed.checkout).toBeNull();
    expect(parsed.nextPath).toBe('/');
  });
});
