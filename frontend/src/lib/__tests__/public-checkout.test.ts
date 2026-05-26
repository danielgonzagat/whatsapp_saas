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

  it('normalizes checkout urgency config without publishing fake stock counters', () => {
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
    expect(payload.checkoutConfig?.showStockCounter).toBe(false);
    expect(payload.checkoutConfig?.stockMessage).toBeUndefined();
    expect(payload.checkoutConfig?.fakeStockCount).toBe(0);
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

  it('rejects null input', () => {
    expect(() => normalizePublicCheckoutResponse(null)).toThrow(/inválido/i);
  });

  it('rejects string input', () => {
    expect(() => normalizePublicCheckoutResponse('string')).toThrow(/inválido/i);
  });

  it('rejects array input', () => {
    expect(() => normalizePublicCheckoutResponse([])).toThrow(/inválido/i);
  });

  it('rejects payload with missing product', () => {
    expect(() =>
      normalizePublicCheckoutResponse({
        id: 'plan_1',
        name: 'Plano 1',
        slug: 'plano-1',
      }),
    ).toThrow(/produto/i);
  });

  it('rejects payload with null product', () => {
    expect(() =>
      normalizePublicCheckoutResponse({
        id: 'plan_1',
        name: 'Plano 1',
        slug: 'plano-1',
        product: null,
      }),
    ).toThrow(/produto/i);
  });

  it('handles optional root fields when explicitly set', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      compareAtPrice: 29900,
      currency: 'BRL',
      maxInstallments: 12,
      installmentsFee: true,
      quantity: 3,
      freeShipping: false,
      shippingPrice: 1500,
      checkoutCode: 'AB12CD34',
      product: { id: 'prod_1', name: 'Produto 1' },
    });

    expect(payload.compareAtPrice).toBe(29900);
    expect(payload.currency).toBe('BRL');
    expect(payload.maxInstallments).toBe(12);
    expect(payload.installmentsFee).toBe(true);
    expect(payload.quantity).toBe(3);
    expect(payload.freeShipping).toBe(false);
    expect(payload.shippingPrice).toBe(1500);
    expect(payload.checkoutCode).toBe('AB12CD34');
  });

  it('normalizes priceInCents from string', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: '29900',
      product: { id: 'prod_1', name: 'Produto 1' },
    });

    expect(payload.priceInCents).toBe(29900);
  });

  it('returns brandName from workspaceName when companyName is missing', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      merchant: { workspaceName: 'My Workspace' },
      checkoutConfig: {},
    });

    expect(payload.checkoutConfig?.brandName).toBe('My Workspace');
  });

  it('returns undefined merchant when merchant record is null', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      merchant: null,
    });

    expect(payload.merchant).toBeUndefined();
  });

  it('converts falsy merchant strings to null', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      merchant: { companyName: 'ACME', brandLogo: '', customDomain: '', cnpj: 0, addressLine: false },
    });

    expect(payload.merchant?.brandLogo).toBeNull();
    expect(payload.merchant?.customDomain).toBeNull();
    expect(payload.merchant?.cnpj).toBeNull();
    expect(payload.merchant?.addressLine).toBeNull();
  });

  it('returns undefined checkoutConfig when config record is null', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: null,
    });

    expect(payload.checkoutConfig).toBeUndefined();
  });

  it('handles boolean config fields explicitly set to false', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        requireCPF: false,
        requirePhone: false,
        enableCreditCard: false,
        enablePix: false,
        enableBoleto: false,
        enableCoupon: false,
        showCouponPopup: false,
        enableTimer: false,
        showStockCounter: false,
        affiliateCustomCommissionEnabled: false,
        enableExitIntent: false,
        enableFloatingBar: false,
        enableTestimonials: false,
        enableGuarantee: false,
        enableTrustBadges: false,
        showPaymentIcons: false,
      },
    });

    expect(payload.checkoutConfig?.requireCPF).toBe(false);
    expect(payload.checkoutConfig?.requirePhone).toBe(false);
    expect(payload.checkoutConfig?.enableCreditCard).toBe(false);
    expect(payload.checkoutConfig?.enablePix).toBe(false);
    expect(payload.checkoutConfig?.enableBoleto).toBe(false);
    expect(payload.checkoutConfig?.enableCoupon).toBe(false);
    expect(payload.checkoutConfig?.showCouponPopup).toBe(false);
    expect(payload.checkoutConfig?.enableTimer).toBe(false);
    expect(payload.checkoutConfig?.showStockCounter).toBe(false);
    expect(payload.checkoutConfig?.affiliateCustomCommissionEnabled).toBe(false);
    expect(payload.checkoutConfig?.enableExitIntent).toBe(false);
    expect(payload.checkoutConfig?.enableFloatingBar).toBe(false);
    expect(payload.checkoutConfig?.enableTestimonials).toBe(false);
    expect(payload.checkoutConfig?.enableGuarantee).toBe(false);
    expect(payload.checkoutConfig?.enableTrustBadges).toBe(false);
    expect(payload.checkoutConfig?.showPaymentIcons).toBe(false);
  });

  it('normalizes timerType COUNTDOWN and EVERGREEN to COUNTDOWN', () => {
    const c = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: { timerType: 'countdown' },
    });
    const e = normalizePublicCheckoutResponse({
      id: 'plan_2',
      name: 'Plano 2',
      slug: 'plano-2',
      priceInCents: 19900,
      product: { id: 'prod_2', name: 'Produto 2' },
      checkoutConfig: { timerType: 'evergreen' },
    });

    expect(c.checkoutConfig?.timerType).toBe('COUNTDOWN');
    expect(e.checkoutConfig?.timerType).toBe('COUNTDOWN');
  });

  it('returns undefined timerType for invalid values', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: { timerType: 'unknown' },
    });

    expect(payload.checkoutConfig?.timerType).toBeUndefined();
  });

  it('handles all shippingMode values', () => {
    const variable = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: { shippingMode: 'VARIABLE' },
    });
    const fixed = normalizePublicCheckoutResponse({
      id: 'plan_2',
      name: 'Plano 2',
      slug: 'plano-2',
      priceInCents: 19900,
      product: { id: 'prod_2', name: 'Produto 2' },
      checkoutConfig: { shippingMode: 'FIXED' },
    });
    const free = normalizePublicCheckoutResponse({
      id: 'plan_3',
      name: 'Plano 3',
      slug: 'plano-3',
      priceInCents: 19900,
      product: { id: 'prod_3', name: 'Produto 3' },
      checkoutConfig: { shippingMode: 'FREE' },
    });
    const unknown = normalizePublicCheckoutResponse({
      id: 'plan_4',
      name: 'Plano 4',
      slug: 'plano-4',
      priceInCents: 19900,
      product: { id: 'prod_4', name: 'Produto 4' },
      checkoutConfig: { shippingMode: 'BLAH' },
    });

    expect(variable.checkoutConfig?.shippingMode).toBe('VARIABLE');
    expect(fixed.checkoutConfig?.shippingMode).toBe('FIXED');
    expect(free.checkoutConfig?.shippingMode).toBe('FREE');
    expect(unknown.checkoutConfig?.shippingMode).toBeUndefined();
  });

  it('handles all affiliateCustomCommissionType values', () => {
    const amount = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: { affiliateCustomCommissionType: 'AMOUNT' },
    });
    const percent = normalizePublicCheckoutResponse({
      id: 'plan_2',
      name: 'Plano 2',
      slug: 'plano-2',
      priceInCents: 19900,
      product: { id: 'prod_2', name: 'Produto 2' },
      checkoutConfig: { affiliateCustomCommissionType: 'PERCENT' },
    });
    const unknown = normalizePublicCheckoutResponse({
      id: 'plan_3',
      name: 'Plano 3',
      slug: 'plano-3',
      priceInCents: 19900,
      product: { id: 'prod_3', name: 'Produto 3' },
      checkoutConfig: { affiliateCustomCommissionType: 'NOPE' },
    });

    expect(amount.checkoutConfig?.affiliateCustomCommissionType).toBe('AMOUNT');
    expect(percent.checkoutConfig?.affiliateCustomCommissionType).toBe('PERCENT');
    expect(unknown.checkoutConfig?.affiliateCustomCommissionType).toBeUndefined();
  });

  it('normalizes valid testimonials and filters null/empty entries', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        testimonials: [
          { name: 'Alice', text: 'Great!', rating: 5 },
          null,
          { name: '', text: 'No name' },
          { name: 'Bob', text: '' },
          { name: 'Carl', text: 'Nice', rating: 4, avatar: 'https://img.com/c.png' },
        ],
      },
    });

    expect(payload.checkoutConfig?.testimonials).toHaveLength(2);
    expect(payload.checkoutConfig?.testimonials?.[0]).toEqual({
      name: 'Alice',
      text: 'Great!',
      rating: 5,
      avatar: undefined,
    });
    expect(payload.checkoutConfig?.testimonials?.[1].avatar).toBe('https://img.com/c.png');
  });

  it('returns undefined testimonials when not an array', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: { testimonials: 'not-an-array' },
    });

    expect(payload.checkoutConfig?.testimonials).toBeUndefined();
  });

  it('normalizes valid order bumps and filters null/empty entries', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      orderBumps: [
        { id: 'bump_1', title: 'Upsell 1', priceInCents: 500 },
        null,
        { id: '', title: 'No id' },
        { id: 'bump_2', title: '' },
        {
          id: 'bump_3',
          title: 'Upsell 3',
          description: 'desc',
          productName: 'pname',
          image: 'https://img.com/b.png',
          priceInCents: 1000,
          compareAtPrice: 1500,
          highlightColor: '#ff0000',
          checkboxLabel: 'Add this',
        },
      ],
    });

    expect(payload.orderBumps).toHaveLength(2);
    expect(payload.orderBumps?.[0]).toEqual({
      id: 'bump_1',
      title: 'Upsell 1',
      description: '',
      productName: '',
      image: undefined,
      priceInCents: 500,
      compareAtPrice: undefined,
      highlightColor: undefined,
      checkboxLabel: undefined,
    });
    expect(payload.orderBumps?.[1].priceInCents).toBe(1000);
    expect(payload.orderBumps?.[1].compareAtPrice).toBe(1500);
    expect(payload.orderBumps?.[1].highlightColor).toBe('#ff0000');
    expect(payload.orderBumps?.[1].checkboxLabel).toBe('Add this');
  });

  it('returns undefined orderBumps when not an array', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      orderBumps: 123,
    });

    expect(payload.orderBumps).toBeUndefined();
  });

  it('returns undefined paymentProvider when provider record is null', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      paymentProvider: null,
    });

    expect(payload.paymentProvider).toBeUndefined();
  });

  it('handles paymentProvider with optional numeric and array fields', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      paymentProvider: {
        connected: true,
        checkoutEnabled: false,
        marketplaceFeePercent: 5,
        installmentInterestMonthlyPercent: 1.5,
        availablePaymentMethodIds: ['card', 'pix'],
        availablePaymentMethodTypes: ['credit_card'],
        supportsCreditCard: true,
        supportsPix: false,
        supportsBoleto: true,
      },
    });

    expect(payload.paymentProvider?.provider).toBe('stripe');
    expect(payload.paymentProvider?.checkoutEnabled).toBe(false);
    expect(payload.paymentProvider?.marketplaceFeePercent).toBe(5);
    expect(payload.paymentProvider?.installmentInterestMonthlyPercent).toBe(1.5);
    expect(payload.paymentProvider?.availablePaymentMethodIds).toEqual(['card', 'pix']);
    expect(payload.paymentProvider?.availablePaymentMethodTypes).toEqual(['credit_card']);
    expect(payload.paymentProvider?.supportsCreditCard).toBe(true);
    expect(payload.paymentProvider?.supportsPix).toBe(false);
    expect(payload.paymentProvider?.supportsBoleto).toBe(true);
  });

  it('returns null affiliateContext when missing', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
    });

    expect(payload.affiliateContext).toBeNull();
  });

  it('returns null affiliateContext when null', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      affiliateContext: null,
    });

    expect(payload.affiliateContext).toBeNull();
  });

  it('handles affiliateContext with commissionPct', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      affiliateContext: {
        affiliateLinkId: 'link_1',
        affiliateWorkspaceId: 'ws_1',
        affiliateProductId: 'prod_1',
        affiliateCode: 'CODE123',
        commissionPct: 10,
      },
    });

    expect(payload.affiliateContext?.affiliateLinkId).toBe('link_1');
    expect(payload.affiliateContext?.affiliateWorkspaceId).toBe('ws_1');
    expect(payload.affiliateContext?.affiliateProductId).toBe('prod_1');
    expect(payload.affiliateContext?.affiliateCode).toBe('CODE123');
    expect(payload.affiliateContext?.commissionPct).toBe(10);
  });

  it('returns undefined pixels when not an array', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: { pixels: 'not-pixels' },
    });

    expect(payload.checkoutConfig?.pixels).toBeUndefined();
  });

  it('filters falsy pixels entries and passes pixel configs through', () => {
    const pixels = [
      { id: 'p1', type: 'FACEBOOK', pixelId: 'fb1' },
      null,
      undefined,
      { id: 'p2', type: 'GOOGLE_ADS', pixelId: 'g1' },
    ];
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: { pixels },
    });

    expect(payload.checkoutConfig?.pixels).toHaveLength(2);
    expect(payload.checkoutConfig?.pixels?.[0]).toEqual(pixels[0]);
    expect(payload.checkoutConfig?.pixels?.[1]).toEqual(pixels[3]);
  });

  it('handles coupon popup fields', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        enableCoupon: true,
        couponPopupDelay: '10',
        couponPopupTitle: 'Cupom!',
        couponPopupDesc: 'Ganhe desconto',
        couponPopupBtnText: 'Pegar',
        couponPopupDismiss: 'Fechar',
        autoCouponCode: 'AUTO10',
      },
    });

    expect(payload.checkoutConfig?.enableCoupon).toBe(true);
    expect(payload.checkoutConfig?.couponPopupDelay).toBe(10);
    expect(payload.checkoutConfig?.couponPopupTitle).toBe('Cupom!');
    expect(payload.checkoutConfig?.couponPopupDesc).toBe('Ganhe desconto');
    expect(payload.checkoutConfig?.couponPopupBtnText).toBe('Pegar');
    expect(payload.checkoutConfig?.couponPopupDismiss).toBe('Fechar');
    expect(payload.checkoutConfig?.autoCouponCode).toBe('AUTO10');
  });

  it('handles exit intent fields', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        enableExitIntent: true,
        exitIntentTitle: 'Wait!',
        exitIntentDescription: 'Special offer',
        exitIntentCouponCode: 'EXIT10',
      },
    });

    expect(payload.checkoutConfig?.enableExitIntent).toBe(true);
    expect(payload.checkoutConfig?.exitIntentTitle).toBe('Wait!');
    expect(payload.checkoutConfig?.exitIntentDescription).toBe('Special offer');
    expect(payload.checkoutConfig?.exitIntentCouponCode).toBe('EXIT10');
  });

  it('handles floating bar fields', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        enableFloatingBar: true,
        floatingBarMessage: 'Only 2 left!',
      },
    });

    expect(payload.checkoutConfig?.enableFloatingBar).toBe(true);
    expect(payload.checkoutConfig?.floatingBarMessage).toBe('Only 2 left!');
  });

  it('handles guarantee fields', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        enableGuarantee: true,
        guaranteeTitle: 'Garantia',
        guaranteeText: '7 dias de garantia',
        guaranteeDays: '7',
      },
    });

    expect(payload.checkoutConfig?.enableGuarantee).toBe(true);
    expect(payload.checkoutConfig?.guaranteeTitle).toBe('Garantia');
    expect(payload.checkoutConfig?.guaranteeText).toBe('7 dias de garantia');
    expect(payload.checkoutConfig?.guaranteeDays).toBe(7);
  });

  it('handles trust badges and show payment icons', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        enableTrustBadges: true,
        trustBadges: ['selo1', 'selo2', '', '  ', 'selo3'],
        showPaymentIcons: true,
        footerText: '© 2024',
      },
    });

    expect(payload.checkoutConfig?.enableTrustBadges).toBe(true);
    expect(payload.checkoutConfig?.trustBadges).toEqual(['selo1', 'selo2', 'selo3']);
    expect(payload.checkoutConfig?.showPaymentIcons).toBe(true);
    expect(payload.checkoutConfig?.footerText).toBe('© 2024');
  });

  it('handles shipping optional fields', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        shippingMode: 'VARIABLE',
        shippingOriginZip: '01310000',
        shippingVariableMinInCents: '1000',
        shippingVariableMaxInCents: '5000',
        shippingUseKloelCalculator: true,
      },
    });

    expect(payload.checkoutConfig?.shippingMode).toBe('VARIABLE');
    expect(payload.checkoutConfig?.shippingOriginZip).toBe('01310000');
    expect(payload.checkoutConfig?.shippingVariableMinInCents).toBe(1000);
    expect(payload.checkoutConfig?.shippingVariableMaxInCents).toBe(5000);
    expect(payload.checkoutConfig?.shippingUseKloelCalculator).toBe(true);
  });

  it('handles affiliate commission numeric fields', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        affiliateCustomCommissionEnabled: true,
        affiliateCustomCommissionType: 'AMOUNT',
        affiliateCustomCommissionAmountInCents: '500',
        affiliateCustomCommissionPercent: '10',
      },
    });

    expect(payload.checkoutConfig?.affiliateCustomCommissionEnabled).toBe(true);
    expect(payload.checkoutConfig?.affiliateCustomCommissionType).toBe('AMOUNT');
    expect(payload.checkoutConfig?.affiliateCustomCommissionAmountInCents).toBe(500);
    expect(payload.checkoutConfig?.affiliateCustomCommissionPercent).toBe(10);
  });

  it('handles requireCPF, requirePhone, and phoneLabel', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        requireCPF: true,
        requirePhone: true,
        phoneLabel: 'WhatsApp',
      },
    });

    expect(payload.checkoutConfig?.requireCPF).toBe(true);
    expect(payload.checkoutConfig?.requirePhone).toBe(true);
    expect(payload.checkoutConfig?.phoneLabel).toBe('WhatsApp');
  });

  it('handles theme styling and display strings', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        accentColor: '#ff0000',
        accentColor2: '#00ff00',
        backgroundColor: '#000000',
        cardColor: '#ffffff',
        textColor: '#333333',
        mutedTextColor: '#999999',
        fontBody: 'Inter',
        fontDisplay: 'Poppins',
        brandLogo: 'https://logo.com/logo.png',
        headerMessage: 'Bem-vindo',
        headerSubMessage: 'Aproveite a oferta',
        productImage: 'https://img.com/p.png',
        productDisplayName: 'Produto Especial',
        btnStep1Text: 'Próximo',
        btnStep2Text: 'Revisar',
        btnFinalizeText: 'Pagar agora',
        btnFinalizeIcon: 'lock',
        timerPosition: 'top',
        timerExpiredMessage: 'Oferta expirada',
      },
    });

    expect(payload.checkoutConfig?.accentColor).toBe('#ff0000');
    expect(payload.checkoutConfig?.accentColor2).toBe('#00ff00');
    expect(payload.checkoutConfig?.backgroundColor).toBe('#000000');
    expect(payload.checkoutConfig?.cardColor).toBe('#ffffff');
    expect(payload.checkoutConfig?.textColor).toBe('#333333');
    expect(payload.checkoutConfig?.mutedTextColor).toBe('#999999');
    expect(payload.checkoutConfig?.fontBody).toBe('Inter');
    expect(payload.checkoutConfig?.fontDisplay).toBe('Poppins');
    expect(payload.checkoutConfig?.brandLogo).toBe('https://logo.com/logo.png');
    expect(payload.checkoutConfig?.headerMessage).toBe('Bem-vindo');
    expect(payload.checkoutConfig?.headerSubMessage).toBe('Aproveite a oferta');
    expect(payload.checkoutConfig?.productImage).toBe('https://img.com/p.png');
    expect(payload.checkoutConfig?.productDisplayName).toBe('Produto Especial');
    expect(payload.checkoutConfig?.btnStep1Text).toBe('Próximo');
    expect(payload.checkoutConfig?.btnStep2Text).toBe('Revisar');
    expect(payload.checkoutConfig?.btnFinalizeText).toBe('Pagar agora');
    expect(payload.checkoutConfig?.btnFinalizeIcon).toBe('lock');
    expect(payload.checkoutConfig?.timerPosition).toBe('top');
    expect(payload.checkoutConfig?.timerExpiredMessage).toBe('Oferta expirada');
  });

  it('handles product with optional fields', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: {
        id: 'prod_1',
        name: 'Produto 1',
        description: 'A great product',
        imageUrl: 'https://img.com/p.png',
        images: ['https://img.com/1.png', 'https://img.com/2.png', '', '  '],
        workspaceId: 'ws_1',
      },
    });

    expect(payload.product.id).toBe('prod_1');
    expect(payload.product.name).toBe('Produto 1');
    expect(payload.product.description).toBe('A great product');
    expect(payload.product.imageUrl).toBe('https://img.com/p.png');
    expect(payload.product.images).toEqual(['https://img.com/1.png', 'https://img.com/2.png']);
    expect(payload.product.workspaceId).toBe('ws_1');
  });

  it('filters empty and whitespace strings from string arrays', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        trustBadges: ['', '  ', '\t', 'valid', null, 123, false, 'also-valid'],
      },
    });

    expect(payload.checkoutConfig?.trustBadges).toEqual(['valid', 'also-valid']);
  });

  it('handles paymentProvider with falsy publicKey and unavailableReason', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      paymentProvider: {
        connected: true,
        checkoutEnabled: true,
        publicKey: '',
        unavailableReason: '   ',
      },
    });

    expect(payload.paymentProvider?.publicKey).toBeNull();
    expect(payload.paymentProvider?.unavailableReason).toBeNull();
  });

  it('falls back to 0 for non-finite number values', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 'nope',
      maxInstallments: 'NaN',
      product: { id: 'prod_1', name: 'Produto 1' },
    });

    expect(payload.priceInCents).toBe(0);
    expect(payload.maxInstallments).toBe(1);
  });

  it('falls back to false for non-boolean values passed to asBoolean', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      installmentsFee: 'nope',
      freeShipping: 123,
      product: { id: 'prod_1', name: 'Produto 1' },
    });

    expect(payload.installmentsFee).toBe(false);
    expect(payload.freeShipping).toBe(false);
  });

  it('returns undefined commissionPct when affiliateContext present but field missing', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      affiliateContext: {
        affiliateCode: 'CODE123',
      },
    });

    expect(payload.affiliateContext?.affiliateCode).toBe('CODE123');
    expect(payload.affiliateContext?.commissionPct).toBeUndefined();
  });

  it('falls back to 0 for non-finite commissionPct in affiliateContext', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      affiliateContext: {
        commissionPct: 'invalid',
      },
    });

    expect(payload.affiliateContext?.commissionPct).toBe(0);
  });

  it('handles non-finite numeric shipping and affiliate config fields', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        couponPopupDelay: 'NaN',
        timerMinutes: Infinity,
        fakeStockCount: 'nope',
        shippingVariableMinInCents: null,
        shippingVariableMaxInCents: 'NaN',
        affiliateCustomCommissionAmountInCents: 'abc',
        affiliateCustomCommissionPercent: -Infinity,
        guaranteeDays: {},
      },
    });

    expect(payload.checkoutConfig?.couponPopupDelay).toBe(0);
    expect(payload.checkoutConfig?.timerMinutes).toBe(0);
    expect(payload.checkoutConfig?.fakeStockCount).toBe(0);
    expect(payload.checkoutConfig?.shippingVariableMinInCents).toBe(0);
    expect(payload.checkoutConfig?.shippingVariableMaxInCents).toBe(0);
    expect(payload.checkoutConfig?.affiliateCustomCommissionAmountInCents).toBe(0);
    expect(payload.checkoutConfig?.affiliateCustomCommissionPercent).toBe(0);
    expect(payload.checkoutConfig?.guaranteeDays).toBe(0);
  });

  it('handles non-finite values in paymentProvider optional numerics', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 19900,
      product: { id: 'prod_1', name: 'Produto 1' },
      paymentProvider: {
        connected: true,
        checkoutEnabled: true,
        marketplaceFeePercent: 'NaN',
        installmentInterestMonthlyPercent: Infinity,
      },
    });

    expect(payload.paymentProvider?.marketplaceFeePercent).toBe(0);
    expect(payload.paymentProvider?.installmentInterestMonthlyPercent).toBe(0);
  });

  it('handles negative zero and explicit number-like boundary values', () => {
    const payload = normalizePublicCheckoutResponse({
      id: 'plan_1',
      name: 'Plano 1',
      slug: 'plano-1',
      priceInCents: 0,
      compareAtPrice: 0,
      maxInstallments: 1,
      quantity: 0,
      shippingPrice: 0,
      product: { id: 'prod_1', name: 'Produto 1' },
      checkoutConfig: {
        couponPopupDelay: 0,
        timerMinutes: 0,
        fakeStockCount: 0,
        shippingVariableMinInCents: 0,
        shippingVariableMaxInCents: 0,
        affiliateCustomCommissionAmountInCents: 0,
        affiliateCustomCommissionPercent: 0,
        guaranteeDays: 0,
      },
    });

    expect(payload.priceInCents).toBe(0);
    expect(payload.compareAtPrice).toBe(0);
    expect(payload.maxInstallments).toBe(1);
    expect(payload.quantity).toBe(0);
    expect(payload.shippingPrice).toBe(0);
    expect(payload.checkoutConfig?.couponPopupDelay).toBe(0);
    expect(payload.checkoutConfig?.timerMinutes).toBe(0);
    expect(payload.checkoutConfig?.fakeStockCount).toBe(0);
    expect(payload.checkoutConfig?.guaranteeDays).toBe(0);
  });
});
