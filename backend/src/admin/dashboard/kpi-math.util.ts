export interface KpiMoneyValue {
  value: number;
  previous: number | null;
  deltaPct: number | null;
}

export interface KpiNumberValue {
  value: number;
  previous: number | null;
  deltaPct: number | null;
}

function deltaPctFromZeroBaseline(curr: number): number | null {
  return curr === 0 ? 0 : null;
}

export function deltaPct(curr: number, prev: number | null): number | null {
  if (prev === null) {
    return null;
  }
  if (prev === 0) {
    return deltaPctFromZeroBaseline(curr);
  }
  return ((curr - prev) / prev) * 100;
}

export function makeMoneyKpi(curr: number, prev: number | null): KpiMoneyValue {
  return { value: curr, previous: prev, deltaPct: deltaPct(curr, prev) };
}

export function makeNumberKpi(curr: number, prev: number | null): KpiNumberValue {
  return { value: curr, previous: prev, deltaPct: deltaPct(curr, prev) };
}

export function computeApprovalRate(approved: number, declined: number): number | null {
  const denom = approved + declined;
  if (denom === 0) {
    return null;
  }
  return approved / denom;
}

export function computeAverageTicket(gmvInCents: number, approvedCount: number): number {
  if (approvedCount === 0) {
    return 0;
  }
  return Math.round(gmvInCents / approvedCount);
}

const YEARLY_MONTHS = 12;
const WEEKS_PER_MONTH = 4.345;
const DAYS_PER_MONTH = 30.4375;
const QUARTERLY_MONTHS = 3;
const SEMIANNUAL_MONTHS = 6;

/**
 * Multiplier applied to a MONTHLY cents baseline to convert it to the given
 * billing interval's monthly equivalent. Using a dispatch table keeps
 * `normalizeRecurringAmountToMonthlyCents` at CCN 2 (lookup + fallback).
 *
 * Keys are canonical (upper-cased) recurring interval identifiers; aliases
 * (e.g. ANNUAL -> YEARLY semantics) are listed alongside the primary key.
 */
const INTERVAL_TO_MONTHLY_FACTOR: Record<string, number> = {
  YEARLY: 1 / YEARLY_MONTHS,
  ANNUAL: 1 / YEARLY_MONTHS,
  WEEKLY: WEEKS_PER_MONTH,
  DAILY: DAYS_PER_MONTH,
  QUARTERLY: 1 / QUARTERLY_MONTHS,
  SEMIANNUAL: 1 / SEMIANNUAL_MONTHS,
};

export function normalizeRecurringAmountToMonthlyCents(amount: number, interval: string): number {
  const cents = Math.round(amount * 100);
  const factor = INTERVAL_TO_MONTHLY_FACTOR[interval.toUpperCase()];
  return factor === undefined ? cents : Math.round(cents * factor);
}
