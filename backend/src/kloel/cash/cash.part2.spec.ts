import type { CashEntry, CashPosition, PayablesProjection, ReceivablesProjection, RiskDetection, RiskInput, RunwayCalculation, VolatilityTracking } from './types';

import { CashPositionTracker } from './cash-position.tracker';
import { ReceivablesProjector } from './receivables.projector';
import { PayablesProjector } from './payables.projector';
import { RunwayCalculator } from './runway.calculator';
import { RiskDetector } from './risk.detector';
import { VolatilityTracker } from './volatility.tracker';
import { ProtectiveActionSuggester } from './protective-action.suggester';
import { UnsafeOperationBlocker } from './unsafe-operation.blocker';

import { sumAmounts, standardDeviation, entriesByCategory, entriesForWorkspace, entriesInWindow } from './types';

const NOW = Date.parse('2026-05-14T12:00:00.000Z');
const WKS = 'wks_cash_test';

function iso(offsetDays: number): string {
  return new Date(NOW + offsetDays * 24 * 60 * 60 * 1000).toISOString();
}

function entry(over?: Partial<CashEntry>): CashEntry {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    amountCents: over?.amountCents ?? 0n,
    entryDate: over?.entryDate ?? iso(0),
    category: over?.category ?? 'actual',
    confidence: over?.confidence ?? 1.0,
    source: over?.source ?? 'test',
  };
}

function makePosition(over?: Partial<CashPosition>): CashPosition {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    currentBalanceCents: over?.currentBalanceCents ?? 0n,
    trend7d: over?.trend7d ?? 0,
    trend14d: over?.trend14d ?? 0,
    trend30d: over?.trend30d ?? 0,
    minBalance7d: over?.minBalance7d ?? 0n,
    maxBalance7d: over?.maxBalance7d ?? 0n,
    projectedBalance30d: over?.projectedBalance30d ?? 0n,
    calculatedAt: over?.calculatedAt ?? iso(0),
  };
}

function makeReceivables(over?: Partial<ReceivablesProjection>): ReceivablesProjection {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    totalExpectedCents: over?.totalExpectedCents ?? 0n,
    dueNext7d: over?.dueNext7d ?? 0n,
    dueNext14d: over?.dueNext14d ?? 0n,
    dueNext30d: over?.dueNext30d ?? 0n,
    confidence: over?.confidence ?? 1.0,
    projectedAt: over?.projectedAt ?? iso(0),
  };
}

function makePayables(over?: Partial<PayablesProjection>): PayablesProjection {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    totalExpectedCents: over?.totalExpectedCents ?? 0n,
    dueNext7d: over?.dueNext7d ?? 0n,
    dueNext14d: over?.dueNext14d ?? 0n,
    dueNext30d: over?.dueNext30d ?? 0n,
    confidence: over?.confidence ?? 1.0,
    projectedAt: over?.projectedAt ?? iso(0),
  };
}

function makeRunway(over?: Partial<RunwayCalculation>): RunwayCalculation {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    runwayDays: over?.runwayDays ?? 90,
    burnRateDailyCents: over?.burnRateDailyCents ?? 1000,
    marginOfSafety: over?.marginOfSafety ?? 3.0,
    runwayDate: over?.runwayDate ?? iso(90),
    calculatedAt: over?.calculatedAt ?? iso(0),
  };
}

function makeVolatility(over?: Partial<VolatilityTracking>): VolatilityTracking {
  return {
    workspaceId: over?.workspaceId ?? WKS,
    dailyVolatility: over?.dailyVolatility ?? 0.1,
    weeklyVolatility: over?.weeklyVolatility ?? 0.08,
    monthlyVolatility: over?.monthlyVolatility ?? 0.05,
    trend: over?.trend ?? ('stable' as const),
    trackedAt: over?.trackedAt ?? iso(0),
  };
}

// =========================================================================
// CASH-001 — CashPositionTracker
// =========================================================================
describe('CASH-006 — VolatilityTracker', () => {
  const vt = new VolatilityTracker();

  it('tracks volatility from actual entries', () => {
    const entries: CashEntry[] = [
      entry({ amountCents: 1000n, entryDate: iso(-10) }),
      entry({ amountCents: -500n, entryDate: iso(-9) }),
      entry({ amountCents: 2000n, entryDate: iso(-7) }),
      entry({ amountCents: -100n, entryDate: iso(-5) }),
      entry({ amountCents: 1500n, entryDate: iso(-3) }),
      entry({ amountCents: -800n, entryDate: iso(-1) }),
    ];
    const v = vt.track(entries, WKS, NOW);
    expect(v.dailyVolatility).toBeGreaterThan(0);
    expect(v.trackedAt).toBeDefined();
  });

  it('returns zero volatility for single entry', () => {
    const entries: CashEntry[] = [entry({ amountCents: 1000n })];
    const v = vt.track(entries, WKS, NOW);
    expect(v.dailyVolatility).toBe(0);
  });

  it('returns zero volatility for empty entries', () => {
    const v = vt.track([], WKS, NOW);
    expect(v.dailyVolatility).toBe(0);
    expect(v.trend).toBe('stable');
  });
});

// =========================================================================
// CASH-007 — ProtectiveActionSuggester
// =========================================================================
describe('CASH-007 — ProtectiveActionSuggester', () => {
  const suggester = new ProtectiveActionSuggester();

  it('suggests emergency fund for critical runway', () => {
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: true,
      riskLevel: 'critical',
      triggers: ['runway_critical_10.0d'],
      detectedAt: iso(0),
    };
    const actions = suggester.suggest(risk);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0]?.kind).toBe('emergency_fund');
    expect(actions[0]?.urgency).toBe('now');
  });

  it('suggests reduce burn for high runway', () => {
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: true,
      riskLevel: 'high',
      triggers: ['runway_high_25.0d'],
      detectedAt: iso(0),
    };
    const actions = suggester.suggest(risk);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0]?.kind).toBe('reduce_burn');
  });

  it('suggests freeze spending for critical trend', () => {
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: true,
      riskLevel: 'critical',
      triggers: ['trend_30d_critical_-35.0pct'],
      detectedAt: iso(0),
    };
    const actions = suggester.suggest(risk);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0]?.kind).toBe('freeze_spending');
  });

  it('prioritizes actions by urgency', () => {
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: true,
      riskLevel: 'high',
      triggers: ['runway_high_25.0d', 'runway_medium_50.0d'],
      detectedAt: iso(0),
    };
    const actions = suggester.suggest(risk);
    const prioritized = suggester.prioritize(actions);
    expect(prioritized[0]?.urgency).toBe('now');
  });

  it('returns empty for no triggers', () => {
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: false,
      riskLevel: 'none',
      triggers: [],
      detectedAt: iso(0),
    };
    const actions = suggester.suggest(risk);
    expect(actions).toHaveLength(0);
  });
});

// =========================================================================
// CASH-008 — UnsafeOperationBlocker
// =========================================================================
describe('CASH-008 — UnsafeOperationBlocker', () => {
  const blocker = new UnsafeOperationBlocker();

  it('blocks operation exceeding balance', () => {
    const position = makePosition({ currentBalanceCents: 10000n });
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: false,
      riskLevel: 'none',
      triggers: [],
      detectedAt: iso(0),
    };
    const runway = makeRunway({ runwayDays: 90 });
    const result = blocker.block('spend', 15000n, position, risk, runway);
    expect(result.blocked).toBe(true);
    expect(result.blockerKind).toBe('insufficient_balance');
  });

  it('blocks operation when runway is critical', () => {
    const position = makePosition({ currentBalanceCents: 1000000n });
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: true,
      riskLevel: 'medium',
      triggers: [],
      detectedAt: iso(0),
    };
    const runway = makeRunway({ runwayDays: 5 });
    const result = blocker.block('spend', 100n, position, risk, runway);
    expect(result.blocked).toBe(true);
    expect(result.blockerKind).toBe('runway_critical');
  });

  it('blocks operation when risk is critical', () => {
    const position = makePosition({ currentBalanceCents: 1000000n });
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: true,
      riskLevel: 'critical',
      triggers: [],
      detectedAt: iso(0),
    };
    const runway = makeRunway({ runwayDays: 90 });
    const result = blocker.block('spend', 100n, position, risk, runway);
    expect(result.blocked).toBe(true);
    expect(result.blockerKind).toBe('risk_critical');
  });

  it('allows safe operation', () => {
    const position = makePosition({ currentBalanceCents: 1000000n });
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: false,
      riskLevel: 'none',
      triggers: [],
      detectedAt: iso(0),
    };
    const runway = makeRunway({ runwayDays: 90 });
    const result = blocker.block('spend', 100n, position, risk, runway);
    expect(result.blocked).toBe(false);
  });

  it('blocks breach of safety buffer', () => {
    const position = makePosition({ currentBalanceCents: 200000n, minBalance7d: 50000n });
    const risk: RiskDetection = {
      workspaceId: WKS,
      riskDetected: false,
      riskLevel: 'none',
      triggers: [],
      detectedAt: iso(0),
    };
    const runway = makeRunway({ runwayDays: 90 });
    const result = blocker.block('large_spend', 180000n, position, risk, runway);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('safety buffer');
  });
});

// =========================================================================
// Utility functions
// =========================================================================
describe('Cash utility functions', () => {
  it('sumAmounts sums positive and negative correctly', () => {
    const entries: CashEntry[] = [
      entry({ amountCents: 10000n }),
      entry({ amountCents: -3000n }),
      entry({ amountCents: 5000n }),
    ];
    expect(sumAmounts(entries)).toBe(12000n);
  });

  it('standardDeviation computes correct value', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const sd = standardDeviation(values);
    expect(sd).toBeCloseTo(2.138, 2);
  });

  it('standardDeviation returns 0 for single value', () => {
    expect(standardDeviation([5])).toBe(0);
  });

  it('entriesByCategory filters correctly', () => {
    const entries: CashEntry[] = [
      entry({ category: 'actual', amountCents: 100n }),
      entry({ category: 'projected_receivable', amountCents: 200n }),
    ];
    const actuals = entriesByCategory(entries, 'actual');
    expect(actuals).toHaveLength(1);
    expect(actuals[0]?.amountCents).toBe(100n);
  });

  it('entriesInWindow filters by date range', () => {
    const entries: CashEntry[] = [
      entry({ entryDate: iso(-2) }),
      entry({ entryDate: iso(-1) }),
      entry({ entryDate: iso(-10) }),
    ];
    const windowed = entriesInWindow(entries, 4, NOW);
    expect(windowed).toHaveLength(2);
  });

  it('entriesForWorkspace isolates workspaces', () => {
    const entries: CashEntry[] = [
      entry({ workspaceId: 'w1', amountCents: 100n }),
      entry({ workspaceId: 'w2', amountCents: 200n }),
    ];
    const w1 = entriesForWorkspace(entries, 'w1');
    expect(w1).toHaveLength(1);
    expect(w1[0]?.amountCents).toBe(100n);
  });
});
