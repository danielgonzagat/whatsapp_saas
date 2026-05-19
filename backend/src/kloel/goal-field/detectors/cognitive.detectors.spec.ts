import type { SpineEventRef } from '../../mind/mind.types';
import {
  COGNITIVE_DETECTORS,
} from './cognitive.detectors';
import { runtimeCriticalWithoutObservabilityDetector } from './cognitive.detectors';

const NOW = Date.parse('2026-05-13T22:00:00.000Z');

function ev(over: Partial<SpineEventRef>): SpineEventRef {
  const e: Record<string, unknown> = {
    eventId: over.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? 'wks_demo',
    occurredAt: over.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over.truthMode ?? 'observed',
  };
  if ('entityRef' in over) {
    if (over.entityRef !== undefined) e['entityRef'] = over.entityRef;
  } else {
    e['entityRef'] = { entityType: 'lead', entityId: 'lead_1' };
  }
  if (over.valence !== undefined) e['valence'] = over.valence;
  if (over.payload !== undefined) e['payload'] = over.payload;
  if (over.correlationId !== undefined) e['correlationId'] = over.correlationId;
  return e as SpineEventRef;
}

// Access all detectors via the array
const [
  decisionWithoutPersistenceDetector,
  conversationWithoutValenceDetector,
  repeatedAgentFailureDetector,
  capabilityWithoutRuntimeEvidenceDetector,
] = COGNITIVE_DETECTORS;

describe('Cognitive detectors — COG-001: decision_without_persistence', () => {
  it('fires when reply has no matching cognition.* trace', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_1',
        eventId: 'reply_1',
      }),
    ];
    const tens = decisionWithoutPersistenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.detectorName).toBe('cognitive.decision_without_persistence');
    expect(tens[0]?.severity).toBeCloseTo(0.6);
    expect(tens[0]?.evidenceEventIds).toEqual(['reply_1']);
    expect(tens[0]?.dimension).toBe('cognitive');
  });

  it('is silent when reply has matching cognition.* trace', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_1',
        eventId: 'reply_1',
      }),
      ev({
        eventName: 'cognition.analysis_started',
        correlationId: 'corr_1',
        eventId: 'cog_1',
      }),
    ];
    expect(
      decisionWithoutPersistenceDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('is silent when no reply events exist', () => {
    const events = [
      ev({ eventName: 'commerce.lead.replied' }),
    ];
    expect(
      decisionWithoutPersistenceDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('fires for multiple uncorrelated replies independently', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_a',
        eventId: 'r_a',
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_b',
        eventId: 'r_b',
      }),
    ];
    const tens = decisionWithoutPersistenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(2);
    expect(tens.map((t) => t.evidenceEventIds[0]).sort()).toEqual(['r_a', 'r_b']);
  });

  it('only fires for unmatched replies when some are matched', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_1',
        eventId: 'r_1',
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_2',
        eventId: 'r_2',
      }),
      ev({
        eventName: 'cognition.decision_made',
        correlationId: 'corr_2',
        eventId: 'c_2',
      }),
    ];
    const tens = decisionWithoutPersistenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.evidenceEventIds).toEqual(['r_1']);
  });
});

describe('Cognitive detectors — COG-002: conversation_without_valence', () => {
  it('fires on deal_won without valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_won',
        correlationId: 'corr_1',
        eventId: 'deal_1',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.detectorName).toBe(
      'cognitive.conversation_without_valence',
    );
    expect(tens[0]?.severity).toBe(0.55);
  });

  it('fires on deal_lost without valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_lost',
        correlationId: 'corr_1',
        eventId: 'deal_1',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.description).toContain('deal_lost');
  });

  it('fires on payment.approved without valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.payment.approved',
        correlationId: 'corr_1',
        eventId: 'pay_1',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.description).toContain('payment.approved');
  });

  it('fires on payment.refunded without valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.payment.refunded',
        correlationId: 'corr_1',
        eventId: 'ref_1',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.description).toContain('payment.refunded');
  });

  it('is silent when terminal event has valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_won',
        correlationId: 'corr_1',
        eventId: 'deal_1',
      }),
      ev({
        eventName: 'cognition.valence_assigned',
        correlationId: 'corr_1',
        eventId: 'val_1',
      }),
    ];
    expect(
      conversationWithoutValenceDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('is silent when no terminal events exist', () => {
    const events = [
      ev({ eventName: 'commerce.lead.replied' }),
    ];
    expect(
      conversationWithoutValenceDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('fires for each unmatched terminal event', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_won',
        correlationId: 'corr_a',
        eventId: 'd_a',
      }),
      ev({
        eventName: 'commerce.crm.deal_lost',
        correlationId: 'corr_b',
        eventId: 'd_b',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(2);
  });

  it('correctly identifies matched vs unmatched in mixed set', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_won',
        correlationId: 'corr_a',
        eventId: 'd_a',
      }),
      ev({
        eventName: 'commerce.payment.approved',
        correlationId: 'corr_b',
        eventId: 'p_b',
      }),
      ev({
        eventName: 'cognition.valence_assigned',
        correlationId: 'corr_a',
        eventId: 'v_a',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.evidenceEventIds).toEqual(['p_b']);
  });
});

describe('Cognitive detectors — COG-003: repeated_agent_failure', () => {
  it('fires on >=2 handoffs for same entity', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: { entityType: 'lead', entityId: 'l1' },
        occurredAt: '2026-05-13T20:00:00.000Z',
        eventId: 'h1',
      }),
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: { entityType: 'lead', entityId: 'l1' },
        occurredAt: '2026-05-13T21:00:00.000Z',
        eventId: 'h2',
      }),
    ];
    const tens = repeatedAgentFailureDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.detectorName).toBe('cognitive.repeated_agent_failure');
    expect(tens[0]?.evidenceEventIds).toEqual(['h1', 'h2']);
    expect(tens[0]?.severity).toBeCloseTo(0.6);
  });

  it('is silent on single handoff', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: { entityType: 'lead', entityId: 'l1' },
      }),
    ];
    expect(
      repeatedAgentFailureDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('is silent for events without entityRef', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: undefined,
      }),
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: undefined,
      }),
    ];
    expect(
      repeatedAgentFailureDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('caps severity at 0.85', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: { entityType: 'lead', entityId: 'l1' },
        occurredAt: `2026-05-13T${20 + i}:00:00.000Z`,
        eventId: `h${i}`,
      }),
    );
    const tens = repeatedAgentFailureDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.severity).toBe(0.85); // 0.4 + 6*0.1 = 1.0, capped at 0.85
  });

  it('tracks separate entities independently', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: { entityType: 'lead', entityId: 'l1' },
        eventId: 'h1a',
      }),
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: { entityType: 'lead', entityId: 'l1' },
        eventId: 'h1b',
      }),
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: { entityType: 'lead', entityId: 'l2' },
        eventId: 'h2a',
      }),
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: { entityType: 'lead', entityId: 'l2' },
        eventId: 'h2b',
      }),
    ];
    const tens = repeatedAgentFailureDetector.detect(events, NOW);
    expect(tens).toHaveLength(2);
  });

  it('returns empty on empty input', () => {
    expect(repeatedAgentFailureDetector.detect([], NOW)).toHaveLength(0);
  });
});

describe('Cognitive detectors — COG-004: capability_without_runtime_evidence', () => {
  it('fires when capability promoted but no runtime evidence', () => {
    const events = [
      ev({
        eventName: 'pulse.capability_promoted',
        payload: { capabilityId: 'cap_origin_check' },
        eventId: 'prom_1',
      }),
    ];
    const tens =
      capabilityWithoutRuntimeEvidenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.detectorName).toBe(
      'cognitive.capability_without_runtime_evidence',
    );
    expect(tens[0]?.severity).toBe(0.7);
    expect(tens[0]?.description).toContain('cap_origin_check');
  });

  it('is silent when capability has gate_passed evidence', () => {
    const events = [
      ev({
        eventName: 'pulse.capability_promoted',
        payload: { capabilityId: 'cap_x' },
        eventId: 'prom_1',
      }),
      ev({
        eventName: 'pulse.gate_passed',
        payload: { capabilityId: 'cap_x' },
        eventId: 'gate_1',
      }),
    ];
    expect(
      capabilityWithoutRuntimeEvidenceDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('is silent when capability has cognition.* evidence', () => {
    const events = [
      ev({
        eventName: 'pulse.capability_promoted',
        payload: { capabilityId: 'cap_y' },
        eventId: 'prom_1',
      }),
      ev({
        eventName: 'cognition.analysis_completed',
        payload: { capabilityId: 'cap_y' },
        eventId: 'cog_1',
      }),
    ];
    expect(
      capabilityWithoutRuntimeEvidenceDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('skips promotions without capabilityId in payload', () => {
    const events = [
      ev({
        eventName: 'pulse.capability_promoted',
        payload: {},
        eventId: 'prom_1',
      }),
    ];
    expect(
      capabilityWithoutRuntimeEvidenceDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('fires for multiple unmatched capabilities', () => {
    const events = [
      ev({
        eventName: 'pulse.capability_promoted',
        payload: { capabilityId: 'cap_a' },
        eventId: 'p_a',
      }),
      ev({
        eventName: 'pulse.capability_promoted',
        payload: { capabilityId: 'cap_b' },
        eventId: 'p_b',
      }),
    ];
    const tens =
      capabilityWithoutRuntimeEvidenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(2);
    expect(tens.map((t) => t.evidenceEventIds[0]).sort()).toEqual(['p_a', 'p_b']);
  });

  it('only flags unmatched when evidence exists for some', () => {
    const events = [
      ev({
        eventName: 'pulse.capability_promoted',
        payload: { capabilityId: 'cap_a' },
        eventId: 'p_a',
      }),
      ev({
        eventName: 'pulse.capability_promoted',
        payload: { capabilityId: 'cap_b' },
        eventId: 'p_b',
      }),
      ev({
        eventName: 'pulse.gate_passed',
        payload: { capabilityId: 'cap_a' },
        eventId: 'g_a',
      }),
    ];
    const tens =
      capabilityWithoutRuntimeEvidenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.evidenceEventIds).toEqual(['p_b']);
  });
});

describe('Cognitive detectors — COG-005: runtime_critical_without_observability', () => {
  it('fires on pulse.gate_failed in hard_fail mode', () => {
    const events = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'origin-immutability' },
        eventId: 'fail_1',
      }),
    ];
    const tens =
      runtimeCriticalWithoutObservabilityDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.detectorName).toBe(
      'cognitive.runtime_critical_without_observability',
    );
    expect(tens[0]?.severity).toBeGreaterThan(0.9);
    expect(tens[0]?.severity).toBe(0.95);
  });

  it('includes gateName in description', () => {
    const events = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'lineage-integrity' },
      }),
    ];
    const tens =
      runtimeCriticalWithoutObservabilityDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.description).toContain('lineage-integrity');
  });

  it('shows "unknown" for gateName when missing', () => {
    const events = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail' },
      }),
    ];
    const tens =
      runtimeCriticalWithoutObservabilityDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.description).toContain('unknown');
  });

  it('does NOT fire on pulse.gate_failed in soft_fail mode', () => {
    const events = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'soft_fail', gateName: 'some-gate' },
      }),
    ];
    expect(
      runtimeCriticalWithoutObservabilityDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('does NOT fire when no mode in payload', () => {
    const events = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { gateName: 'some-gate' },
      }),
    ];
    expect(
      runtimeCriticalWithoutObservabilityDetector.detect(events, NOW),
    ).toHaveLength(0);
  });

  it('fires for each hard_fail event', () => {
    const events = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'gate_a' },
        eventId: 'f_a',
      }),
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'gate_b' },
        eventId: 'f_b',
      }),
    ];
    const tens =
      runtimeCriticalWithoutObservabilityDetector.detect(events, NOW);
    expect(tens).toHaveLength(2);
  });

  it('returns empty array on empty input', () => {
    expect(
      runtimeCriticalWithoutObservabilityDetector.detect([], NOW),
    ).toHaveLength(0);
  });

  it('returns empty array on non-failed events', () => {
    const events = [
      ev({ eventName: 'pulse.gate_passed' }),
      ev({ eventName: 'commerce.lead.replied' }),
    ];
    expect(
      runtimeCriticalWithoutObservabilityDetector.detect(events, NOW),
    ).toHaveLength(0);
  });
});

describe('Cognitive detectors — array export', () => {
  it('COGNITIVE_DETECTORS contains 5 detectors', () => {
    expect(COGNITIVE_DETECTORS).toHaveLength(5);
  });

  it('all detectors have name and dimension=cognitive', () => {
    for (const d of COGNITIVE_DETECTORS) {
      expect(d.name).toBeTruthy();
      expect(d.dimension).toBe('cognitive');
      expect(typeof d.detect).toBe('function');
    }
  });

  it('all detectors return tensions with cognitive dimension', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_won',
        correlationId: 'corr_1',
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_2',
      }),
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'test' },
      }),
    ];
    for (const d of COGNITIVE_DETECTORS) {
      const tens = d.detect(events, NOW);
      for (const t of tens) {
        expect(t.dimension).toBe('cognitive');
      }
    }
  });
});
