import type { SpineEventRef } from '../../mind/mind.types';
import { Detector, makeTensionId, Tension } from '../goal-field.types';

/**
 * UTP-GOAL-COG-001..005 — cognitive-dimension detectors.
 *
 * These detect breakdowns inside the cognitive substrate itself:
 * decisions without persistence, conversations without valence, repeated
 * agent failures, capabilities without runtime evidence, etc.
 */

function tensionFor(
  detectorName: string,
  description: string,
  severity: number,
  e: SpineEventRef | undefined,
  evidenceEventIds: readonly string[],
  detectedAtMs: number,
): Tension {
  const t: Tension = {
    tensionId: makeTensionId(),
    detectorName,
    dimension: 'cognitive',
    ...(e?.workspaceId !== undefined ? { workspaceId: e.workspaceId } : {}),
    ...(e?.entityRef !== undefined ? { entityRef: e.entityRef } : {}),
    severity,
    description,
    detectedAt: new Date(detectedAtMs).toISOString(),
    evidenceEventIds,
  };
  return t;
}

/**
 * COG-001: a cognitive operation happened (decision/prediction) but was
 * never persisted as a spine event. Detected when we see action events
 * without corresponding cognition.* trace.
 */
export const decisionWithoutPersistenceDetector: Detector = {
  name: 'cognitive.decision_without_persistence',
  dimension: 'cognitive',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const replies = events.filter((e) => e.eventName === 'commerce.whatsapp.message_replied');
    for (const r of replies) {
      const cognitionTrace = events.find(
        (e) =>
          e.eventName.startsWith('cognition.') &&
          e.correlationId &&
          e.correlationId === r.correlationId,
      );
      if (cognitionTrace) continue;
      out.push(
        tensionFor(
          'cognitive.decision_without_persistence',
          'reply emitido sem cognition.* correspondente — decisão não auditável',
          0.6,
          r,
          [r.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

/**
 * COG-002: terminal commerce event in a conversation but no cognitive
 * valence_assigned trace was emitted by the substrate. Indicates the
 * substrate isn't picking up real outcomes for learning.
 */
export const conversationWithoutValenceDetector: Detector = {
  name: 'cognitive.conversation_without_valence',
  dimension: 'cognitive',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const terminals = events.filter(
      (e) =>
        e.eventName === 'commerce.crm.deal_won' ||
        e.eventName === 'commerce.crm.deal_lost' ||
        e.eventName === 'commerce.payment.approved' ||
        e.eventName === 'commerce.payment.refunded',
    );
    for (const t of terminals) {
      const valenceTrace = events.find(
        (e) =>
          e.eventName === 'cognition.valence_assigned' &&
          e.correlationId &&
          e.correlationId === t.correlationId,
      );
      if (valenceTrace) continue;
      out.push(
        tensionFor(
          'cognitive.conversation_without_valence',
          `terminal ${t.eventName} sem cognition.valence_assigned correspondente`,
          0.55,
          t,
          [t.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

/**
 * COG-003: same agent failed >=2 times in a window. Pattern of brittle
 * autonomous behavior.
 */
export const repeatedAgentFailureDetector: Detector = {
  name: 'cognitive.repeated_agent_failure',
  dimension: 'cognitive',
  detect: (events, nowMs) => {
    const handoffs = events.filter(
      (e) => e.eventName === 'commerce.whatsapp.handoff_to_human',
    );
    const out: Tension[] = [];
    const byEntity = new Map<string, SpineEventRef[]>();
    for (const h of handoffs) {
      if (!h.entityRef) continue;
      const k = `${h.entityRef.entityType}:${h.entityRef.entityId}`;
      const cur = byEntity.get(k) ?? [];
      cur.push(h);
      byEntity.set(k, cur);
    }
    for (const [, list] of byEntity) {
      if (list.length < 2) continue;
      const last = list[list.length - 1]!;
      out.push(
        tensionFor(
          'cognitive.repeated_agent_failure',
          `${list.length} handoffs ao humano para o mesmo lead`,
          Math.min(0.85, 0.4 + list.length * 0.1),
          last,
          list.map((e) => e.eventId),
          nowMs,
        ),
      );
    }
    return out;
  },
};

/**
 * COG-004: capability declared in pulse.capability_promoted without runtime
 * evidence event in the window.
 */
export const capabilityWithoutRuntimeEvidenceDetector: Detector = {
  name: 'cognitive.capability_without_runtime_evidence',
  dimension: 'cognitive',
  detect: (events, nowMs) => {
    const promotions = events.filter((e) => e.eventName === 'pulse.capability_promoted');
    const out: Tension[] = [];
    for (const p of promotions) {
      const cap = p.payload?.['capabilityId'] as string | undefined;
      if (!cap) continue;
      const usageEvidence = events.some(
        (e) =>
          (e.eventName === 'pulse.gate_passed' || e.eventName.startsWith('cognition.')) &&
          (e.payload?.['capabilityId'] as string | undefined) === cap,
      );
      if (usageEvidence) continue;
      out.push(
        tensionFor(
          'cognitive.capability_without_runtime_evidence',
          `capability ${cap} promovida sem evidência runtime`,
          0.7,
          p,
          [p.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

/**
 * COG-005: any pulse.gate_failed in hard_fail mode = critical without
 * subsequent observability event.
 */
export const runtimeCriticalWithoutObservabilityDetector: Detector = {
  name: 'cognitive.runtime_critical_without_observability',
  dimension: 'cognitive',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const fails = events.filter(
      (e) =>
        e.eventName === 'pulse.gate_failed' &&
        (e.payload?.['mode'] as string | undefined) === 'hard_fail',
    );
    for (const f of fails) {
      out.push(
        tensionFor(
          'cognitive.runtime_critical_without_observability',
          `pulse gate hard_fail: ${(f.payload?.['gateName'] as string | undefined) ?? 'unknown'}`,
          0.95,
          f,
          [f.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const COGNITIVE_DETECTORS: readonly Detector[] = [
  decisionWithoutPersistenceDetector,
  conversationWithoutValenceDetector,
  repeatedAgentFailureDetector,
  capabilityWithoutRuntimeEvidenceDetector,
  runtimeCriticalWithoutObservabilityDetector,
];
