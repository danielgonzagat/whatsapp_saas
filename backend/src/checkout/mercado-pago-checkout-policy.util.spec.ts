import {
  applyMercadoPagoPublicCheckoutRestrictions,
  getMercadoPagoAffiliateBlockReason,
  MERCADO_PAGO_AFFILIATE_UNAVAILABLE_REASON,
} from './mercado-pago-checkout-policy.util';

describe('mercado-pago-checkout-policy.util', () => {
  it('blocks affiliate checkout on Mercado Pago public payloads', () => {
    expect(
      applyMercadoPagoPublicCheckoutRestrictions(
        {
          provider: 'mercado_pago',
          connected: true,
          checkoutEnabled: true,
          unavailableReason: null,
        },
        { hasAffiliateContext: true },
      ),
    ).toEqual({
      provider: 'mercado_pago',
      connected: true,
      checkoutEnabled: false,
      unavailableReason: MERCADO_PAGO_AFFILIATE_UNAVAILABLE_REASON,
    });
  });

  it('keeps non affiliate checkouts enabled', () => {
    expect(
      applyMercadoPagoPublicCheckoutRestrictions(
        {
          provider: 'mercado_pago',
          connected: true,
          checkoutEnabled: true,
          unavailableReason: null,
        },
        { hasAffiliateContext: false },
      ),
    ).toEqual({
      provider: 'mercado_pago',
      connected: true,
      checkoutEnabled: true,
      unavailableReason: null,
    });
  });

  it('returns the blocking reason only when affiliate context exists', () => {
    expect(getMercadoPagoAffiliateBlockReason({ hasAffiliateContext: true })).toBe(
      MERCADO_PAGO_AFFILIATE_UNAVAILABLE_REASON,
    );
    expect(getMercadoPagoAffiliateBlockReason({ hasAffiliateContext: false })).toBeNull();
  });
});
