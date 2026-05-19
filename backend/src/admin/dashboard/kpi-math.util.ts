/** Kpi money value shape. */
export interface KpiMoneyValue {
  /** Value property. */
  value: number;
  /** Previous property. */
  previous: number | null;
  /** Delta pct property. */
  deltaPct: number | null;
}

/** Kpi number value shape. */
export interface KpiNumberValue {
  /** Value property. */
  value: number;
  /** Previous property. */
  previous: number | null;
  /** Delta pct property. */
  deltaPct: number | null;
}

function deltaPctFromZeroBaseline(curr: number): number | null {
  return curr === 0 ? 0 : null;
}

/** Delta pct. */
export function deltaPct(curr: number, prev: number | null): number | null {
  if (prev === null) {
    return null;
  }
  if (prev === 0) {
    return deltaPctFromZeroBaseline(curr);
  }
  return ((curr - prev) / prev) * 100;
}

/** Make money kpi. */
export function makeMoneyKpi(curr: number, prev: number | null): KpiMoneyValue {
  return { value: curr, previous: prev, deltaPct: deltaPct(curr, prev) };
}

/** Make number kpi. */
export function makeNumberKpi(curr: number, prev: number | null): KpiNumberValue {
  return { value: curr, previous: prev, deltaPct: deltaPct(curr, prev) };
}

/** Compute approval rate. */
export function computeApprovalRate(approved: number, declined: number): number | null {
  const denom = approved + declined;
  if (denom === 0) {
    return null;
  }
  return approved / denom;
}

/** Compute average ticket. */
export function computeAverageTicket(gmvInCents: number, approvedCount: number): number {
  if (approvedCount === 0) {
    return 0;
  }
  return Math.round(gmvInCents / approvedCount);
}
