import { Injectable } from '@nestjs/common';
import type {
  DetectionInput,
  PostSaleDecisionControl,
  TestimonialReadiness,
} from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspaceAndEntity, latestEvent } from './postsale-consumers.types';

const REFERRAL_COOLDOWN_DAYS = 30;
const MIN_PURCHASE_DAYS = 5;
const MAX_REFERRAL_PROMPTS = 3;

@Injectable()
export class ReferralPromptTimingAdvisor {
  public assess(input: DetectionInput): TestimonialReadiness {
    const nowMs = input.nowMs ?? Date.now();
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
    const wsEvents = filterByWorkspaceAndEntity(input.events, input.workspaceId, input.entityRef);
    const reasons: string[] = [];
    let readinessScore = 0;

    const payment = latestEvent(wsEvents, 'commerce.payment.approved');
    if (!payment) {
      return buildResult(input.workspaceId, entityRef, false, 0, ['no_purchase'], 'silent', nowMs);
    }

    const daysSincePayment = daysSince(payment.occurredAt, nowMs);
    if (daysSincePayment < MIN_PURCHASE_DAYS) {
      reasons.push('too_soon_for_referral');
      return buildResult(input.workspaceId, entityRef, false, 0, reasons, 'silent', nowMs);
    }

    if (hasRecentPostSaleRisk(wsEvents, nowMs)) {
      reasons.push('recent_post_sale_risk');
      return buildResult(input.workspaceId, entityRef, false, 0, reasons, 'silent', nowMs);
    }

    const priorPrompts = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.post_sale.testimonial_requested' &&
        daysSince(e.occurredAt, nowMs) < REFERRAL_COOLDOWN_DAYS,
    ).length;
    if (priorPrompts >= MAX_REFERRAL_PROMPTS) {
      reasons.push('max_referral_prompts_reached');
      return buildResult(input.workspaceId, entityRef, false, 0.2, reasons, 'silent', nowMs);
    }

    const firstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    if (!firstValue || daysSince(firstValue.occurredAt, nowMs) >= REFERRAL_COOLDOWN_DAYS) {
      reasons.push('no_first_value_evidence');
      return buildResult(input.workspaceId, entityRef, false, 0, reasons, 'silent', nowMs);
    }

    const satisfaction = latestEvent(wsEvents, 'commerce.post_sale.satisfaction_signal_observed');
    if (
      !satisfaction ||
      daysSince(satisfaction.occurredAt, nowMs) >= REFERRAL_COOLDOWN_DAYS ||
      satisfaction.payload?.['sentimentLabel'] !== 'positive'
    ) {
      reasons.push('no_positive_satisfaction_evidence');
      return buildResult(input.workspaceId, entityRef, false, 0, reasons, 'silent', nowMs);
    }

    readinessScore += 0.2;
    readinessScore += 0.3;
    reasons.push('value_experienced');
    readinessScore += 0.35;
    reasons.push('positive_satisfaction');

    const hasRecentPayment = wsEvents.some(
      (e) => e.eventName === 'commerce.payment.approved' && daysSince(e.occurredAt, nowMs) < 90,
    );
    if (hasRecentPayment) {
      readinessScore += 0.15;
      reasons.push('active_payments');
    }

    readinessScore = clamp(readinessScore, 0, 1);
    const ready = readinessScore >= 0.55;
    const channel =
      readinessScore >= 0.7 ? 'whatsapp' : readinessScore >= 0.55 ? 'email' : 'silent';

    return buildResult(
      input.workspaceId,
      entityRef,
      ready,
      readinessScore,
      reasons,
      channel,
      nowMs,
    );
  }
}

function hasRecentPostSaleRisk(
  events: readonly { readonly eventName: string; readonly occurredAt: string; readonly payload?: Readonly<Record<string, unknown>> }[],
  nowMs: number,
): boolean {
  return events.some((event) => {
    if (daysSince(event.occurredAt, nowMs) > REFERRAL_COOLDOWN_DAYS) {
      return false;
    }

    if (
      event.eventName === 'commerce.payment.refunded' ||
      event.eventName === 'commerce.lead.objection_raised' ||
      event.eventName === 'commerce.post_sale.churn_risk_detected'
    ) {
      return true;
    }

    return (
      event.eventName === 'commerce.post_sale.satisfaction_signal_observed' &&
      event.payload?.['sentimentLabel'] === 'negative'
    );
  });
}

function buildResult(
  workspaceId: string,
  entityRef: { readonly entityType: string; readonly entityId: string },
  ready: boolean,
  score: number,
  reasons: readonly string[],
  channel: TestimonialReadiness['suggestedChannel'],
  nowMs: number,
): TestimonialReadiness {
  const control = buildControl(ready, score, reasons);
  return {
    workspaceId,
    entityRef,
    ready,
    readinessScore: Math.round(score * 100) / 100,
    reasons,
    suggestedChannel: channel,
    control,
    assessedAt: new Date(nowMs).toISOString(),
  };
}

function buildControl(
  ready: boolean,
  score: number,
  reasons: readonly string[],
): PostSaleDecisionControl {
  void score;
  if (ready) {
    return {
      riskClass: 'R2',
      delegationMode: 'owner_review',
      safeNextStep: 'Draft a referral ask for owner review only after confirmed value and positive satisfaction.',
      uncertainty:
        'Referral readiness is inferred from behavior and satisfaction, not an explicit customer intent to refer.',
      leadOutcomeGuardrail:
        'The customer must feel free to decline; do not create obligation, pressure, or social debt.',
      rollback:
        'Cancel the referral ask and return to silent monitoring if there is hesitation, objection, fatigue, or unresolved support.',
    };
  }

  return {
    riskClass: 'R1',
    delegationMode: 'silent_monitoring',
    safeNextStep: 'Do not ask for a referral; prioritize value delivery and satisfaction evidence.',
    uncertainty:
      reasons.length > 0
        ? `Blocked by ${reasons.join(', ')}.`
        : 'There is not enough evidence for a referral ask.',
    leadOutcomeGuardrail:
      'Do not convert weak satisfaction into a growth ask; customer trust comes first.',
    rollback: 'Keep referral hidden and continue normal post-sale support.',
  };
}
