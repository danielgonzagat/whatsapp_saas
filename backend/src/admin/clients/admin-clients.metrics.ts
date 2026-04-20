/** Health score input shape. */
export interface HealthScoreInput {
  /** Gmv last30d in cents property. */
  gmvLast30dInCents: number;
  /** Previous gmv last30d in cents property. */
  previousGmvLast30dInCents: number;
  /** Last sale at property. */
  lastSaleAt: string | null;
  /** Kyc status property. */
  kycStatus: string;
  /** Custom domain property. */
  customDomain: string | null;
  /** Product count property. */
  productCount: number;
}

function growthRateWhenNoPreviousBaseline(current: number): number | null {
  return current > 0 ? null : 0;
}

/** Compute growth rate. */
export function computeGrowthRate(current: number, previous: number): number | null {
  if (previous <= 0) {
    return growthRateWhenNoPreviousBaseline(current);
  }
  return (current - previous) / previous;
}

/** Compute health score. */
export function computeHealthScore(input: HealthScoreInput): number {
  let score = 35;
  if (input.gmvLast30dInCents > 0) {
    score += 25;
  }
  if (input.previousGmvLast30dInCents <= input.gmvLast30dInCents) {
    score += 10;
  }
  if (input.lastSaleAt) {
    score += 10;
  }
  if (input.kycStatus === 'approved') {
    score += 10;
  }
  if (input.customDomain) {
    score += 5;
  }
  if (input.productCount > 0) {
    score += 5;
  }
  return Math.max(0, Math.min(100, score));
}
