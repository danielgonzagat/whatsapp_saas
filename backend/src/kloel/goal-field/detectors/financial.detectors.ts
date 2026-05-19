import type { SpineEventRef } from '../../mind/mind.types';
import { Detector, makeTensionId, Tension } from '../goal-field.types';

/**
 * UTP-GOAL-FIN-001..003 — financial-dimension detectors.
 *
 * Detects: products without margin guard, churn-risk without retention
 * action, discount without justification.
 */

function finTension(
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
    dimension: 'financial',
    ...(e?.workspaceId !== undefined ? { workspaceId: e.workspaceId } : {}),
    ...(e?.entityRef !== undefined ? { entityRef: e.entityRef } : {}),
    severity,
    description,
    detectedAt: new Date(nowMs).toISOString(),
    evidenceEventIds,
  };
  return t;
}

const productWithoutMarginGuardDetector: Detector = {
  name: 'financial.product_without_margin_guard',
  dimension: 'financial',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const approvals = events.filter((e) => e.eventName === 'commerce.payment.approved');
    for (const a of approvals) {
      const margin = Number(a.payload?.['marginPct'] ?? Number.NaN);
      if (Number.isFinite(margin) && margin >= 0) continue;
      out.push(
        finTension(
          'financial.product_without_margin_guard',
          'pagamento aprovado sem marginPct anexado — sem guarda financeira',
          0.7,
          a,
          [a.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

const churnRiskWithoutRetentionDetector: Detector = {
  name: 'financial.churn_risk_without_retention',
  dimension: 'financial',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const churns = events.filter((e) => e.eventName === 'commerce.post_sale.churn_risk_detected');
    for (const c of churns) {
      const retention = events.some(
        (e) =>
          e.correlationId === c.correlationId &&
          (e.eventName === 'commerce.whatsapp.message_replied' ||
            e.eventName === 'commerce.crm.next_step_defined') &&
          Date.parse(e.occurredAt) > Date.parse(c.occurredAt),
      );
      if (retention) continue;
      const ageHours = (nowMs - Date.parse(c.occurredAt)) / (60 * 60 * 1000);
      if (ageHours < 1) continue;
      out.push(
        finTension(
          'financial.churn_risk_without_retention',
          'churn-risk detectado sem ação de retenção dentro de 1h',
          0.85,
          c,
          [c.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const discountWithoutJustificationDetector: Detector = {
  name: 'financial.discount_without_justification',
  dimension: 'financial',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const discounts = events.filter((e) => Number(e.payload?.['discountCents'] ?? 0) > 0);
    for (const d of discounts) {
      const reason = d.payload?.['discountReason'];
      if (typeof reason === 'string' && reason.length > 0) continue;
      out.push(
        finTension(
          'financial.discount_without_justification',
          `desconto de ${d.payload?.['discountCents']} centavos aplicado sem reason`,
          0.6,
          d,
          [d.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const FINANCIAL_DETECTORS: readonly Detector[] = [
  productWithoutMarginGuardDetector,
  churnRiskWithoutRetentionDetector,
  discountWithoutJustificationDetector,
];
