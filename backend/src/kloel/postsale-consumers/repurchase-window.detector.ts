import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { RepurchaseWindow, DetectionInput, PostSaleDecisionControl } from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspaceAndEntity, latestEvent } from './postsale-consumers.types';

const WINDOW_MIN_DAYS = 14;
const WINDOW_MAX_DAYS = 90;
const CONSUMPTION_WINDOW_DAYS = 30;

const PROCESSOR_NAME = 'repurchase-window-detector';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

@Injectable()
export class RepurchaseWindowDetector {
  private readonly logger = new Logger(RepurchaseWindowDetector.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public async detect(input: DetectionInput): Promise<RepurchaseWindow> {
    const nowMs = input.nowMs ?? Date.now();
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
    const wsEvents = filterByWorkspaceAndEntity(input.events, input.workspaceId, input.entityRef);
    const signals: string[] = [];
    let windowScore = 0;

    const payment = latestEvent(wsEvents, 'commerce.payment.approved');
    if (!payment) {
      return build(input.workspaceId, entityRef, false, 0, [], [], nowMs);
    }

    const daysSincePayment = daysSince(payment.occurredAt, nowMs);
    if (daysSincePayment < WINDOW_MIN_DAYS) {
      signals.push('too_early');
      return build(input.workspaceId, entityRef, false, 0, signals, [], nowMs);
    }
    if (daysSincePayment > WINDOW_MAX_DAYS) {
      signals.push('window_expired');
      return build(input.workspaceId, entityRef, false, 0.1, signals, [], nowMs);
    }

    windowScore += 0.25;
    signals.push('within_time_window');

    const satisfaction = latestEvent(wsEvents, 'commerce.post_sale.satisfaction_signal_observed');
    let hasPositiveSatisfaction = false;
    if (satisfaction) {
      const sentiment = satisfaction.payload?.['sentimentLabel'];
      if (sentiment === 'positive') {
        hasPositiveSatisfaction = true;
        windowScore += 0.3;
        signals.push('positive_satisfaction');
      } else if (sentiment === 'negative') {
        windowScore -= 0.2;
        signals.push('negative_satisfaction');
      }
    }

    const memberProgress = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.member_area.progressed' &&
        daysSince(e.occurredAt, nowMs) < CONSUMPTION_WINDOW_DAYS,
    ).length;
    if (memberProgress >= 2) {
      windowScore += 0.2;
      signals.push('active_consumption');
    }

    const memberDropout = wsEvents.filter(
      (e) =>
        e.eventName === 'commerce.member_area.dropped_out' &&
        daysSince(e.occurredAt, nowMs) < CONSUMPTION_WINDOW_DAYS,
    ).length;
    if (memberDropout > 0) {
      windowScore -= 0.2;
      signals.push('member_dropout');
    }

    const firstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    const hasRecentFirstValue =
      firstValue !== undefined && daysSince(firstValue.occurredAt, nowMs) < CONSUMPTION_WINDOW_DAYS;
    if (hasRecentFirstValue) {
      windowScore += 0.25;
      signals.push('value_obtained');
    }

    const hasRecentObjection = wsEvents.some(
      (e) =>
        e.eventName === 'commerce.lead.objection_raised' &&
        daysSince(e.occurredAt, nowMs) < WINDOW_MAX_DAYS,
    );
    if (hasRecentObjection) {
      signals.push('recent_objection_guardrail');
    }
    if (!hasRecentFirstValue) {
      signals.push('missing_first_value_guardrail');
    }
    if (!hasPositiveSatisfaction) {
      signals.push('missing_positive_satisfaction_guardrail');
    }

    windowScore = clamp(windowScore, 0, 1);
    const windowOpen =
      windowScore >= 0.5 &&
      hasRecentFirstValue &&
      hasPositiveSatisfaction &&
      !hasRecentObjection;

    if (windowOpen) {
      await this.emitWindow(input.workspaceId, entityRef, signals);
    }

    return build(input.workspaceId, entityRef, windowOpen, windowScore, signals, [], nowMs);
  }

  private async emitWindow(
    workspaceId: string,
    entityRef: { readonly entityType: string; readonly entityId: string },
    signals: readonly string[],
  ): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.post_sale.repurchase_window_opened',
        workspaceId,
        entityRef,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: { signals },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit repurchase_window_opened for ws ${workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}

function build(
  workspaceId: string,
  entityRef: { readonly entityType: string; readonly entityId: string },
  windowOpen: boolean,
  score: number,
  signals: readonly string[],
  productIds: readonly string[],
  nowMs: number,
): RepurchaseWindow {
  return {
    workspaceId,
    entityRef,
    windowOpen,
    windowScore: Math.round(score * 100) / 100,
    suggestedProductIds: productIds,
    signals,
    control: buildControl(windowOpen, signals),
    assessedAt: new Date(nowMs).toISOString(),
  };
}

function buildControl(windowOpen: boolean, signals: readonly string[]): PostSaleDecisionControl {
  if (!windowOpen) {
    const uncertainty =
      signals.includes('recent_objection_guardrail')
        ? 'Customer has recent objection recovery evidence; repurchase timing may still feel like pressure.'
        : signals.includes('missing_first_value_guardrail')
          ? 'Repurchase window is closed because first value has not been evidenced for this customer.'
          : signals.includes('missing_positive_satisfaction_guardrail')
            ? 'Repurchase window is closed because positive satisfaction is not evidenced for this customer.'
            : 'Repurchase window is closed until timing and value evidence mature.';

    return {
      riskClass: 'R1',
      delegationMode: 'silent_monitoring',
      safeNextStep: 'Keep the repurchase window closed and continue observing post-sale value.',
      uncertainty,
      leadOutcomeGuardrail: 'Do not create a repurchase prompt from weak, cross-customer, or recently contested evidence.',
      rollback: 'If a repurchase prompt was prepared from this signal, cancel it and return to post-sale support.',
    };
  }

  return {
    riskClass: 'R2',
    delegationMode: 'owner_review',
    safeNextStep: 'Prepare repurchase context for owner review; do not send an offer automatically.',
    uncertainty: 'Repurchase readiness is inferred from first value, positive satisfaction, and timing evidence.',
    leadOutcomeGuardrail: 'Frame any repurchase as optional next value, not urgency or pressure.',
    rollback: 'Owner can close the window, discard the offer draft, or wait for stronger satisfaction evidence.',
  };
}
