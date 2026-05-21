import { GapDetectorService } from './gap-detector.service';
import type {
  GapDetectionInput,
} from './gap-detector.service';
import type {
  RuntimeMetric,
  CapabilityEntry,
  RTierDelta,
} from './evol.types';

/**
 * UTP-EVOL — focused contract spec for the wired GapDetectorService
 * (NestJS provider in evol.module). Verifies the real detection logic
 * for the three independent gap sources and risk aggregation.
 *
 * This file is deliberately additive to evol.spec.ts (which covers the
 * pure-class EVOL-001..010 surface). It exists to keep the wired service
 * regression-tested against real behavior — never to weaken coverage.
 */

const NOW = '2026-05-15T12:00:00.000Z';

function metric(over: Partial<RuntimeMetric> = {}): RuntimeMetric {
  return {
    name: 'payments',
    workspaceId: 'ws-1',
    value: 0.8,
    threshold: 0.2,
    collectedAt: NOW,
    ...over,
  };
}

function capability(over: Partial<CapabilityEntry> = {}): CapabilityEntry {
  return {
    capabilityId: 'cap-1',
    domain: 'wallet',
    declaredTier: 'tier_1_functional',
    evidence: [],
    evidenceScore: 0.1,
    lastVerifiedAt: NOW,
    ...over,
  };
}

function rTierDelta(over: Partial<RTierDelta> = {}): RTierDelta {
  return {
    workspaceId: 'ws-1',
    module: 'checkout',
    previousTier: 'tier_1_functional',
    currentTier: 'tier_4_shell',
    metrics: {},
    changedAt: NOW,
    direction: 'downgraded',
    reason: 'regression',
    ...over,
  };
}

function emptyInput(over: Partial<GapDetectionInput> = {}): GapDetectionInput {
  return {
    runtimeMetrics: [],
    capabilities: [],
    rTierDeltas: [],
    ...over,
  };
}

describe('GapDetectorService (wired evol provider)', () => {
  let svc: GapDetectorService;

  beforeEach(() => {
    svc = new GapDetectorService();
    svc.resetCounter();
  });

  it('UTP-EVOL-006 — detects a gap from a runtime metric above threshold', () => {
    const gaps = svc.detect(
      emptyInput({ runtimeMetrics: [metric({ value: 0.9, threshold: 0.2 })] }),
    );
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.domain).toBe('payments');
    expect(gaps[0]?.estimatedRevenueRiskCents).toBeGreaterThan(0);
    expect(gaps[0]?.truthMode).toBe('observed');
  });

  it('does NOT detect a gap when metric is at or below threshold', () => {
    const gaps = svc.detect(
      emptyInput({ runtimeMetrics: [metric({ value: 0.2, threshold: 0.2 })] }),
    );
    expect(gaps.length).toBe(0);
  });

  it('detects a capability gap when evidence score is below 0.3', () => {
    const gaps = svc.detect(
      emptyInput({ capabilities: [capability({ evidenceScore: 0.1 })] }),
    );
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.estimatedRevenueRiskCents).toBeGreaterThan(0);
  });

  it('detects an R-tier downgrade gap', () => {
    const gaps = svc.detect(
      emptyInput({ rTierDeltas: [rTierDelta({ direction: 'downgraded' })] }),
    );
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.severity).toBe('critical');
  });

  it('ignores an R-tier delta that is not a downgrade', () => {
    const gaps = svc.detect(
      emptyInput({
        rTierDeltas: [rTierDelta({ direction: 'upgraded' })],
      }),
    );
    expect(gaps.length).toBe(0);
  });

  it('UTP-EVOL-015 — returns gaps sorted by revenue risk descending', () => {
    const gaps = svc.detect(
      emptyInput({
        runtimeMetrics: [
          metric({ name: 'payments', value: 0.9 }),
          metric({ name: 'whatsapp', value: 0.9 }),
          metric({ name: 'wallet', value: 0.9 }),
        ],
      }),
    );
    expect(gaps.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i - 1]!.estimatedRevenueRiskCents).toBeGreaterThanOrEqual(
        gaps[i]!.estimatedRevenueRiskCents,
      );
    }
  });

  it('UTP-EVOL-016 — estimateTotalRisk sums all gap risks', () => {
    const gaps = svc.detect(
      emptyInput({
        runtimeMetrics: [
          metric({ name: 'payments', value: 0.9 }),
          metric({ name: 'checkout', value: 0.9 }),
        ],
      }),
    );
    const total = svc.estimateTotalRisk(gaps);
    const manual = gaps.reduce(
      (s, g) => s + g.estimatedRevenueRiskCents,
      0,
    );
    expect(total).toBe(manual);
    expect(total).toBeGreaterThan(0);
  });

  it('UTP-EVOL-017 — detects gaps from all three input sources simultaneously', () => {
    const gaps = svc.detect(
      emptyInput({
        runtimeMetrics: [metric({ value: 0.9 })],
        capabilities: [capability({ evidenceScore: 0.05 })],
        rTierDeltas: [rTierDelta({ direction: 'downgraded' })],
      }),
    );
    expect(gaps.length).toBe(3);
    expect(svc.estimateTotalRisk(gaps)).toBeGreaterThan(0);
  });

  it('returns no gaps for fully empty input', () => {
    expect(svc.detect(emptyInput()).length).toBe(0);
    expect(svc.estimateTotalRisk([])).toBe(0);
  });
});
