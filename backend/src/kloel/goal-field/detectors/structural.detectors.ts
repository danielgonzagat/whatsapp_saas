import type { SpineEventRef } from '../../mind/mind.types';
import { Detector, makeTensionId, Tension } from '../goal-field.types';

/**
 * UTP-GOAL-STRUCT-001..004 — structural-dimension detectors.
 *
 * These look for product structure breakdowns observable from the spine:
 * UI events without persistence, flow events without validation, actions
 * without audit, backend operations without surface emission (B17).
 */

function structTension(
  name: string,
  description: string,
  severity: number,
  e: SpineEventRef | undefined,
  evidenceEventIds: readonly string[],
  nowMs: number,
): Tension {
  const t: Tension = {
    tensionId: makeTensionId(),
    detectorName: name,
    dimension: 'structural',
    ...(e?.workspaceId !== undefined ? { workspaceId: e.workspaceId } : {}),
    ...(e?.entityRef !== undefined ? { entityRef: e.entityRef } : {}),
    severity,
    description,
    detectedAt: new Date(nowMs).toISOString(),
    evidenceEventIds,
  };
  return t;
}

/**
 * STRUCT-001: UI emits an action event but no commerce.* event of the
 * corresponding type is observed in the same correlation. Indicates the UI
 * is firing without backend persistence.
 */
export const uiWithoutPersistenceDetector: Detector = {
  name: 'structural.ui_without_persistence',
  dimension: 'structural',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const uiActions = events.filter(
      (e) => (e.payload?.['source'] as string | undefined) === 'frontend',
    );
    for (const ui of uiActions) {
      const persisted = events.some(
        (e) =>
          e !== ui &&
          e.correlationId &&
          e.correlationId === ui.correlationId &&
          (e.eventName.startsWith('commerce.') || e.eventName.startsWith('lineage.')),
      );
      if (persisted) continue;
      out.push(
        structTension(
          'structural.ui_without_persistence',
          'evento de UI sem evento de domínio correspondente',
          0.65,
          ui,
          [ui.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

/**
 * STRUCT-002: a flow step started but never completed (no terminal event
 * in the same correlation within window).
 */
export const flowWithoutValidationDetector: Detector = {
  name: 'structural.flow_without_validation',
  dimension: 'structural',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const flowStarts = events.filter(
      (e) => e.eventName === 'commerce.cart.checkout_initiated',
    );
    for (const fs of flowStarts) {
      const closed = events.some(
        (e) =>
          e.correlationId &&
          e.correlationId === fs.correlationId &&
          (e.eventName === 'commerce.payment.approved' ||
            e.eventName === 'commerce.payment.declined' ||
            e.eventName === 'commerce.cart.abandoned'),
      );
      if (closed) continue;
      const ageMin = (nowMs - Date.parse(fs.occurredAt)) / 60000;
      if (ageMin < 30) continue;
      out.push(
        structTension(
          'structural.flow_without_validation',
          'flow iniciado sem terminal observado dentro da janela',
          0.6,
          fs,
          [fs.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

/**
 * STRUCT-003: action that should generate audit (e.g. owner_assigned)
 * lacks corresponding audit log evidence.
 */
export const actionWithoutAuditDetector: Detector = {
  name: 'structural.action_without_audit',
  dimension: 'structural',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const auditableActions = events.filter(
      (e) =>
        e.eventName === 'commerce.crm.owner_assigned' ||
        e.eventName === 'commerce.crm.next_step_defined' ||
        e.eventName === 'commerce.payment.refunded',
    );
    for (const a of auditableActions) {
      const audit = events.some(
        (e) =>
          e.correlationId === a.correlationId &&
          e !== a &&
          ((e.payload?.['kind'] as string | undefined) === 'audit_log' ||
            e.eventName.includes('audit')),
      );
      if (audit) continue;
      out.push(
        structTension(
          'structural.action_without_audit',
          `${a.eventName} sem audit log correspondente`,
          0.55,
          a,
          [a.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

/**
 * STRUCT-004: surface (B17) does not emit canonical events at all in the
 * window — surface is "silent". Detected when a surface known to exist
 * has zero events in the window.
 */
export const backendWithoutSurfaceDetector: Detector = {
  name: 'structural.backend_without_surface',
  dimension: 'structural',
  detect: (events, nowMs) => {
    const knownSurfaces = [
      'commerce.cart.',
      'commerce.payment.',
      'commerce.whatsapp.',
      'commerce.crm.',
      'commerce.kyc.',
    ];
    const out: Tension[] = [];
    for (const surface of knownSurfaces) {
      const any = events.some((e) => e.eventName.startsWith(surface));
      if (any) continue;
      out.push(
        structTension(
          'structural.backend_without_surface',
          `superfície ${surface}* não emitiu nenhum evento na janela`,
          0.4,
          undefined,
          [],
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const STRUCTURAL_DETECTORS: readonly Detector[] = [
  uiWithoutPersistenceDetector,
  flowWithoutValidationDetector,
  actionWithoutAuditDetector,
  backendWithoutSurfaceDetector,
];
