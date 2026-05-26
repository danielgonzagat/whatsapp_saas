import { describe, expect, it } from 'vitest';
import { normalizePublicCheckoutResponse } from '../public-checkout';

type Payload = Record<string, unknown>;

function basePayload(overrides: Payload = {}): Payload {
  return {
    id: 'plan_1',
    name: 'Plano 1',
    slug: 'plano-1',
    priceInCents: 19900,
    product: { id: 'prod_1', name: 'Produto 1' },
    ...overrides,
  };
}

function normalize(overrides: Payload = {}) {
  return normalizePublicCheckoutResponse(basePayload(overrides));
}

function normalizeConfig(checkoutConfig: Payload) {
  return normalize({ checkoutConfig }).checkoutConfig;
}

function expectConfigFields(config: unknown, expected: Payload) {
  expect(config as Payload).toMatchObject(expected);
}

describe('normalizePublicCheckoutResponse', () => {
  it('normalizes a minimal public checkout payload into safe defaults', () => {
    const payload = normalizePublicCheckoutResponse(
      basePayload({ priceInCents: '19900', checkoutConfig: {} }),
    );

    expect(payload.id).toBe('plan_1');
    expect(payload.priceInCents).toBe(19900);
    expect(payload.product.images).toEqual([]);
    expect(payload.checkoutConfig?.theme).toBe('BLANC');
    expect(payload.checkoutConfig?.brandName).toBe('Produto 1');
  });

  it('preserves public checkout metadata and payment method flags', () => {
    const payload = normalize({
      checkoutCode: 'AB12CD34',
      product: { id: 'prod_1', name: 'Produto 1', images: ['https://cdn.kloel.com/a.png'] },
      merchant: { companyName: 'Coreamy Labs' },
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

  it('never publishes fake stock counters from checkout urgency config', () => {
    const config = normalizeConfig({
      enableTimer: true,
      timerType: 'fixed',
      timerMinutes: '12',
      timerMessage: 'Oferta encerra em:',
      showStockCounter: true,
      stockMessage: 'Apenas {count} unidades restantes',
      fakeStockCount: '7',
    });

    expectConfigFields(config, {
      enableTimer: true,
      timerType: 'EXPIRATION',
      timerMinutes: 12,
      showStockCounter: false,
      fakeStockCount: 0,
    });
    expect(config?.stockMessage).toBeUndefined();
  });

  it.each([
    ['null input', null, /inválido/i],
    ['string input', 'string', /inválido/i],
    ['array input', [], /inválido/i],
    ['missing id', { name: 'Plano 1', slug: 'plano-1', product: { id: 'prod_1', name: 'Produto 1' } }, /id/i],
    ['missing product', { id: 'plan_1', name: 'Plano 1', slug: 'plano-1' }, /produto/i],
    ['null product', basePayload({ product: null }), /produto/i],
  ])('rejects %s', (_label, input, message) => {
    expect(() => normalizePublicCheckoutResponse(input)).toThrow(message);
  });

  it('normalizes optional root fields and scalar fallbacks', () => {
    const explicit = normalize({
      compareAtPrice: 29900,
      currency: 'BRL',
      maxInstallments: 12,
      installmentsFee: true,
      quantity: 3,
      freeShipping: false,
      shippingPrice: 1500,
      checkoutCode: 'AB12CD34',
    });
    const fallback = normalize({
      priceInCents: 'nope',
      maxInstallments: 'NaN',
      installmentsFee: 'nope',
      freeShipping: 123,
    });

    expect(explicit).toMatchObject({
      compareAtPrice: 29900,
      currency: 'BRL',
      maxInstallments: 12,
      installmentsFee: true,
      quantity: 3,
      freeShipping: false,
      shippingPrice: 1500,
      checkoutCode: 'AB12CD34',
    });
    expect(fallback.priceInCents).toBe(0);
    expect(fallback.maxInstallments).toBe(1);
    expect(fallback.installmentsFee).toBe(false);
    expect(fallback.freeShipping).toBe(false);
  });

  it('normalizes merchant records and brand fallback order', () => {
    const workspaceBrand = normalize({ merchant: { workspaceName: 'My Workspace' }, checkoutConfig: {} });
    const nullMerchant = normalize({ merchant: null });
    const falsyStrings = normalize({
      merchant: { companyName: 'ACME', brandLogo: '', customDomain: '', cnpj: 0, addressLine: false },
    });

    expect(workspaceBrand.checkoutConfig?.brandName).toBe('My Workspace');
    expect(nullMerchant.merchant).toBeUndefined();
    expect(falsyStrings.merchant?.brandLogo).toBeNull();
    expect(falsyStrings.merchant?.customDomain).toBeNull();
    expect(falsyStrings.merchant?.cnpj).toBeNull();
    expect(falsyStrings.merchant?.addressLine).toBeNull();
  });

  it('returns undefined checkout config when config record is null', () => {
    expect(normalize({ checkoutConfig: null }).checkoutConfig).toBeUndefined();
  });

  it('preserves explicit false booleans in checkout config', () => {
    const fields = [
      'requireCPF',
      'requirePhone',
      'enableCreditCard',
      'enablePix',
      'enableBoleto',
      'enableCoupon',
      'showCouponPopup',
      'enableTimer',
      'showStockCounter',
      'affiliateCustomCommissionEnabled',
      'enableExitIntent',
      'enableFloatingBar',
      'enableTestimonials',
      'enableGuarantee',
      'enableTrustBadges',
      'showPaymentIcons',
    ];
    const config = normalizeConfig(Object.fromEntries(fields.map((field) => [field, false])));

    for (const field of fields) {
      expect((config as Payload)[field]).toBe(false);
    }
  });

  it.each([
    ['countdown', 'COUNTDOWN'],
    ['evergreen', 'COUNTDOWN'],
    ['unknown', undefined],
  ])('normalizes timer type %s', (timerType, expected) => {
    expect(normalizeConfig({ timerType })?.timerType).toBe(expected);
  });

  it.each([
    ['VARIABLE', 'VARIABLE'],
    ['FIXED', 'FIXED'],
    ['FREE', 'FREE'],
    ['BLAH', undefined],
  ])('normalizes shipping mode %s', (shippingMode, expected) => {
    expect(normalizeConfig({ shippingMode })?.shippingMode).toBe(expected);
  });

  it.each([
    ['AMOUNT', 'AMOUNT'],
    ['PERCENT', 'PERCENT'],
    ['NOPE', undefined],
  ])('normalizes affiliate commission type %s', (affiliateCustomCommissionType, expected) => {
    expect(normalizeConfig({ affiliateCustomCommissionType })?.affiliateCustomCommissionType).toBe(
      expected,
    );
  });

  it('normalizes valid testimonials and filters incomplete entries', () => {
    const config = normalizeConfig({
      testimonials: [
        { name: 'Alice', text: 'Great!', rating: 5 },
        null,
        { name: '', text: 'No name' },
        { name: 'Bob', text: '' },
        { name: 'Carl', text: 'Nice', rating: 4, avatar: 'https://img.com/c.png' },
      ],
    });

    expect(config?.testimonials).toHaveLength(2);
    expect(config?.testimonials?.[0]).toEqual({
      name: 'Alice',
      text: 'Great!',
      rating: 5,
      avatar: undefined,
    });
    expect(config?.testimonials?.[1].avatar).toBe('https://img.com/c.png');
    expect(normalizeConfig({ testimonials: 'not-an-array' })?.testimonials).toBeUndefined();
  });

  it('normalizes valid order bumps and filters incomplete entries', () => {
    const payload = normalize({
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
    expect(payload.orderBumps?.[1]).toMatchObject({
      priceInCents: 1000,
      compareAtPrice: 1500,
      highlightColor: '#ff0000',
      checkboxLabel: 'Add this',
    });
    expect(normalize({ orderBumps: 123 }).orderBumps).toBeUndefined();
  });

  it('normalizes payment provider records', () => {
    const payload = normalize({
      paymentProvider: {
        connected: true,
        checkoutEnabled: false,
        publicKey: '',
        unavailableReason: '   ',
        marketplaceFeePercent: 5,
        installmentInterestMonthlyPercent: 1.5,
        availablePaymentMethodIds: ['card', 'pix'],
        availablePaymentMethodTypes: ['credit_card'],
        supportsCreditCard: true,
        supportsPix: false,
        supportsBoleto: true,
      },
    });

    expect(payload.paymentProvider).toMatchObject({
      provider: 'stripe',
      checkoutEnabled: false,
      publicKey: null,
      unavailableReason: null,
      marketplaceFeePercent: 5,
      installmentInterestMonthlyPercent: 1.5,
      availablePaymentMethodIds: ['card', 'pix'],
      availablePaymentMethodTypes: ['credit_card'],
      supportsCreditCard: true,
      supportsPix: false,
      supportsBoleto: true,
    });
    expect(normalize({ paymentProvider: null }).paymentProvider).toBeUndefined();
  });

  it('normalizes affiliate context records', () => {
    const missing = normalize();
    const explicitNull = normalize({ affiliateContext: null });
    const filled = normalize({
      affiliateContext: {
        affiliateLinkId: 'link_1',
        affiliateWorkspaceId: 'ws_1',
        affiliateProductId: 'prod_1',
        affiliateCode: 'CODE123',
        commissionPct: 10,
      },
    });
    const withoutCommission = normalize({ affiliateContext: { affiliateCode: 'CODE123' } });
    const invalidCommission = normalize({ affiliateContext: { commissionPct: 'invalid' } });

    expect(missing.affiliateContext).toBeNull();
    expect(explicitNull.affiliateContext).toBeNull();
    expect(filled.affiliateContext).toMatchObject({
      affiliateLinkId: 'link_1',
      affiliateWorkspaceId: 'ws_1',
      affiliateProductId: 'prod_1',
      affiliateCode: 'CODE123',
      commissionPct: 10,
    });
    expect(withoutCommission.affiliateContext?.commissionPct).toBeUndefined();
    expect(invalidCommission.affiliateContext?.commissionPct).toBe(0);
  });

  it('normalizes pixels and string arrays', () => {
    const pixels = [
      { id: 'p1', type: 'FACEBOOK', pixelId: 'fb1' },
      null,
      undefined,
      { id: 'p2', type: 'GOOGLE_ADS', pixelId: 'g1' },
    ];
    const config = normalizeConfig({
      pixels,
      trustBadges: ['selo1', '  ', '\t', 'selo2', null, 123, false, 'selo3'],
    });

    expect(config?.pixels).toHaveLength(2);
    expect(config?.pixels?.[0]).toEqual(pixels[0]);
    expect(config?.pixels?.[1]).toEqual(pixels[3]);
    expect(config?.trustBadges).toEqual(['selo1', 'selo2', 'selo3']);
    expect(normalizeConfig({ pixels: 'not-pixels' })?.pixels).toBeUndefined();
  });

  it('normalizes rich checkout config fields', () => {
    const config = normalizeConfig({
      requireCPF: true,
      requirePhone: true,
      phoneLabel: 'WhatsApp',
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
      enableCoupon: true,
      couponPopupDelay: '10',
      couponPopupTitle: 'Cupom!',
      couponPopupDesc: 'Ganhe desconto',
      couponPopupBtnText: 'Pegar',
      couponPopupDismiss: 'Fechar',
      autoCouponCode: 'AUTO10',
      enableExitIntent: true,
      exitIntentTitle: 'Wait!',
      exitIntentDescription: 'Special offer',
      exitIntentCouponCode: 'EXIT10',
      enableFloatingBar: true,
      floatingBarMessage: 'Only 2 left!',
      enableGuarantee: true,
      guaranteeTitle: 'Garantia',
      guaranteeText: '7 dias de garantia',
      guaranteeDays: '7',
      enableTrustBadges: true,
      showPaymentIcons: true,
      footerText: '2024',
      timerPosition: 'top',
      timerExpiredMessage: 'Oferta expirada',
      shippingMode: 'VARIABLE',
      shippingOriginZip: '01310000',
      shippingVariableMinInCents: '1000',
      shippingVariableMaxInCents: '5000',
      shippingUseKloelCalculator: true,
      affiliateCustomCommissionEnabled: true,
      affiliateCustomCommissionType: 'AMOUNT',
      affiliateCustomCommissionAmountInCents: '500',
      affiliateCustomCommissionPercent: '10',
    });

    expectConfigFields(config, {
      requireCPF: true,
      requirePhone: true,
      phoneLabel: 'WhatsApp',
      accentColor: '#ff0000',
      fontBody: 'Inter',
      productDisplayName: 'Produto Especial',
      btnFinalizeText: 'Pagar agora',
      enableCoupon: true,
      couponPopupDelay: 10,
      autoCouponCode: 'AUTO10',
      enableExitIntent: true,
      exitIntentCouponCode: 'EXIT10',
      enableFloatingBar: true,
      floatingBarMessage: 'Only 2 left!',
      enableGuarantee: true,
      guaranteeDays: 7,
      enableTrustBadges: true,
      showPaymentIcons: true,
      shippingMode: 'VARIABLE',
      shippingVariableMinInCents: 1000,
      shippingVariableMaxInCents: 5000,
      shippingUseKloelCalculator: true,
      affiliateCustomCommissionEnabled: true,
      affiliateCustomCommissionType: 'AMOUNT',
      affiliateCustomCommissionAmountInCents: 500,
      affiliateCustomCommissionPercent: 10,
    });
  });

  it('normalizes product optional fields', () => {
    const payload = normalize({
      product: {
        id: 'prod_1',
        name: 'Produto 1',
        description: 'A great product',
        imageUrl: 'https://img.com/p.png',
        images: ['https://img.com/1.png', 'https://img.com/2.png', '', '  '],
        workspaceId: 'ws_1',
      },
    });

    expect(payload.product).toMatchObject({
      description: 'A great product',
      imageUrl: 'https://img.com/p.png',
      images: ['https://img.com/1.png', 'https://img.com/2.png'],
      workspaceId: 'ws_1',
    });
  });

  it('normalizes non-finite values and numeric boundaries', () => {
    const invalid = normalize({
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
      paymentProvider: {
        connected: true,
        checkoutEnabled: true,
        marketplaceFeePercent: 'NaN',
        installmentInterestMonthlyPercent: Infinity,
      },
    });
    const boundary = normalize({
      priceInCents: 0,
      compareAtPrice: 0,
      maxInstallments: 1,
      quantity: 0,
      shippingPrice: 0,
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

    expectConfigFields(invalid.checkoutConfig, {
      couponPopupDelay: 0,
      timerMinutes: 0,
      fakeStockCount: 0,
      shippingVariableMinInCents: 0,
      shippingVariableMaxInCents: 0,
      affiliateCustomCommissionAmountInCents: 0,
      affiliateCustomCommissionPercent: 0,
      guaranteeDays: 0,
    });
    expect(invalid.paymentProvider?.marketplaceFeePercent).toBe(0);
    expect(invalid.paymentProvider?.installmentInterestMonthlyPercent).toBe(0);
    expect(boundary.priceInCents).toBe(0);
    expect(boundary.compareAtPrice).toBe(0);
    expect(boundary.maxInstallments).toBe(1);
    expect(boundary.quantity).toBe(0);
    expect(boundary.shippingPrice).toBe(0);
    expectConfigFields(boundary.checkoutConfig, {
      couponPopupDelay: 0,
      timerMinutes: 0,
      fakeStockCount: 0,
      guaranteeDays: 0,
    });
  });
});
