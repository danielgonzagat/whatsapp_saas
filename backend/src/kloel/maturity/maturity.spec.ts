import type { GoalCandidate } from '../goal-field/goal-field.types';
import type { SpineEventRef } from '../mind/mind.types';
import { collectMaturitySignals } from './maturity-signals.collector';
import { classifyMaturity } from './maturity.classifier';
import { MaturityGoalFilterService } from './maturity-goal-filter.service';
import { detectTransitions } from './maturity.transition-detector';
import { refuse } from './maturity.guard';
import type {
  MaturityStage,
  MaturityVerdict,
  SignalSummary,
} from './maturity.types';

const NOW = Date.parse('2026-05-13T22:00:00.000Z');
const WKS = 'wks_demo';

function ev(over?: Partial<SpineEventRef>): SpineEventRef {
  const defaults: Record<string, unknown> = {
    eventId: over?.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over?.eventName ?? 'commerce.lead.replied',
    workspaceId: over?.workspaceId ?? WKS,
    occurredAt: over?.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over?.truthMode ?? 'observed',
  };
  if (over?.entityRef !== undefined) defaults['entityRef'] = over.entityRef;
  if (over?.valence !== undefined) defaults['valence'] = over.valence;
  if (over?.payload !== undefined) defaults['payload'] = over.payload;
  if (over?.correlationId !== undefined) defaults['correlationId'] = over.correlationId;
  if (over?.eventId) defaults['eventId'] = over.eventId;
  if (over?.eventName) defaults['eventName'] = over.eventName;
  if (over?.occurredAt) defaults['occurredAt'] = over.occurredAt;
  return defaults as SpineEventRef;
}

function gc(over?: Partial<GoalCandidate>): GoalCandidate {
  return {
    goalId: over?.goalId ?? `g_test_${Math.random().toString(36).slice(2, 6)}`,
    summary: over?.summary ?? 'default goal',
    workspaceId: over?.workspaceId ?? WKS,
    emergedAt: over?.emergedAt ?? new Date(NOW).toISOString(),
    impact: over?.impact ?? 0.7,
    viability: over?.viability ?? 0.7,
    risk: over?.risk ?? 0.2,
    score: over?.score ?? 0.39,
    evidenceEventIds: over?.evidenceEventIds ?? [],
    contributingTensions: over?.contributingTensions ?? [],
  };
}

function v(
  stage: MaturityStage,
  confidence: number,
  signals?: Partial<SignalSummary>,
  classifiedAt?: string,
): MaturityVerdict {
  return {
    stage,
    confidence,
    signals: emptySignals(WKS, signals),
    classifiedAt: classifiedAt ?? new Date(NOW).toISOString(),
  };
}

function emptySignals(
  workspaceId: string,
  over?: Partial<SignalSummary>,
): SignalSummary {
  return {
    conversionsPerMonth: over?.conversionsPerMonth ?? 0,
    uniqueLeads: over?.uniqueLeads ?? 0,
    repeatPaymentRate: over?.repeatPaymentRate ?? 0,
    churnRate: over?.churnRate ?? 0,
    productCount: over?.productCount ?? 0,
    campaignCount: over?.campaignCount ?? 0,
    refundRate: over?.refundRate ?? 0,
    dealsClosedRate: over?.dealsClosedRate ?? 0,
    supportToSalesRatio: over?.supportToSalesRatio ?? 0,
    observationWindowDays: over?.observationWindowDays ?? 30,
    workspaceId,
  };
}

// =========================================================================
// UTP-MATURITY-001 — Signals Collector
// =========================================================================
describe('UTP-MATURITY-001 — collectMaturitySignals', () => {
  it('returns zero signals when no events present', () => {
    const s = collectMaturitySignals({
      events: [],
      workspaceId: WKS,
      nowMs: NOW,
    });
    expect(s.conversionsPerMonth).toBe(0);
    expect(s.uniqueLeads).toBe(0);
    expect(s.repeatPaymentRate).toBe(0);
  });

  it('counts conversions and leads from payment and lead events', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.lead.created', entityRef: { entityType: 'lead', entityId: 'l1' } }),
      ev({ eventName: 'commerce.lead.created', entityRef: { entityType: 'lead', entityId: 'l2' } }),
      ev({ eventName: 'commerce.payment.approved' }),
      ev({ eventName: 'commerce.payment.approved' }),
      ev({ eventName: 'commerce.payment.approved' }),
    ];
    const s = collectMaturitySignals({ events, workspaceId: WKS, nowMs: NOW, windowDays: 30 });
    expect(s.uniqueLeads).toBe(2);
    expect(s.conversionsPerMonth).toBe(3);
  });

  it('computes repeat payment rate from unique payer IDs', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', payload: { payerId: 'p1' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { payerId: 'p1' } }),
      ev({ eventName: 'commerce.payment.approved', payload: { payerId: 'p2' } }),
    ];
    const s = collectMaturitySignals({ events, workspaceId: WKS, nowMs: NOW, windowDays: 30 });
    expect(s.repeatPaymentRate).toBe(0.5);
  });

  it('filters events outside the observation window', () => {
    const inside = ev({
      eventName: 'commerce.payment.approved',
      occurredAt: '2026-05-12T00:00:00.000Z',
    });
    const outside = ev({
      eventName: 'commerce.payment.approved',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    const s = collectMaturitySignals({
      events: [inside, outside],
      workspaceId: WKS,
      nowMs: NOW,
      windowDays: 30,
    });
    expect(s.conversionsPerMonth).toBe(1);
  });
});

// =========================================================================
// UTP-MATURITY-002 — Classifier
// =========================================================================
describe('UTP-MATURITY-002 — classifyMaturity', () => {
  it('classifies empty workspace as validacao', () => {
    const s = emptySignals(WKS);
    const r = classifyMaturity(s);
    expect(r.stage).toBe('validacao');
    expect(r.confidence).toBeGreaterThanOrEqual(0.2);
    expect(r.confidence).toBeLessThanOrEqual(0.7);
  });

  it('classifies tracao when thresholds met', () => {
    const s = emptySignals(WKS, {
      conversionsPerMonth: 5,
      uniqueLeads: 10,
      churnRate: 0.3,
      repeatPaymentRate: 0.2,
    });
    const r = classifyMaturity(s);
    expect(r.stage).toBe('tracao');
  });

  it('classifies crescimento when thresholds met', () => {
    const s = emptySignals(WKS, {
      conversionsPerMonth: 25,
      uniqueLeads: 50,
      churnRate: 0.15,
      refundRate: 0.05,
      campaignCount: 3,
      repeatPaymentRate: 0.35,
      dealsClosedRate: 0.55,
    });
    const r = classifyMaturity(s);
    expect(r.stage).toBe('crescimento');
  });

  it('classifies maturidade when thresholds met', () => {
    const s = emptySignals(WKS, {
      conversionsPerMonth: 55,
      uniqueLeads: 80,
      repeatPaymentRate: 0.55,
      churnRate: 0.08,
      refundRate: 0.04,
      productCount: 3,
      campaignCount: 7,
      dealsClosedRate: 0.72,
    });
    const r = classifyMaturity(s);
    expect(r.stage).toBe('maturidade');
  });

  it('classifies otimizacao when all high-end thresholds met', () => {
    const s = emptySignals(WKS, {
      conversionsPerMonth: 100,
      uniqueLeads: 200,
      repeatPaymentRate: 0.72,
      churnRate: 0.03,
      refundRate: 0.01,
      productCount: 5,
      campaignCount: 25,
      dealsClosedRate: 0.88,
    });
    const r = classifyMaturity(s);
    expect(r.stage).toBe('otimizacao');
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

// =========================================================================
// UTP-MATURITY-003 — Goal Filter
// =========================================================================
describe('UTP-MATURITY-003 — MaturityGoalFilterService', () => {
  const svc = new MaturityGoalFilterService();

  it('allows bootstrap goals in validacao stage, filters scale goals', () => {
    const verdict = v('validacao', 0.6);
    const candidates = [
      gc({ summary: 'bootstrap offer' }),
      gc({ summary: 'otimizar campanha de escala' }),
      gc({ summary: 'first sale attempt' }),
    ];
    const r = svc.filterForStage(candidates, verdict);
    expect(r.allowed.map((g) => g.summary)).toEqual([
      'bootstrap offer',
      'first sale attempt',
    ]);
    expect(r.filteredOut).toHaveLength(1);
  });

  it('allows cumulative goals — otimizacao sees everything', () => {
    const verdict = v('otimizacao', 0.9);
    const candidates = [
      gc({ summary: 'bootstrap offer' }),
      gc({ summary: 'conversion campaign' }),
      gc({ summary: 'team automation' }),
      gc({ summary: 'efficiency optimization' }),
      gc({ summary: 'ltv expansion' }),
    ];
    const r = svc.filterForStage(candidates, verdict);
    expect(r.allowed).toHaveLength(5);
    expect(r.filteredOut).toHaveLength(0);
  });

  it('filters out all goals that match no keyword', () => {
    const verdict = v('validacao', 0.5);
    const candidates = [
      gc({ summary: 'something completely unrelated' }),
      gc({ summary: 'xyz abc 123' }),
    ];
    const r = svc.filterForStage(candidates, verdict);
    expect(r.allowed).toHaveLength(0);
    expect(r.filteredOut).toHaveLength(2);
  });
});

// =========================================================================
// UTP-MATURITY-004 — Transition Detector
// =========================================================================
describe('UTP-MATURITY-004 — detectTransitions', () => {
  it('detects no transitions with single verdict', () => {
    const history = [v('validacao', 0.6, {}, '2026-05-01T00:00:00Z')];
    expect(detectTransitions(history)).toHaveLength(0);
  });

  it('detects forward transition validacao → tracao', () => {
    const history = [
      v('validacao', 0.5, { conversionsPerMonth: 1 }, '2026-05-01T00:00:00Z'),
      v('tracao', 0.8, { conversionsPerMonth: 5 }, '2026-05-10T00:00:00Z'),
    ];
    const ts = detectTransitions(history);
    expect(ts).toHaveLength(1);
    expect(ts[0]?.fromStage).toBe('validacao');
    expect(ts[0]?.toStage).toBe('tracao');
  });

  it('skips transitions below confidence threshold', () => {
    const history = [
      v('tracao', 0.9, {}, '2026-05-01T00:00:00Z'),
      v('crescimento', 0.5, {}, '2026-05-10T00:00:00Z'),
    ];
    const ts = detectTransitions(history);
    expect(ts).toHaveLength(0);
  });

  it('detects backwards transition with reduced confidence', () => {
    const history = [
      v('crescimento', 0.9, { conversionsPerMonth: 30 }, '2026-05-01T00:00:00Z'),
      v('tracao', 0.7, { conversionsPerMonth: 3 }, '2026-05-10T00:00:00Z'),
    ];
    const ts = detectTransitions(history);
    expect(ts).toHaveLength(1);
    expect(ts[0]?.fromStage).toBe('crescimento');
    expect(ts[0]?.toStage).toBe('tracao');
    expect(ts[0]?.confidence).toBeLessThanOrEqual(0.5);
  });
});

// =========================================================================
// UTP-MATURITY-005 — Maturity Guard
// =========================================================================
describe('UTP-MATURITY-005 — refuse', () => {
  it('refuses scale goal in validacao stage', () => {
    const goal = gc({ summary: 'scale campaign to all channels' });
    const verdict = v('validacao', 0.6);
    const r = refuse(goal, verdict);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('scale');
  });

  it('refuses portfolio goal in tracao stage', () => {
    const goal = gc({ summary: 'expand portfolio' });
    const verdict = v('tracao', 0.7);
    const r = refuse(goal, verdict);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('portfolio');
  });

  it('allows campaign goal in crescimento stage', () => {
    const goal = gc({ summary: 'run campaign' });
    const verdict = v('crescimento', 0.8);
    const r = refuse(goal, verdict);
    expect(r.ok).toBe(true);
  });

  it('allows earlier-stage bootstrap goal even in otimizacao stage', () => {
    const goal = gc({ summary: 'bootstrap product market fit' });
    const verdict = v('otimizacao', 0.9);
    const r = refuse(goal, verdict);
    expect(r.ok).toBe(true);
  });

  it('blocks ltv goal in validacao stage', () => {
    const goal = gc({ summary: 'optimize ltv across segments' });
    const verdict = v('validacao', 0.5);
    const r = refuse(goal, verdict);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('ltv');
  });
});
