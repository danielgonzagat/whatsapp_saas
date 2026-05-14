import type { SpineEventRef } from '../../mind/mind.types';
import { Detector, makeTensionId, Tension, TensionDimension } from '../goal-field.types';

/**
 * UTP-GOAL-OPS-001..003 + UTP-GOAL-UX-001..004 — operational + UX
 * detectors. Co-located in this file because both observe near-real-time
 * spine traffic.
 */

function makeT(
  name: string,
  dimension: TensionDimension,
  description: string,
  severity: number,
  e: SpineEventRef | undefined,
  evidenceEventIds: readonly string[],
  nowMs: number,
): Tension {
  const t: Tension = {
    tensionId: makeTensionId(),
    detectorName: name,
    dimension,
    ...(e?.workspaceId !== undefined ? { workspaceId: e.workspaceId } : {}),
    ...(e?.entityRef !== undefined ? { entityRef: e.entityRef } : {}),
    severity,
    description,
    detectedAt: new Date(nowMs).toISOString(),
    evidenceEventIds,
  };
  return t;
}

// =========================================================================
// OPS
// =========================================================================

export const peakLoadDetector: Detector = {
  name: 'operational.peak_load',
  dimension: 'operational',
  detect: (events, nowMs) => {
    const ids = events
      .map((e) => Date.parse(e.occurredAt))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (ids.length < 50) return [];
    const lastMinuteCount = ids.filter((t) => nowMs - t <= 60_000).length;
    if (lastMinuteCount < 100) return [];
    return [
      makeT(
        'operational.peak_load',
        'operational',
        `pico de carga: ${lastMinuteCount} eventos no último minuto`,
        Math.min(0.9, 0.5 + lastMinuteCount / 1000),
        events[events.length - 1],
        events.slice(-10).map((e) => e.eventId),
        nowMs,
      ),
    ];
  },
};

export const humanHandoffOverdueDetector: Detector = {
  name: 'operational.human_handoff_overdue',
  dimension: 'operational',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const handoffs = events.filter((e) => e.eventName === 'commerce.whatsapp.handoff_to_human');
    for (const h of handoffs) {
      const followUp = events.some(
        (e) =>
          e.correlationId === h.correlationId &&
          e.eventName === 'commerce.whatsapp.message_replied' &&
          Date.parse(e.occurredAt) > Date.parse(h.occurredAt),
      );
      if (followUp) continue;
      const ageMin = (nowMs - Date.parse(h.occurredAt)) / 60_000;
      if (ageMin < 15) continue;
      out.push(
        makeT(
          'operational.human_handoff_overdue',
          'operational',
          `handoff humano sem follow-up há ${Math.round(ageMin)}min`,
          Math.min(0.85, 0.5 + ageMin / 60),
          h,
          [h.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const queueBuildupDetector: Detector = {
  name: 'operational.queue_buildup',
  dimension: 'operational',
  detect: (events, nowMs) => {
    const incoming = events.filter((e) => e.eventName === 'commerce.whatsapp.message_received')
      .length;
    const outgoing = events.filter((e) => e.eventName === 'commerce.whatsapp.message_replied')
      .length;
    if (incoming - outgoing < 20) return [];
    return [
      makeT(
        'operational.queue_buildup',
        'operational',
        `acúmulo de fila: ${incoming - outgoing} mensagens recebidas sem reply`,
        0.75,
        events[events.length - 1],
        [],
        nowMs,
      ),
    ];
  },
};

// =========================================================================
// UX
// =========================================================================

export const slowResponseDetector: Detector = {
  name: 'ux.slow_response',
  dimension: 'ux',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const replies = events.filter((e) => e.eventName === 'commerce.whatsapp.message_replied');
    for (const r of replies) {
      const inbound = events.find(
        (e) =>
          e.correlationId === r.correlationId &&
          e.eventName === 'commerce.whatsapp.message_received' &&
          Date.parse(e.occurredAt) < Date.parse(r.occurredAt),
      );
      if (!inbound) continue;
      const latencyMs = Date.parse(r.occurredAt) - Date.parse(inbound.occurredAt);
      if (latencyMs < 2 * 60_000) continue;
      out.push(
        makeT(
          'ux.slow_response',
          'ux',
          `latência de resposta: ${Math.round(latencyMs / 1000)}s`,
          Math.min(0.7, 0.3 + latencyMs / (10 * 60_000)),
          r,
          [r.eventId, inbound.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const repetitiveQuestionDetector: Detector = {
  name: 'ux.repetitive_question',
  dimension: 'ux',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const byEntity = new Map<string, SpineEventRef[]>();
    for (const e of events) {
      if (e.eventName !== 'commerce.whatsapp.message_received') continue;
      if (!e.entityRef) continue;
      const k = `${e.entityRef.entityType}:${e.entityRef.entityId}`;
      const cur = byEntity.get(k) ?? [];
      cur.push(e);
      byEntity.set(k, cur);
    }
    for (const [, list] of byEntity) {
      if (list.length < 3) continue;
      const intents = list
        .map((e) => (e.payload?.['intent'] as string | undefined) ?? '')
        .filter(Boolean);
      const counts = new Map<string, number>();
      for (const i of intents) counts.set(i, (counts.get(i) ?? 0) + 1);
      for (const [intent, c] of counts) {
        if (c < 3) continue;
        out.push(
          makeT(
            'ux.repetitive_question',
            'ux',
            `lead repetiu ${c}× a mesma intenção (${intent})`,
            0.6,
            list[list.length - 1],
            list.map((e) => e.eventId),
            nowMs,
          ),
        );
      }
    }
    return out;
  },
};

export const frictionAtConversionDetector: Detector = {
  name: 'ux.friction_at_conversion',
  dimension: 'ux',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const declines = events.filter(
      (e) =>
        e.eventName === 'commerce.payment.declined' ||
        e.eventName === 'commerce.cart.abandoned',
    );
    if (declines.length < 3) return out;
    const lastDecline = declines[declines.length - 1];
    out.push(
      makeT(
        'ux.friction_at_conversion',
        'ux',
        `${declines.length} declines/abandons no checkout — fricção no funil`,
        0.7,
        lastDecline,
        declines.map((d) => d.eventId),
        nowMs,
      ),
    );
    return out;
  },
};

export const toneMismatchDetector: Detector = {
  name: 'ux.tone_mismatch',
  dimension: 'ux',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    for (const e of events) {
      if (e.eventName !== 'commerce.lead.objection_raised') continue;
      const objKind = (e.payload?.['objectionKind'] as string | undefined) ?? '';
      if (objKind !== 'tone' && objKind !== 'frustration') continue;
      out.push(
        makeT(
          'ux.tone_mismatch',
          'ux',
          'lead reagiu negativamente ao tom — mismatch detectado',
          0.65,
          e,
          [e.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const OPS_UX_DETECTORS: readonly Detector[] = [
  peakLoadDetector,
  humanHandoffOverdueDetector,
  queueBuildupDetector,
  slowResponseDetector,
  repetitiveQuestionDetector,
  frictionAtConversionDetector,
  toneMismatchDetector,
];
