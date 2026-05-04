import { describe, expect, it } from 'vitest';
import { normalizePublicCheckoutResponse } from '../public-checkout';

describe('normalizePublicCheckoutResponse', () => {
  it('normalizes a minimal public checkout payload into safe defaults', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: '19900',
      product: {
        id: 'prod_1',
        name: 'Produto 1',
      },
      checkoutConfig: {},
    });

    expect(payload.id).toBe('plan_1');
    expect(payload.priceInCents).toBe(19900);
    expect(payload.product.images).toEqual([]);
    expect(payload.checkoutConfig?.theme).toBe('BLANC');
    expect(payload.checkoutConfig?.brandName).toBe('Produto 1');
  });

  it('preserves public checkout metadata and payment method flags', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      checkoutCode: 'AB12CD34',
      priceInCents: 19900,
      product: {
        id: 'prod_1',
        name: 'Produto 1',
        images: ['https://cdn.kloel.com/a.png'],
      },
      merchant: {
        companyName: 'Coreamy Labs',
      },
      checkoutConfig: {
        theme: 'NOIR',
        brandName: 'Coreamy',
        showCouponPopup: true,
        enableBoleto: true,
      },
      paymentProvider: {
        connected: true,
        checkoutEnabled: true,
        supportsPix: true,
        supportsBoleto: true,
      },
    });

    expect(payload.checkoutCode).toBe('AB12CD34');
    expect(payload.checkoutConfig?.theme).toBe('NOIR');
    expect(payload.checkoutConfig?.showCouponPopup).toBe(true);
    expect(payload.checkoutConfig?.enableBoleto).toBe(true);
    expect(payload.paymentProvider?.supportsPix).toBe(true);
    expect(payload.paymentProvider?.supportsBoleto).toBe(true);
    expect(payload.product.images).toEqual(['https://cdn.kloel.com/a.png']);
  });

  it('normalizes checkout urgency config for the public renderer', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: {
        id: 'prod_1',
        name: 'Produto 1',
      },
      checkoutConfig: {
        enableTimer: true,
        timerType: 'fixed',
        timerMinutes: '12',
        timerMessage: 'Oferta encerra em:',
        showStockCounter: true,
        stockMessage: 'Apenas {count} unidades restantes',
        fakeStockCount: '7',
      },
    });

    expect(payload.checkoutConfig?.enableTimer).toBe(true);
    expect(payload.checkoutConfig?.timerType).toBe('EXPIRATION');
    expect(payload.checkoutConfig?.timerMinutes).toBe(12);
    expect(payload.checkoutConfig?.showStockCounter).toBe(true);
    expect(payload.checkoutConfig?.stockMessage).toBe('Apenas {count} unidades restantes');
    expect(payload.checkoutConfig?.fakeStockCount).toBe(7);
  });

  it('rejects payloads without required identifiers', () => {
    expect(() =>
      normalizePublicCheckoutResponse({
        name: 'Plano 1',
        slug: 'plano-1',
        product: { id: 'prod_1', name: 'Produto 1' },
      }),
    ).toThrow(/id/i);
  });
});
