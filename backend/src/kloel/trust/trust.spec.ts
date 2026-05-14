/**
 * UTP-TRUST-001..008 — Trust Capital Protection Spec
 *
 * Contract tests for Camada IX trust layer: fatigue detection,
 * desperation detection, timing appropriateness, brand protection,
 * silence-as-action, human handoff, trust recovery, and the composed
 * state tracker.
 */

import { detectFatigue } from './fatigue-detector';
import { detectDesperation } from './desperation-detector';
import { evaluateTiming } from './timing-appropriateness';
import { evaluateBrandRisk } from './brand-protection.guard';
import { decideSilence } from './silence-as-action.policy';
import { shouldHandoff } from './human-handoff.trigger';
import { proposeRecoveryActions } from './trust-recovery.tactics';
import { TrustStateTrackerService } from './trust-state-tracker.service';
import { toTrustEvent } from './trust.types';

import type { TrustEvent } from './trust.types';
import type { SpineEventRef } from '../mind/mind.types';

const baseSpineEvent = (
  over: Partial<SpineEventRef> = {},
): SpineEventRef => ({
  eventId: over.eventId ?? `evt_test_${Math.random().toString(36).slice(2, 8)}`,
  eventName: over.eventName ?? 'commerce.lead.replied',
  workspaceId: over.workspaceId ?? 'wks_demo',
  occurredAt: over.occurredAt ?? new Date().toISOString(),
  truthMode: over.truthMode ?? 'observed',
  ...(over.entityRef !== undefined ? { entityRef: over.entityRef } : {}),
  ...(over.valence !== undefined ? { valence: over.valence } : {}),
  ...(over.payload !== undefined ? { payload: over.payload } : {}),
});

const baseTrustEvent = (
  over: Partial<TrustEvent> = {},
): TrustEvent => ({
  eventId: over.eventId ?? `evt_test_${Math.random().toString(36).slice(2, 8)}`,
  eventName: over.eventName ?? 'commerce.lead.replied',
  occurredAt: over.occurredAt ?? new Date().toISOString(),
  ...(over.valence !== undefined ? { valence: over.valence } : {}),
  ...(over.payload !== undefined ? { payload: over.payload } : {}),
});

const conversationRef = {
  entityType: 'conversation' as const,
  entityId: 'conv_test_001',
};

// ─── TRUST-002: Fatigue Detection ──────────────────────────────────

describe('FatigueDetector (UTP-TRUST-002)', () => {
  it('returns not fatigued when few outbound events within window', () => {
    const events = Array.from({ length: 2 }, (_, i) =>
      baseTrustEvent({
        eventName: 'commerce.whatsapp.message_replied',
        occurredAt: new Date(Date.now() - i * 60_000).toISOString(),
      }),
    );
    const result = detectFatigue(events);
    expect(result.fatigued).toBe(false);
    expect(result.level).toBeLessThan(1);
  });

  it('detects fatigue when outbound count exceeds max', () => {
    const events = Array.from({ length: 6 }, () =>
      baseTrustEvent({
        eventName: 'commerce.whatsapp.message_replied',
        occurredAt: new Date().toISOString(),
      }),
    );
    const result = detectFatigue(events);
    expect(result.fatigued).toBe(true);
    expect(result.level).toBeGreaterThanOrEqual(1);
  });

  it('detects fatigue from repeated objections', () => {
    const events = Array.from({ length: 4 }, () =>
      baseTrustEvent({
        eventName: 'commerce.lead.objection_raised',
        occurredAt: new Date().toISOString(),
      }),
    );
    const result = detectFatigue(events, { maxOutboundMessages: 10 });
    expect(result.fatigued).toBe(true);
  });
});

// ─── TRUST-003: Desperation Detection ──────────────────────────────

describe('DesperationDetector (UTP-TRUST-003)', () => {
  it('returns not desperate when messages have no discount/promise language', () => {
    const events: TrustEvent[] = [
      baseTrustEvent({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { messageBody: 'Bom dia! Como posso ajudar?' },
      }),
    ];
    const result = detectDesperation(events);
    expect(result.desperate).toBe(false);
    expect(result.level).toBe(0);
  });

  it('returns no desperation for empty events', () => {
    const result = detectDesperation([]);
    expect(result.desperate).toBe(false);
    expect(result.level).toBe(0);
  });

  it('detects discount escalation via keywords', () => {
    const events: TrustEvent[] = [
      baseTrustEvent({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { messageBody: 'Temos um desconto especial para você!' },
      }),
      baseTrustEvent({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { messageBody: 'Última chance de preço reduzido!' },
      }),
    ];
    const result = detectDesperation(events, {
      maxRecentMessages: 3,
      discountEscalationThreshold: 0.3,
      promiseInflationThreshold: 1.0,
    });
    expect(result.desperate).toBe(true);
  });

  it('detects promise inflation via keywords', () => {
    const events: TrustEvent[] = [
      baseTrustEvent({
        eventName: 'commerce.whatsapp.message_replied',
        payload: { messageBody: 'Garantimos resultado em 24h!' },
      }),
    ];
    const result = detectDesperation(events, {
      maxRecentMessages: 1,
      discountEscalationThreshold: 1.0,
      promiseInflationThreshold: 0.2,
    });
    expect(result.desperate).toBe(true);
  });
});

// ─── TRUST-004: Timing Appropriateness ─────────────────────────────

describe('TimingAppropriateness (UTP-TRUST-004)', () => {
  it('marks quiet hours as inappropriate', () => {
    const result = evaluateTiming(23);
    expect(result.appropriate).toBe(false);
    expect(result.localHour).toBe(23);
  });

  it('marks early morning hours as inappropriate', () => {
    const result = evaluateTiming(3);
    expect(result.appropriate).toBe(false);
  });

  it('marks business hours as appropriate', () => {
    const result = evaluateTiming(10);
    expect(result.appropriate).toBe(true);
    expect(result.localHour).toBe(10);
  });

  it('detects peak window when configured', () => {
    const result = evaluateTiming(15, {
      typicalReplyWindowStart: 14,
      typicalReplyWindowEnd: 18,
    });
    expect(result.appropriate).toBe(true);
    expect(result.peakWindow).toBe(true);
  });
});

// ─── TRUST-005: Brand Protection ───────────────────────────────────

describe('BrandProtectionGuard (UTP-TRUST-005)', () => {
  it('returns no flags for clean text', () => {
    const flags = evaluateBrandRisk(
      'Bom dia! Estamos à disposição para ajudar com sua dúvida.',
    );
    expect(flags).toHaveLength(0);
  });

  it('detects false promise patterns', () => {
    const flags = evaluateBrandRisk(
      'Você vai faturar 10 mil por mês sem esforço nenhum!',
    );
    const falsePromises = flags.filter((f) => f.kind === 'false_promise');
    expect(falsePromises.length).toBeGreaterThan(0);
  });

  it('detects pressure tactics', () => {
    const flags = evaluateBrandRisk(
      'Última chance! Esta oferta é só hoje, não vai perder!',
    );
    const pressure = flags.filter((f) => f.kind === 'pressure_tactic');
    expect(pressure.length).toBeGreaterThan(0);
  });

  it('detects complaint triggers', () => {
    const flags = evaluateBrandRisk(
      'Não se preocupe com o Procon, o processo é simples.',
    );
    const complaints = flags.filter((f) => f.kind === 'complaint_trigger');
    expect(complaints.length).toBeGreaterThan(0);
  });

  it('returns empty for empty string', () => {
    const flags = evaluateBrandRisk('');
    expect(flags).toHaveLength(0);
  });
});

// ─── TRUST-006: Silence-as-Action ──────────────────────────────────

describe('SilenceAsAction (UTP-TRUST-006)', () => {
  const healthyState = {
    trustScore: 0.8,
    fatigueLevel: 0.1,
    desperationLevel: 0.05,
    lastInteractionAt: new Date().toISOString(),
    silentInteractionsCount: 0,
    brandRiskFlags: [],
  };

  it('does not silence when state is healthy', () => {
    const decision = decideSilence(healthyState);
    expect(decision.remainSilent).toBe(false);
  });

  it('silences when fatigue is high', () => {
    const decision = decideSilence({
      ...healthyState,
      fatigueLevel: 0.9,
    });
    expect(decision.remainSilent).toBe(true);
  });

  it('silences when desperation is high', () => {
    const decision = decideSilence({
      ...healthyState,
      desperationLevel: 0.85,
    });
    expect(decision.remainSilent).toBe(true);
  });

  it('silences when silentInteractionsCount exceeds max', () => {
    const decision = decideSilence({
      ...healthyState,
      silentInteractionsCount: 10,
    });
    expect(decision.remainSilent).toBe(true);
  });

  it('silences when brand risk combined with low trust', () => {
    const decision = decideSilence({
      ...healthyState,
      trustScore: 0.25,
      brandRiskFlags: [{ kind: 'false_promise', confidence: 0.8, matchedPattern: 'test' }],
    });
    expect(decision.remainSilent).toBe(true);
  });
});

// ─── TRUST-007: Human Handoff ──────────────────────────────────────

describe('HumanHandoff (UTP-TRUST-007)', () => {
  it('does not handoff for healthy state', () => {
    const decision = shouldHandoff({
      trustScore: 0.8,
      fatigueLevel: 0.1,
      desperationLevel: 0.05,
      lastInteractionAt: new Date().toISOString(),
      silentInteractionsCount: 0,
      brandRiskFlags: [],
    });
    expect(decision.shouldHandoff).toBe(false);
  });

  it('handoffs at critical trust floor', () => {
    const decision = shouldHandoff({
      trustScore: 0.1,
      fatigueLevel: 0.3,
      desperationLevel: 0.2,
      lastInteractionAt: new Date().toISOString(),
      silentInteractionsCount: 0,
      brandRiskFlags: [],
    });
    expect(decision.shouldHandoff).toBe(true);
    expect(decision.urgency).toBe('high');
  });

  it('handoffs with combined fatigue and desperation at ceilings', () => {
    const decision = shouldHandoff({
      trustScore: 0.5,
      fatigueLevel: 0.9,
      desperationLevel: 0.9,
      lastInteractionAt: new Date().toISOString(),
      silentInteractionsCount: 0,
      brandRiskFlags: [],
    });
    expect(decision.shouldHandoff).toBe(true);
    expect(decision.urgency).toBe('high');
  });
});

// ─── TRUST-008: Trust Recovery ─────────────────────────────────────

describe('TrustRecovery (UTP-TRUST-008)', () => {
  it('returns no actions when trust is above floor', () => {
    const state = {
      trustScore: 0.6,
      fatigueLevel: 0.1,
      desperationLevel: 0.0,
      lastInteractionAt: new Date().toISOString(),
      silentInteractionsCount: 0,
      brandRiskFlags: [],
    };
    const actions = proposeRecoveryActions(state);
    expect(actions).toHaveLength(0);
  });

  it('proposes escalate_to_human at critically low trust', () => {
    const state = {
      trustScore: 0.1,
      fatigueLevel: 0.5,
      desperationLevel: 0.4,
      lastInteractionAt: new Date().toISOString(),
      silentInteractionsCount: 0,
      brandRiskFlags: [],
    };
    const actions = proposeRecoveryActions(state);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]?.action).toBe('escalate_to_human');
  });

  it('proposes cool-down when fatigue is high', () => {
    const state = {
      trustScore: 0.3,
      fatigueLevel: 0.85,
      desperationLevel: 0.3,
      lastInteractionAt: new Date().toISOString(),
      silentInteractionsCount: 0,
      brandRiskFlags: [],
    };
    const actions = proposeRecoveryActions(state);
    const coolDown = actions.find((a) => a.action === 'wait_and_cool_down');
    expect(coolDown).toBeDefined();
  });
});

// ─── TRUST-001: Composed State Tracker ─────────────────────────────

describe('TrustStateTrackerService (UTP-TRUST-001)', () => {
  let tracker: TrustStateTrackerService;

  beforeEach(() => {
    tracker = new TrustStateTrackerService();
  });

  it('returns default trust state for a new conversation with no events', () => {
    const state = tracker.trackConversation('wks_demo', conversationRef, []);
    expect(state.trustScore).toBeGreaterThan(0.7);
    expect(state.fatigueLevel).toBe(0);
    expect(state.desperationLevel).toBe(0);
    expect(state.silentInteractionsCount).toBe(0);
    expect(state.brandRiskFlags).toHaveLength(0);
  });

  it('reduces trust score on negative valence events', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({
        eventName: 'commerce.lead.objection_raised',
        valence: 'negative',
      }),
    ];
    const state = tracker.trackConversation('wks_demo', conversationRef, events);
    expect(state.trustScore).toBeLessThan(0.75);
  });

  it('increases trust score on positive valence events', () => {
    tracker.trackConversation('wks_demo', conversationRef, [
      baseSpineEvent({
        eventName: 'commerce.lead.objection_raised',
        valence: 'negative',
      }),
    ]);
    const state = tracker.trackConversation('wks_demo', conversationRef, [
      baseSpineEvent({
        eventName: 'commerce.lead.replied',
        valence: 'positive',
      }),
    ]);
    expect(state.trustScore).toBeGreaterThan(0.69);
  });

  it('accumulates silent interactions when lead goes silent', () => {
    const events: SpineEventRef[] = [
      baseSpineEvent({ eventName: 'commerce.lead.went_silent' }),
    ];
    const state = tracker.trackConversation('wks_demo', conversationRef, events);
    expect(state.silentInteractionsCount).toBe(1);
  });

  it('returns consistent state across repeated calls', () => {
    const state1 = tracker.trackConversation('wks_demo', conversationRef, []);
    const state2 = tracker.getState(conversationRef);
    expect(state2).toBeDefined();
    expect(state2?.trustScore).toBe(state1.trustScore);
  });

  it('getFullAssessment returns complete decision bundle', () => {
    tracker.trackConversation('wks_demo', conversationRef, [
      baseSpineEvent({
        eventName: 'commerce.lead.objection_raised',
        valence: 'negative',
      }),
      baseSpineEvent({
        eventName: 'commerce.lead.objection_raised',
        valence: 'negative',
      }),
      baseSpineEvent({
        eventName: 'commerce.lead.objection_raised',
        valence: 'negative',
      }),
    ]);
    const assessment = tracker.getFullAssessment('wks_demo', conversationRef, []);
    expect(assessment.state.trustScore).toBeLessThan(0.65);
    expect(assessment.silence).toBeDefined();
    expect(assessment.handoff).toBeDefined();
    expect(Array.isArray(assessment.recovery)).toBe(true);
  });

  it('isolates trackConversation across different conversations', () => {
    const convA = { entityType: 'conversation' as const, entityId: 'conv_a' };
    const convB = { entityType: 'conversation' as const, entityId: 'conv_b' };

    tracker.trackConversation('wks_demo', convA, [
      baseSpineEvent({
        eventName: 'commerce.lead.objection_raised',
        valence: 'negative',
      }),
      baseSpineEvent({
        eventName: 'commerce.lead.objection_raised',
        valence: 'negative',
      }),
    ]);

    const stateB = tracker.trackConversation('wks_demo', convB, []);

    expect(stateB.trustScore).toBeGreaterThan(0.7);
    expect(stateB.fatigueLevel).toBe(0);
  });
});

// ─── TRUST: toTrustEvent conversion ────────────────────────────────

describe('toTrustEvent (UTP-TRUST-types)', () => {
  it('converts SpineEventRef to TrustEvent preserving key fields', () => {
    const spine = baseSpineEvent({
      eventName: 'commerce.lead.replied',
      valence: 'positive',
      payload: { body: 'ok' },
    });
    const trust = toTrustEvent(spine);
    expect(trust.eventId).toBe(spine.eventId);
    expect(trust.eventName).toBe(spine.eventName);
    expect(trust.occurredAt).toBe(spine.occurredAt);
    expect(trust.valence).toBe('positive');
    expect(trust.payload).toEqual({ body: 'ok' });
  });
});
