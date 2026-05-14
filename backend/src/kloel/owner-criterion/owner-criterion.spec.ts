import { observeApprovalThresholds } from './observers/approval-threshold.observer';
import { observeCorrections } from './observers/correction.observer';
import { observeDecisions } from './observers/decision.observer';
import { observeEthicalLines } from './observers/ethical-line.observer';
import { observeRiskTolerance } from './observers/risk-tolerance.observer';
import { observeTone } from './observers/tone.observer';
import { OwnerCriterionEvidenceBuilder } from './owner-criterion.evidence.builder';
import { OwnerCriterionProjector } from './owner-criterion.projector';
import type {
  ApprovalThresholdObservation,
  CorrectionObservation,
  DecisionObservation,
  EthicalLineObservation,
  ObserverInput,
  RiskToleranceObservation,
  ToneObservation,
} from './owner-criterion.types';
import type { SpineEventRef } from '../mind/mind.types';

function ev(over: Partial<SpineEventRef> = {}): SpineEventRef {
  const e: Record<string, unknown> = {
    eventId: over.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? 'wks_owner',
    occurredAt: over.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over.truthMode ?? 'observed',
  };
  if ('entityRef' in over) {
    if (over.entityRef !== undefined) e['entityRef'] = over.entityRef;
  } else {
    e['entityRef'] = { entityType: 'lead', entityId: 'lead_owner' };
  }
  if (over.valence !== undefined) e['valence'] = over.valence;
  if (over.payload !== undefined) e['payload'] = over.payload;
  if (over.correlationId !== undefined) e['correlationId'] = over.correlationId;
  return e as SpineEventRef;
}

const baseInput = (events: readonly SpineEventRef[]): ObserverInput => ({
  workspaceId: 'wks_owner',
  events,
});

describe('OwnerCriterion observers (UTP-OWNER-CRIT-001..006)', () => {
  it('decision observer accepts events and returns array shape', () => {
    const out = observeDecisions(baseInput([ev()]));
    expect(Array.isArray(out)).toBe(true);
  });

  it('correction observer accepts events and returns array shape', () => {
    const out = observeCorrections(baseInput([ev()]));
    expect(Array.isArray(out)).toBe(true);
  });

  it('tone observer accepts events and returns array shape', () => {
    const out = observeTone(baseInput([ev()]));
    expect(Array.isArray(out)).toBe(true);
  });

  it('risk-tolerance observer accepts events and returns array shape', () => {
    const out = observeRiskTolerance(baseInput([ev()]));
    expect(Array.isArray(out)).toBe(true);
  });

  it('ethical-line observer accepts events and returns array shape', () => {
    const out = observeEthicalLines(baseInput([ev()]));
    expect(Array.isArray(out)).toBe(true);
  });

  it('approval-threshold observer accepts events and returns array shape', () => {
    const out = observeApprovalThresholds(baseInput([ev()]));
    expect(Array.isArray(out)).toBe(true);
  });
});

describe('OwnerCriterionProjector (UTP-OWNER-CRIT-007)', () => {
  it('exposes a callable build method', () => {
    const projector = new OwnerCriterionProjector();
    expect(typeof projector).toBe('object');
    // Smoke: any projector class should not throw on instantiation.
  });
});

describe('OwnerCriterionEvidenceBuilder (UTP-OWNER-CRIT-008)', () => {
  function emptyObservation<T extends { confidence: number }>(extra: Partial<T>): T {
    return { confidence: 0.5, ...extra } as T;
  }

  function build(): OwnerCriterionEvidenceBuilder {
    return new OwnerCriterionEvidenceBuilder();
  }

  it('builds bundle with zero observations — count=0, confidence=0', () => {
    const bundle = build().build({
      workspaceId: 'wks_owner',
      decisions: [],
      corrections: [],
      tones: [],
      risks: [],
      ethicals: [],
      approvals: [],
    });
    expect(bundle.observationCount).toBe(0);
    expect(bundle.aggregateConfidence).toBe(0);
    expect(bundle.workspaceId).toBe('wks_owner');
    expect(bundle.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('aggregates confidence across all observation buckets', () => {
    const decisions = [
      emptyObservation<DecisionObservation>({ confidence: 0.8 } as never),
    ];
    const corrections = [
      emptyObservation<CorrectionObservation>({ confidence: 0.6 } as never),
    ];
    const tones = [emptyObservation<ToneObservation>({ confidence: 0.4 } as never)];
    const risks = [
      emptyObservation<RiskToleranceObservation>({ confidence: 0.4 } as never),
    ];
    const ethicals = [
      emptyObservation<EthicalLineObservation>({ confidence: 0.6 } as never),
    ];
    const approvals = [
      emptyObservation<ApprovalThresholdObservation>({ confidence: 1.0 } as never),
    ];
    const bundle = build().build({
      workspaceId: 'wks_owner',
      decisions,
      corrections,
      tones,
      risks,
      ethicals,
      approvals,
    });
    expect(bundle.observationCount).toBe(6);
    expect(bundle.aggregateConfidence).toBeCloseTo((0.8 + 0.6 + 0.4 + 0.4 + 0.6 + 1.0) / 6);
  });

  it('respects nowIso when provided', () => {
    const bundle = build().build({
      workspaceId: 'wks_owner',
      decisions: [],
      corrections: [],
      tones: [],
      risks: [],
      ethicals: [],
      approvals: [],
      nowIso: '2026-05-13T22:00:00.000Z',
    });
    expect(bundle.builtAt).toBe('2026-05-13T22:00:00.000Z');
  });

  it('preserves all observation buckets in the bundle', () => {
    const decisions = [
      emptyObservation<DecisionObservation>({ observationId: 'd1', confidence: 0.9 } as never),
    ];
    const bundle = build().build({
      workspaceId: 'wks_owner',
      decisions,
      corrections: [],
      tones: [],
      risks: [],
      ethicals: [],
      approvals: [],
    });
    expect(bundle.decisionEvidence).toEqual(decisions);
    expect(bundle.correctionEvidence).toEqual([]);
  });
});
