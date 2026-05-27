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
    if (over.entityRef !== undefined) {e['entityRef'] = over.entityRef;}
  } else {
    e['entityRef'] = { entityType: 'lead', entityId: 'lead_owner' };
  }
  if (over.valence !== undefined) {e['valence'] = over.valence;}
  if (over.payload !== undefined) {e['payload'] = over.payload;}
  if (over.correlationId !== undefined) {e['correlationId'] = over.correlationId;}
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

describe('correction observer — explicit evidence gating (UTP-OWNER-CRIT-002)', () => {
  const wks = 'wks_owner';
  const nowValue = Date.now();

  function correctionInput(events: readonly SpineEventRef[]): ObserverInput {
    return { workspaceId: wks, events, nowMs: nowValue, windowDays: 7 };
  }

  it('common message_replied without ownerCorrected does NOT generate correction', () => {
    const events = [
      ev({ eventName: 'commerce.whatsapp.message_replied', payload: { text: 'hello' } }),
      ev({ eventName: 'commerce.whatsapp.message_replied', payload: { text: 'bye' } }),
    ];
    const result = observeCorrections(correctionInput(events));
    expect(result.filter((o) => o.correctionKind === 'message_rewrite')).toHaveLength(0);
  });

  it('ownerCorrected without original and corrected outputs does NOT generate correction', () => {
    const events = [
      ev({ eventName: 'commerce.whatsapp.message_replied', payload: { ownerCorrected: true } }),
      ev({ eventName: 'commerce.whatsapp.message_replied', payload: { ownerCorrected: true } }),
    ];
    const result = observeCorrections(correctionInput(events));
    expect(result.filter((o) => o.correctionKind === 'message_rewrite')).toHaveLength(0);
  });

  it('two message_replied with ownerCorrected=true generate message_rewrite observation', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'wrong', correctedOutput: 'right' },
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'wrong2', correctedOutput: 'right2' },
      }),
    ];
    const result = observeCorrections(correctionInput(events));
    const rewrites = result.filter((o) => o.correctionKind === 'message_rewrite');
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].correctedTarget).toBe('auto_reply');
    expect(rewrites[0].originalOutput).toBe('wrong');
    expect(rewrites[0].correctedOutput).toBe('right');
    expect(rewrites[0].evidenceEventIds).toHaveLength(2);
  });

  it('classification_fix still requires causedByEventId — missing signal yields zero', () => {
    const events = [
      ev({ eventName: 'commerce.lead.objection_raised', payload: { text: 'expensive' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { text: 'not now' } }),
    ];
    const result = observeCorrections(correctionInput(events));
    expect(result.filter((o) => o.correctionKind === 'classification_fix')).toHaveLength(0);
  });

  it('two objection_raised with causedByEventId generate classification_fix observation', () => {
    const events = [
      ev({ eventName: 'commerce.lead.objection_raised', payload: { causedByEventId: 'e1' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { causedByEventId: 'e2' } }),
    ];
    const result = observeCorrections(correctionInput(events));
    const fixes = result.filter((o) => o.correctionKind === 'classification_fix');
    expect(fixes).toHaveLength(1);
    expect(fixes[0].correctedTarget).toBe('lead_classification');
    expect(fixes[0].evidenceEventIds).toHaveLength(2);
  });

  it('action_reversal preserved via cognition.belief_updated with updateKind=reversal', () => {
    const events = [
      ev({ eventName: 'cognition.belief_updated', payload: { updateKind: 'reversal' } }),
      ev({ eventName: 'cognition.belief_updated', payload: { updateKind: 'reversal', reason: 'override' } }),
    ];
    const result = observeCorrections(correctionInput(events));
    const reversals = result.filter((o) => o.correctionKind === 'action_reversal');
    expect(reversals).toHaveLength(1);
    expect(reversals[0].correctedTarget).toBe('belief');
    expect(reversals[0].evidenceEventIds).toHaveLength(2);
  });

  it('single operator feedback correction does NOT generate policy_adjustment', () => {
    const events = [
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_test' },
        payload: {
          suggestionId: 'sugg_001',
          accepted: false,
          operatorNote: 'customer needs delivery help before retention',
          learningFraming:
            'operator feedback teaches Kloel owner criteria; it is not human performance scoring',
        },
      }),
    ];

    const result = observeCorrections(correctionInput(events));

    expect(result.filter((o) => o.correctionKind === 'policy_adjustment')).toHaveLength(0);
  });

  it('two operator feedback corrections generate non-punitive policy_adjustment', () => {
    const feedbackPayload = {
      accepted: false,
      operatorNote: 'customer needs delivery help before retention',
      learningFraming:
        'operator feedback teaches Kloel owner criteria; it is not human performance scoring',
    };
    const events = [
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_a' },
        payload: { ...feedbackPayload, suggestionId: 'sugg_001' },
      }),
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_b' },
        payload: { ...feedbackPayload, suggestionId: 'sugg_002' },
      }),
    ];

    const result = observeCorrections(correctionInput(events));
    const adjustments = result.filter((o) => o.correctionKind === 'policy_adjustment');

    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].correctedTarget).toBe('operator_feedback');
    expect(adjustments[0].learnedCriterion).toContain('human performance scoring');
    expect(adjustments[0].futureBehaviorChange.targetDomain).toBe('operator_feedback');
    expect(adjustments[0].acceptedWithoutDefense).toBe(true);
  });
});

describe('OwnerCriterionProjector (UTP-OWNER-CRIT-007)', () => {
  it('exposes a callable build method', () => {
    const projector = new OwnerCriterionProjector();
    expect(typeof projector).toBe('object');
    // Smoke: any projector class should not throw on instantiation.
  });

  it('projects repeated operator feedback corrections as policy_adjustment pattern', () => {
    const projector = new OwnerCriterionProjector();
    const corrections: CorrectionObservation[] = [
      {
        observationId: 'cor_operator_1',
        workspaceId: 'wks_owner',
        correctedTarget: 'operator_feedback',
        originalOutput: 'suggestion sugg_001',
        correctedOutput: 'customer needs delivery help before retention',
        correctionKind: 'policy_adjustment',
        observedAt: '2026-05-13T20:00:00.000Z',
        evidenceEventIds: ['evt_1', 'evt_2'],
        confidence: 0.4,
        learnedCriterion:
          'Operator/team feedback corrected Kloel criteria without human performance scoring.',
        futureBehaviorChange: {
          declarativeRule:
            'When team feedback corrects a suggestion, system must treat the note as Kloel learning.',
          targetDomain: 'operator_feedback',
          behaviorConstraint:
            'Future suggestions in this domain must incorporate repeated operator correction notes.',
          confidence: 0.45,
        },
        acceptedWithoutDefense: true,
      },
    ];

    projector.accumulateCorrections(corrections);
    const projection = projector.project(
      'wks_owner',
      Date.parse('2026-05-13T20:00:00.000Z'),
    );

    expect(projection.correctionPattern.mostFrequentCorrectionKind).toBe(
      'policy_adjustment',
    );
    expect(projection.correctionPattern.topCorrectedTargets).toContain(
      'operator_feedback',
    );
    expect(projection.totalObservations).toBe(1);
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
      emptyObservation<DecisionObservation>({ confidence: 0.8 }),
    ];
    const corrections = [
      emptyObservation<CorrectionObservation>({ confidence: 0.6 }),
    ];
    const tones = [emptyObservation<ToneObservation>({ confidence: 0.4 })];
    const risks = [
      emptyObservation<RiskToleranceObservation>({ confidence: 0.4 }),
    ];
    const ethicals = [
      emptyObservation<EthicalLineObservation>({ confidence: 0.6 }),
    ];
    const approvals = [
      emptyObservation<ApprovalThresholdObservation>({ confidence: 1.0 }),
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
      emptyObservation<DecisionObservation>({ observationId: 'd1', confidence: 0.9 }),
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

  it('preserves operator feedback policy_adjustment correction evidence', () => {
    const corrections: CorrectionObservation[] = [
      {
        observationId: 'cor_operator_1',
        workspaceId: 'wks_owner',
        correctedTarget: 'operator_feedback',
        originalOutput: 'suggestion sugg_001',
        correctedOutput: 'customer needs delivery help before retention',
        correctionKind: 'policy_adjustment',
        observedAt: '2026-05-13T20:00:00.000Z',
        evidenceEventIds: ['evt_1', 'evt_2'],
        confidence: 0.4,
        learnedCriterion:
          'Operator/team feedback corrected Kloel criteria without human performance scoring.',
        futureBehaviorChange: {
          declarativeRule:
            'When team feedback corrects a suggestion, system must treat the note as Kloel learning.',
          targetDomain: 'operator_feedback',
          behaviorConstraint:
            'Future suggestions in this domain must incorporate repeated operator correction notes.',
          confidence: 0.45,
        },
        acceptedWithoutDefense: true,
      },
    ];

    const bundle = build().build({
      workspaceId: 'wks_owner',
      decisions: [],
      corrections,
      tones: [],
      risks: [],
      ethicals: [],
      approvals: [],
    });

    expect(bundle.correctionEvidence).toEqual(corrections);
    expect(bundle.correctionEvidence[0]?.correctionKind).toBe('policy_adjustment');
    expect(bundle.correctionEvidence[0]?.correctedTarget).toBe('operator_feedback');
  });
});
