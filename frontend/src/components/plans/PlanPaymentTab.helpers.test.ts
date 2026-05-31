import { describe, expect, it } from 'vitest';
import {
  buildPlanPaymentPayload,
  hydratePlanPaymentState,
  isProductsSwrKey,
  PLAN_PAYMENT_DEFAULTS,
  type PlanPaymentState,
} from './PlanPaymentTab.helpers';

describe('hydratePlanPaymentState', () => {
  it('returns defaults with boleto disabled when record is null', () => {
    expect(hydratePlanPaymentState(null)).toEqual({
      ...PLAN_PAYMENT_DEFAULTS,
      boletoEnabled: false,
    });
  });

  it('returns defaults with boleto disabled when record is undefined', () => {
    expect(hydratePlanPaymentState(undefined)).toEqual({
      ...PLAN_PAYMENT_DEFAULTS,
      boletoEnabled: false,
    });
  });

  it('coerces numeric fields to strings', () => {
    const result = hydratePlanPaymentState({
      maxInstallments: 6,
      interestFreeInstallments: 2,
      trialDays: 14,
      trialPrice: 1990,
      boletoInstallments: 8,
    });
    expect(result.maxInstallments).toBe('6');
    expect(result.maxNoInterest).toBe('2');
    expect(result.trialDays).toBe('14');
    expect(result.trialPrice).toBe('1990');
    expect(result.boletoMaxInstallments).toBe('8');
  });

  it('keeps defaults when field is null on the record', () => {
    const result = hydratePlanPaymentState({
      maxInstallments: null,
      interestFreeInstallments: null,
      billingType: null,
    });
    expect(result.maxInstallments).toBe(PLAN_PAYMENT_DEFAULTS.maxInstallments);
    expect(result.maxNoInterest).toBe(PLAN_PAYMENT_DEFAULTS.maxNoInterest);
    expect(result.billingType).toBe(PLAN_PAYMENT_DEFAULTS.billingType);
  });

  it('reads billingType and subscriptionPeriod through', () => {
    const result = hydratePlanPaymentState({
      billingType: 'RECURRING',
      subscriptionPeriod: 'ANNUAL',
    });
    expect(result.billingType).toBe('RECURRING');
    expect(result.recurringInterval).toBe('ANNUAL');
  });

  it('reads boolean flags through without coercion', () => {
    const result = hydratePlanPaymentState({
      discountByPayment: true,
      trialEnabled: true,
      limitedBilling: true,
      affiliateRecurring: false,
      boletoInstallment: true,
      boletoInterest: true,
    });
    expect(result.discountByPayment).toBe(true);
    expect(result.trialEnabled).toBe(true);
    expect(result.limitedBilling).toBe(true);
    expect(result.affiliateRecurring).toBe(false);
    expect(result.boletoInstallment).toBe(true);
    expect(result.boletoInterest).toBe(true);
  });

  it('reads credit + pix flags from nested paymentMethods', () => {
    const result = hydratePlanPaymentState({
      paymentMethods: { credit: false, pix: false },
    });
    expect(result.creditEnabled).toBe(false);
    expect(result.pixEnabled).toBe(false);
  });

  it('falls back to defaults when paymentMethods is absent', () => {
    const result = hydratePlanPaymentState({});
    expect(result.creditEnabled).toBe(PLAN_PAYMENT_DEFAULTS.creditEnabled);
    expect(result.pixEnabled).toBe(PLAN_PAYMENT_DEFAULTS.pixEnabled);
  });

  it('always forces boletoEnabled to false regardless of API input', () => {
    // boleto is disabled at the stripe layer — the UI must never re-enable it.
    const result = hydratePlanPaymentState({
      boletoEnabled: true,
      paymentMethods: { credit: true, boleto: true, pix: true },
    });
    expect(result.boletoEnabled).toBe(false);
  });

  it('respects null paymentMethods.credit and falls back to default', () => {
    const result = hydratePlanPaymentState({
      paymentMethods: { credit: null, pix: null },
    });
    expect(result.creditEnabled).toBe(PLAN_PAYMENT_DEFAULTS.creditEnabled);
    expect(result.pixEnabled).toBe(PLAN_PAYMENT_DEFAULTS.pixEnabled);
  });

  it('accepts an explicit defaults override', () => {
    const result = hydratePlanPaymentState(
      {},
      { ...PLAN_PAYMENT_DEFAULTS, maxInstallments: '24', creditEnabled: false },
    );
    expect(result.maxInstallments).toBe('24');
    expect(result.creditEnabled).toBe(false);
  });
});

describe('buildPlanPaymentPayload', () => {
  const state: PlanPaymentState = {
    maxInstallments: '10',
    maxNoInterest: '4',
    discountByPayment: true,
    billingType: 'RECURRING',
    recurringInterval: 'MONTHLY',
    trialEnabled: true,
    trialDays: '14',
    trialPrice: '0',
    limitedBilling: false,
    affiliateRecurring: true,
    boletoInstallment: false,
    boletoMaxInstallments: '6',
    boletoInterest: false,
    creditEnabled: true,
    boletoEnabled: false,
    pixEnabled: false,
  };

  it('coerces numeric strings to numbers', () => {
    const body = buildPlanPaymentPayload(state);
    expect(body.maxInstallments).toBe(10);
    expect(body.interestFreeInstallments).toBe(4);
    expect(body.trialDays).toBe(14);
    expect(body.boletoInstallments).toBe(6);
  });

  it('forwards billing fields verbatim', () => {
    const body = buildPlanPaymentPayload(state);
    expect(body.billingType).toBe('RECURRING');
    expect(body.subscriptionPeriod).toBe('MONTHLY');
    expect(body.trialEnabled).toBe(true);
  });

  it('always pins boleto-related flags to false', () => {
    const body = buildPlanPaymentPayload({
      ...state,
      boletoEnabled: true,
      boletoInstallment: true,
    });
    expect(body.boletoEnabled).toBe(false);
    expect(body.notifyBoleto).toBe(false);
    expect(body.paymentMethods.boleto).toBe(false);
  });

  it('reflects credit and pix toggles in paymentMethods', () => {
    const body = buildPlanPaymentPayload({
      ...state,
      creditEnabled: false,
      pixEnabled: true,
    });
    expect(body.paymentMethods.credit).toBe(false);
    expect(body.paymentMethods.pix).toBe(true);
  });

  it('coerces empty strings to NaN — caller should guard against blanks', () => {
    // Documents the current behavior: Number('') === 0, Number('abc') === NaN.
    const body = buildPlanPaymentPayload({ ...state, maxInstallments: '' });
    expect(body.maxInstallments).toBe(0);
  });
});

describe('isProductsSwrKey', () => {
  it('matches /products and subpaths', () => {
    expect(isProductsSwrKey('/products')).toBe(true);
    expect(isProductsSwrKey('/products/abc/plans/xyz')).toBe(true);
  });

  it('rejects unrelated keys', () => {
    expect(isProductsSwrKey('/plans')).toBe(false);
    expect(isProductsSwrKey('/checkout')).toBe(false);
    expect(isProductsSwrKey('')).toBe(false);
  });

  it('rejects non-string keys', () => {
    expect(isProductsSwrKey(null)).toBe(false);
    expect(isProductsSwrKey(undefined)).toBe(false);
    expect(isProductsSwrKey(123)).toBe(false);
    expect(isProductsSwrKey({ key: '/products' })).toBe(false);
  });
});

describe('round-trip', () => {
  it('hydrate → build preserves billing identity', () => {
    const hydrated = hydratePlanPaymentState({
      maxInstallments: 8,
      interestFreeInstallments: 2,
      billingType: 'RECURRING',
      subscriptionPeriod: 'QUARTERLY',
      trialEnabled: true,
      trialDays: 30,
      paymentMethods: { credit: true, pix: true },
    });
    const body = buildPlanPaymentPayload(hydrated);
    expect(body.maxInstallments).toBe(8);
    expect(body.interestFreeInstallments).toBe(2);
    expect(body.billingType).toBe('RECURRING');
    expect(body.subscriptionPeriod).toBe('QUARTERLY');
    expect(body.trialEnabled).toBe(true);
    expect(body.trialDays).toBe(30);
    expect(body.paymentMethods).toEqual({ credit: true, boleto: false, pix: true });
  });
});
