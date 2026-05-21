import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type {
  ChurnRiskAssessment,
  ChurnSignalKind,
  DetectionInput,
  PostSaleDecisionControl,
} from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspaceAndEntity } from './postsale-consumers.types';

const RISK_WINDOW_DAYS = 30;
const CRITICAL_INACTIVITY_DAYS = 30;
const HIGH_INACTIVITY_DAYS = 14;
const MODERATE_INACTIVITY_DAYS = 7;
const OBJECTION_RECOVERY_LOOKBACK_HOURS = 48;
const OBJECTION_RECOVERY_CHURN_WEIGHT = 0.2;

const PROCESSOR_NAME = 'churn-risk-detector';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

@Injectable()
export class ChurnRiskDetector {
  private readonly logger = new Logger(ChurnRiskDetector.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public async assess(input: DetectionInput): Promise<ChurnRiskAssessment> {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspaceAndEntity(input.events, input.workspaceId, input.entityRef);
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
    const contributingSignals: ChurnSignalKind[] = [];
    let riskProbability = 0;

    let daysSinceLastActivity = Infinity;
    for (const e of wsEvents) {
      const d = daysSince(e.occurredAt, nowMs);
      if (d < daysSinceLastActivity) {
        daysSinceLastActivity = d;
      }
    }
    if (!Number.isFinite(daysSinceLastActivity)) {
      daysSinceLastActivity = 0;
    }

    if (daysSinceLastActivity > CRITICAL_INACTIVITY_DAYS) {
      riskProbability += 0.4;
      contributingSignals.push('inactivity');
    } else if (daysSinceLastActivity > HIGH_INACTIVITY_DAYS) {
      riskProbability += 0.25;
      contributingSignals.push('inactivity');
    } else if (daysSinceLastActivity > MODERATE_INACTIVITY_DAYS) {
      riskProbability += 0.1;
      contributingSignals.push('inactivity');
    }

    const handoffCount = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.whatsapp.handoff_to_human' &&
        daysSince(e.occurredAt, nowMs) < RISK_WINDOW_DAYS,
    ).length;
    if (handoffCount >= 3) {
      riskProbability += 0.2;
      contributingSignals.push('handoff_repeat');
    }

    const refundCount = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.payment.refunded' &&
        daysSince(e.occurredAt, nowMs) < RISK_WINDOW_DAYS,
    ).length;
    if (refundCount > 0) {
      riskProbability += 0.2;
      contributingSignals.push('refund_request');
    }

    const declinedCount = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.payment.declined' &&
        daysSince(e.occurredAt, nowMs) < RISK_WINDOW_DAYS,
    ).length;
    if (declinedCount > 0) {
      riskProbability += 0.15;
      contributingSignals.push('declined_payment');
    }

    const satisfaction = this.findLastEvent(
      wsEvents,
      'commerce.post_sale.satisfaction_signal_observed',
    );
    if (
      satisfaction &&
      satisfaction.payload?.['sentimentLabel'] === 'negative' &&
      daysSince(satisfaction.occurredAt, nowMs) < RISK_WINDOW_DAYS
    ) {
      riskProbability += 0.15;
      contributingSignals.push('negative_nps');
    }

    const dropout = this.findLastEvent(wsEvents, 'commerce.member_area.dropped_out');
    if (dropout && daysSince(dropout.occurredAt, nowMs) < RISK_WINDOW_DAYS) {
      riskProbability += 0.15;
      contributingSignals.push('member_dropout');
    }

    const payment = this.findLastEvent(wsEvents, 'commerce.payment.approved');
    const hoursSincePayment = payment ? daysSince(payment.occurredAt, nowMs) * 24 : Infinity;
    const firstValue = this.findLastEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    const activationStarted = this.findLastEvent(wsEvents, 'commerce.post_sale.activation_started');
    const missingFirstValue =
      !firstValue || daysSince(firstValue.occurredAt, nowMs) > RISK_WINDOW_DAYS;
    const objectionRecoveryDetected =
      payment !== undefined && hasRecentPriorObjection(wsEvents, payment, entityRef);
    if (missingFirstValue && hoursSincePayment > 24) {
      const activationStalled =
        activationStarted !== undefined && daysSince(activationStarted.occurredAt, nowMs) > 5;
      riskProbability += activationStalled || hoursSincePayment > 24 * 7 ? 0.2 : 0.05;
      if (activationStalled || hoursSincePayment > 24 * 7) {
        contributingSignals.push('first_value_missing');
      }
      if (objectionRecoveryDetected) {
        riskProbability += OBJECTION_RECOVERY_CHURN_WEIGHT;
        contributingSignals.push('recent_objection_recovery');
      }
    }

    riskProbability = clamp(riskProbability, 0, 1);

    const riskLevel: ChurnRiskAssessment['riskLevel'] =
      riskProbability >= 0.7
        ? 'critical'
        : riskProbability >= 0.5
          ? 'high'
          : riskProbability >= 0.3
            ? 'moderate'
            : 'low';

    const primarySignal = contributingSignals.length > 0 ? contributingSignals[0] : undefined;

    if (riskLevel === 'high' || riskLevel === 'critical') {
      await this.emitRisk(input.workspaceId, entityRef, riskProbability, contributingSignals);
    }

    return {
      workspaceId: input.workspaceId,
      entityRef,
      riskLevel,
      riskProbability: Math.round(riskProbability * 100) / 100,
      primarySignal,
      contributingSignals,
      daysSinceLastActivity: Math.round(daysSinceLastActivity),
      control: buildControl(riskLevel, contributingSignals),
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private findLastEvent(
    events: readonly {
      eventName: string;
      occurredAt: string;
      payload?: Readonly<Record<string, unknown>>;
    }[],
    name: string,
  ):
    | { eventName: string; occurredAt: string; payload?: Readonly<Record<string, unknown>> }
    | undefined {
    let last:
      | { eventName: string; occurredAt: string; payload?: Readonly<Record<string, unknown>> }
      | undefined;
    for (const e of events) {
      if (e.eventName !== name) {
        continue;
      }
      if (!last || e.occurredAt > last.occurredAt) {
        last = e;
      }
    }
    return last;
  }

  private async emitRisk(
    workspaceId: string,
    entityRef: { readonly entityType: string; readonly entityId: string },
    probability: number,
    signals: readonly ChurnSignalKind[],
  ): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.post_sale.churn_risk_detected',
        workspaceId,
        entityRef,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: { riskProbability: probability, signals },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit churn_risk_detected for ws ${workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}

function hasRecentPriorObjection(
  events: readonly {
    eventName: string;
    occurredAt: string;
    entityRef?: { readonly entityType: string; readonly entityId: string };
  }[],
  paymentEvent: {
    occurredAt: string;
    entityRef?: { readonly entityType: string; readonly entityId: string };
  },
  entityRef: { readonly entityType: string; readonly entityId: string },
): boolean {
  const paymentTs = Date.parse(paymentEvent.occurredAt);
  if (!Number.isFinite(paymentTs)) {
    return false;
  }

  return events.some((event) => {
    if (
      event.eventName !== 'commerce.lead.objection_raised' ||
      event.entityRef?.entityType !== entityRef.entityType ||
      event.entityRef.entityId !== entityRef.entityId
    ) {
      return false;
    }

    const objectionTs = Date.parse(event.occurredAt);
    if (!Number.isFinite(objectionTs) || objectionTs >= paymentTs) {
      return false;
    }

    const hoursBeforePayment = (paymentTs - objectionTs) / (1000 * 60 * 60);
    return hoursBeforePayment <= OBJECTION_RECOVERY_LOOKBACK_HOURS;
  });
}

function buildControl(
  riskLevel: ChurnRiskAssessment['riskLevel'],
  signals: readonly ChurnSignalKind[],
): PostSaleDecisionControl {
  if (riskLevel === 'high' || riskLevel === 'critical') {
    return {
      riskClass: 'R2',
      delegationMode: 'owner_review',
      safeNextStep:
        'Prepare a human-reviewed retention check-in focused on help, context, and expectation repair.',
      uncertainty: `Churn risk is inferred from ${signals.length > 0 ? signals.join(', ') : 'weak'} signals, not an observed cancellation request.`,
      leadOutcomeGuardrail:
        'The customer must feel helped and heard; do not pressure, guilt, discount-first, or imply blame.',
      rollback:
        'Pause outreach and escalate to a human if the customer shows frustration, refund intent, or sensitive context.',
    };
  }

  return {
    riskClass: 'R1',
    delegationMode: 'silent_monitoring',
    safeNextStep: 'Keep monitoring and avoid churn outreach until risk evidence becomes stronger.',
    uncertainty:
      riskLevel === 'moderate'
        ? signals.includes('recent_objection_recovery')
          ? 'Moderate risk includes a recently recovered objection without first-value proof; treat it as a listening signal, not permission to sell.'
          : 'Moderate risk is directional and needs more evidence before outreach.'
        : 'No meaningful churn evidence is present.',
    leadOutcomeGuardrail: signals.includes('recent_objection_recovery')
      ? 'Do not reopen the prior objection as pressure; wait for stronger help, support, first-value, or explicit concern evidence.'
      : 'Do not turn weak churn signals into a message; silence is preferred over anxious follow-up.',
    rollback: 'Drop the churn action and keep the customer in normal post-sale support.',
  };
}
