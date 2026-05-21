import { observeCorrections } from './observers/correction.observer';
import type { CorrectionObservation, ObserverInput } from './owner-criterion.types';
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

function correctionInput(events: readonly SpineEventRef[]): ObserverInput {
  return { workspaceId: 'wks_owner', events, nowMs: Date.now(), windowDays: 7 };
}

function firstRewrite(result: CorrectionObservation[]): CorrectionObservation {
  const obs = result.filter((o) => o.correctionKind === 'message_rewrite')[0];
  if (!obs) {
    throw new Error('Expected at least one message_rewrite observation');
  }
  return obs;
}

function firstClassificationFix(result: CorrectionObservation[]): CorrectionObservation {
  const obs = result.filter((o) => o.correctionKind === 'classification_fix')[0];
  if (!obs) {
    throw new Error('Expected at least one classification_fix observation');
  }
  return obs;
}

function firstActionReversal(result: CorrectionObservation[]): CorrectionObservation {
  const obs = result.filter((o) => o.correctionKind === 'action_reversal')[0];
  if (!obs) {
    throw new Error('Expected at least one action_reversal observation');
  }
  return obs;
}

function firstPolicyAdjustment(result: CorrectionObservation[]): CorrectionObservation {
  const obs = result.filter((o) => o.correctionKind === 'policy_adjustment')[0];
  if (!obs) {
    throw new Error('Expected at least one policy_adjustment observation');
  }
  return obs;
}

describe('owner correction — future behavior evidence (UTP-OWNER-CRIT-002-B)', () => {
  it('message_rewrite observation carries learnedCriterion describing the correction pattern', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'Buy now!', correctedOutput: 'Hi, are you interested?' },
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'Buy now 2!', correctedOutput: 'Let me help you decide' },
      }),
    ];
    const result = observeCorrections(correctionInput(events));
    const obs = firstRewrite(result);

    expect(obs.learnedCriterion).toBeTruthy();
    expect(obs.learnedCriterion.length).toBeGreaterThan(50);
    expect(obs.learnedCriterion).toContain('Owner rewrites');
    expect(obs.learnedCriterion).toContain('2 instances');
  });

  it('message_rewrite observation carries futureBehaviorChange with declarative rule', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'a', correctedOutput: 'b' },
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'c', correctedOutput: 'd' },
      }),
    ];
    const result = observeCorrections(correctionInput(events));
    const obs = firstRewrite(result);

    const fbc = obs.futureBehaviorChange;
    expect(fbc.declarativeRule).toBeTruthy();
    expect(fbc.declarativeRule.length).toBeGreaterThan(30);
    expect(fbc.targetDomain).toBe('auto_reply');
    expect(fbc.behaviorConstraint).toBeTruthy();
    expect(fbc.behaviorConstraint.length).toBeGreaterThan(20);
    expect(fbc.confidence).toBeGreaterThan(0);
    expect(fbc.confidence).toBeLessThanOrEqual(1);
  });

  it('classification_fix observation carries learnedCriterion about deferred judgment', () => {
    const events = [
      ev({ eventName: 'commerce.lead.objection_raised', payload: { causedByEventId: 'e1' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { causedByEventId: 'e2' } }),
    ];
    const result = observeCorrections(correctionInput(events));
    const obs = firstClassificationFix(result);

    expect(obs.learnedCriterion).toContain('lead classification');
    expect(obs.learnedCriterion).toContain('owner judgment');
    expect(obs.futureBehaviorChange.targetDomain).toBe('lead_classification');
    expect(obs.futureBehaviorChange.behaviorConstraint).toContain('0.7');
  });

  it('action_reversal observation carries futureBehaviorChange requiring owner confirmation', () => {
    const events = [
      ev({ eventName: 'cognition.belief_updated', payload: { updateKind: 'reversal' } }),
      ev({ eventName: 'cognition.belief_updated', payload: { updateKind: 'reversal' } }),
    ];
    const result = observeCorrections(correctionInput(events));
    const obs = firstActionReversal(result);

    expect(obs.learnedCriterion).toContain('reverses');
    expect(obs.learnedCriterion).toContain('owner confirmation');
    expect(obs.futureBehaviorChange.targetDomain).toBe('belief');
    expect(obs.futureBehaviorChange.declarativeRule).toContain('irreversible');
    expect(obs.futureBehaviorChange.behaviorConstraint).toContain('owner approval');
  });

  it('acceptedWithoutDefense is true when no defensive signals in payload', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'x', correctedOutput: 'y' },
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'z', correctedOutput: 'w' },
      }),
    ];
    const result = observeCorrections(correctionInput(events));
    const obs = firstRewrite(result);

    expect(obs.acceptedWithoutDefense).toBe(true);
  });

  it('acceptedWithoutDefense is false when rejectionReason is present', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'a', correctedOutput: 'b', rejectionReason: 'owner refused initial suggestion' },
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'c', correctedOutput: 'd' },
      }),
    ];
    const result = observeCorrections(correctionInput(events));
    const obs = firstRewrite(result);

    expect(obs.acceptedWithoutDefense).toBe(false);
  });

  it('acceptedWithoutDefense is false when ownerDisagreed flag is present', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'a', correctedOutput: 'b', ownerDisagreed: true },
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'c', correctedOutput: 'd' },
      }),
    ];
    const result = observeCorrections(correctionInput(events));
    const obs = firstRewrite(result);

    expect(obs.acceptedWithoutDefense).toBe(false);
  });

  it('future behavior confidence increases with signal count', () => {
    const lowEvents = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'a1', correctedOutput: 'b1' },
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'a2', correctedOutput: 'b2' },
      }),
    ];
    const highEvents = Array.from({ length: 10 }, (_, i) =>
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: `a${i}`, correctedOutput: `b${i}` },
      }),
    );

    const lowResult = observeCorrections(correctionInput(lowEvents));
    const highResult = observeCorrections(correctionInput(highEvents));

    const lowObs = firstRewrite(lowResult);
    const highObs = firstRewrite(highResult);

    expect(highObs.confidence).toBeGreaterThan(lowObs.confidence);
    expect(highObs.futureBehaviorChange.confidence).toBeGreaterThan(lowObs.futureBehaviorChange.confidence);
  });

  it('observationId retains cor_ prefix for traceability', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'x', correctedOutput: 'y' },
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { ownerCorrected: true, originalOutput: 'z', correctedOutput: 'w' },
      }),
    ];
    const result = observeCorrections(correctionInput(events));
    const obs = firstRewrite(result);

    expect(obs.observationId).toMatch(/^cor_/);
  });

  it('futureBehaviorChange always carries a declarativeRule for every correction kind', () => {
    const rewriteEvents = [
      ev({ eventName: 'commerce.whatsapp.message_replied', payload: { ownerCorrected: true, originalOutput: 'a', correctedOutput: 'b' } }),
      ev({ eventName: 'commerce.whatsapp.message_replied', payload: { ownerCorrected: true, originalOutput: 'c', correctedOutput: 'd' } }),
    ];
    const classificationEvents = [
      ev({ eventName: 'commerce.lead.objection_raised', payload: { causedByEventId: 'e1' } }),
      ev({ eventName: 'commerce.lead.objection_raised', payload: { causedByEventId: 'e2' } }),
    ];
    const reversalEvents = [
      ev({ eventName: 'cognition.belief_updated', payload: { updateKind: 'reversal' } }),
      ev({ eventName: 'cognition.belief_updated', payload: { updateKind: 'reversal' } }),
    ];

    const all = [
      ...observeCorrections(correctionInput(rewriteEvents)),
      ...observeCorrections(correctionInput(classificationEvents)),
      ...observeCorrections(correctionInput(reversalEvents)),
    ];

    expect(all.length).toBe(3);

    for (const obs of all) {
      expect(obs.futureBehaviorChange.declarativeRule).toBeTruthy();
      expect(obs.futureBehaviorChange.declarativeRule.length).toBeGreaterThan(20);
      expect(obs.futureBehaviorChange.targetDomain).toBeTruthy();
      expect(obs.futureBehaviorChange.behaviorConstraint).toBeTruthy();
      expect(obs.futureBehaviorChange.confidence).toBeGreaterThan(0);
      expect(typeof obs.learnedCriterion).toBe('string');
      expect(obs.learnedCriterion.length).toBeGreaterThan(0);
      expect(typeof obs.acceptedWithoutDefense).toBe('boolean');
    }
  });

  it('operator feedback correction carries futureBehaviorChange without scoring the human', () => {
    const payload = {
      accepted: false,
      operatorNote: 'customer needs delivery help before retention',
      learningFraming:
        'operator feedback teaches Kloel owner criteria; it is not human performance scoring',
    };
    const events = [
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        payload: { ...payload, suggestionId: 'sugg_1' },
      }),
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_2' },
        payload: { ...payload, suggestionId: 'sugg_2' },
      }),
    ];

    const result = observeCorrections(correctionInput(events));
    const obs = firstPolicyAdjustment(result);

    expect(obs.correctedTarget).toBe('operator_feedback');
    expect(obs.learnedCriterion).toContain('Operator/team feedback');
    expect(obs.learnedCriterion).toContain('human performance scoring');
    expect(obs.futureBehaviorChange.declarativeRule).toContain('Kloel learning');
    expect(obs.futureBehaviorChange.behaviorConstraint).toContain(
      'operator correction notes',
    );
  });
});
