// Pure helpers for PlanPaymentTab — kept free of React/SWR/network so they can
// be unit-tested in isolation. The component owns state + effects; these
// functions own the parse/serialize contract.

/**
 * Subset of the plan payment record returned by `GET /products/:id/plans/:planId`
 * that this tab consumes. Loose typing matches the runtime guard pattern used
 * by the original component (`Record<string, unknown>`); each field is
 * optional + validated case-by-case in {@link hydratePlanPaymentState}.
 */
export type PlanPaymentApiRecord = Record<string, unknown>;

export interface PlanPaymentState {
  maxInstallments: string;
  maxNoInterest: string;
  discountByPayment: boolean;
  billingType: string;
  recurringInterval: string;
  trialEnabled: boolean;
  trialDays: string;
  trialPrice: string;
  limitedBilling: boolean;
  affiliateRecurring: boolean;
  boletoInstallment: boolean;
  boletoMaxInstallments: string;
  boletoInterest: boolean;
  creditEnabled: boolean;
  /** Always coerced to `false` — boleto is currently disabled at the stripe layer. */
  boletoEnabled: boolean;
  pixEnabled: boolean;
}

/**
 * Defaults applied when the API record is silent on a field. Centralized so
 * the component initial state and the API hydrator agree.
 */
export const PLAN_PAYMENT_DEFAULTS: PlanPaymentState = {
  maxInstallments: '12',
  maxNoInterest: '3',
  discountByPayment: false,
  billingType: 'ONE_TIME',
  recurringInterval: 'MONTHLY',
  trialEnabled: false,
  trialDays: '7',
  trialPrice: '',
  limitedBilling: false,
  affiliateRecurring: true,
  boletoInstallment: false,
  boletoMaxInstallments: '6',
  boletoInterest: false,
  creditEnabled: true,
  boletoEnabled: false,
  pixEnabled: true,
};

function takeString(value: unknown, fallback: string): string {
  return value == null ? fallback : String(value);
}

function takeBoolean(value: unknown, fallback: boolean): boolean {
  return value == null ? fallback : (value as boolean);
}

/**
 * Parse the API record into a fully-populated {@link PlanPaymentState}.
 * Missing fields fall back to {@link PLAN_PAYMENT_DEFAULTS}. `boletoEnabled`
 * is always coerced to `false` — boleto is disabled at the stripe layer and
 * the UI must not flip it back on regardless of what the backend reports.
 */
export function hydratePlanPaymentState(
  record: PlanPaymentApiRecord | null | undefined,
  defaults: PlanPaymentState = PLAN_PAYMENT_DEFAULTS,
): PlanPaymentState {
  if (!record) {
    return { ...defaults, boletoEnabled: false };
  }
  const pm = record.paymentMethods as Record<string, unknown> | undefined;
  return {
    maxInstallments: takeString(record.maxInstallments, defaults.maxInstallments),
    maxNoInterest: takeString(record.interestFreeInstallments, defaults.maxNoInterest),
    discountByPayment: takeBoolean(record.discountByPayment, defaults.discountByPayment),
    billingType: takeString(record.billingType, defaults.billingType),
    recurringInterval: takeString(record.subscriptionPeriod, defaults.recurringInterval),
    trialEnabled: takeBoolean(record.trialEnabled, defaults.trialEnabled),
    trialDays: takeString(record.trialDays, defaults.trialDays),
    trialPrice: takeString(record.trialPrice, defaults.trialPrice),
    limitedBilling: takeBoolean(record.limitedBilling, defaults.limitedBilling),
    affiliateRecurring: takeBoolean(record.affiliateRecurring, defaults.affiliateRecurring),
    boletoInstallment: takeBoolean(record.boletoInstallment, defaults.boletoInstallment),
    boletoMaxInstallments: takeString(record.boletoInstallments, defaults.boletoMaxInstallments),
    boletoInterest: takeBoolean(record.boletoInterest, defaults.boletoInterest),
    creditEnabled: pm && pm.credit != null ? (pm.credit as boolean) : defaults.creditEnabled,
    boletoEnabled: false,
    pixEnabled: pm && pm.pix != null ? (pm.pix as boolean) : defaults.pixEnabled,
  };
}

export interface PlanPaymentSavePayload {
  maxInstallments: number;
  interestFreeInstallments: number;
  billingType: string;
  subscriptionPeriod: string;
  trialEnabled: boolean;
  trialDays: number;
  paymentMethods: { credit: boolean; boleto: false; pix: boolean };
  boletoEnabled: false;
  notifyBoleto: false;
  boletoInstallments: number;
}

/**
 * Build the PUT body that mirrors the current tab state. Numeric fields are
 * coerced with `Number()`; boleto-related fields are pinned to `false` to
 * match the disabled-at-stripe contract.
 */
export function buildPlanPaymentPayload(state: PlanPaymentState): PlanPaymentSavePayload {
  return {
    maxInstallments: Number(state.maxInstallments),
    interestFreeInstallments: Number(state.maxNoInterest),
    billingType: state.billingType,
    subscriptionPeriod: state.recurringInterval,
    trialEnabled: state.trialEnabled,
    trialDays: Number(state.trialDays),
    paymentMethods: { credit: state.creditEnabled, boleto: false, pix: state.pixEnabled },
    boletoEnabled: false,
    notifyBoleto: false,
    boletoInstallments: Number(state.boletoMaxInstallments),
  };
}

/** SWR cache predicate that matches any /products key. */
export function isProductsSwrKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith('/products');
}
