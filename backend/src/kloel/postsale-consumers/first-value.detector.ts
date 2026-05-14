import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type {
  FirstValueDetection,
  DetectionInput,
  PostSaleDecisionControl,
} from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspaceAndEntity, latestEvent } from './postsale-consumers.types';

const DETECTION_WINDOW_DAYS = 30;
const VALUE_THRESHOLD_CONFIDENCE = 0.7;

const PROCESSOR_NAME = 'first-value-detector';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

@Injectable()
export class FirstValueDetector {
  private readonly logger = new Logger(FirstValueDetector.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public async detect(input: DetectionInput): Promise<FirstValueDetection> {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspaceAndEntity(input.events, input.workspaceId, input.entityRef);
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };

    const evidenceEventIds: string[] = [];
    const uncertaintyFlags: string[] = [];
    let confidence = 0;
    let kind: string | undefined;
    let valueObtained = false;
    let hasValueSignal = false;

    const conversion = latestEvent(wsEvents, 'commerce.lead.converted');
    if (conversion && daysSince(conversion.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.3;
      evidenceEventIds.push(conversion.eventId);
      if (!kind) {
        kind = 'conversion';
      }
    }

    const payment = latestEvent(wsEvents, 'commerce.payment.approved');
    if (payment && daysSince(payment.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.25;
      evidenceEventIds.push(payment.eventId);
    }

    const memberEnrolled = latestEvent(wsEvents, 'commerce.member_area.enrolled');
    if (memberEnrolled && daysSince(memberEnrolled.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.2;
      evidenceEventIds.push(memberEnrolled.eventId);
      kind = 'member_enrollment';
    }

    const memberProgressed = latestEvent(wsEvents, 'commerce.member_area.progressed');
    if (memberProgressed && daysSince(memberProgressed.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.15;
      evidenceEventIds.push(memberProgressed.eventId);
      if (!kind) {
        kind = 'course_progress';
      }
      hasValueSignal = true;
    }

    const dealWon = latestEvent(wsEvents, 'commerce.crm.deal_won');
    if (dealWon && daysSince(dealWon.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.2;
      evidenceEventIds.push(dealWon.eventId);
      if (!kind) {
        kind = 'deal_closed';
      }
    }

    const positiveSatisfaction = wsEvents.find(
      (event) =>
        event.eventName === 'commerce.post_sale.satisfaction_signal_observed' &&
        daysSince(event.occurredAt, nowMs) < DETECTION_WINDOW_DAYS &&
        event.payload !== undefined &&
        typeof event.payload === 'object' &&
        'sentimentLabel' in event.payload &&
        event.payload.sentimentLabel === 'positive',
    );
    if (positiveSatisfaction) {
      confidence += 0.25;
      evidenceEventIds.push(positiveSatisfaction.eventId);
      hasValueSignal = true;
      if (!kind || kind === 'conversion' || kind === 'deal_closed') {
        kind = 'positive_satisfaction';
      }
    }

    const recentRefund = latestEvent(wsEvents, 'commerce.payment.refunded');
    if (recentRefund && daysSince(recentRefund.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence -= 0.3;
      uncertaintyFlags.push('refund_nearby');
    }

    const supportEscalation = latestEvent(wsEvents, 'commerce.whatsapp.handoff_to_human');
    if (
      supportEscalation &&
      daysSince(supportEscalation.occurredAt, nowMs) < DETECTION_WINDOW_DAYS
    ) {
      confidence -= 0.1;
      uncertaintyFlags.push('support_escalation');
    }

    const negativeSatisfaction = wsEvents.find(
      (event) =>
        event.eventName === 'commerce.post_sale.satisfaction_signal_observed' &&
        daysSince(event.occurredAt, nowMs) < DETECTION_WINDOW_DAYS &&
        event.payload?.sentimentLabel === 'negative',
    );
    if (negativeSatisfaction) {
      confidence -= 0.2;
      uncertaintyFlags.push('negative_satisfaction');
    }

    const conversationCooldown = latestEvent(wsEvents, 'commerce.whatsapp.conversation_cooldown');
    if (
      conversationCooldown &&
      daysSince(conversationCooldown.occurredAt, nowMs) < DETECTION_WINDOW_DAYS
    ) {
      uncertaintyFlags.push('conversation_cooldown');
    }

    confidence = clamp(confidence, 0, 1);
    valueObtained = hasValueSignal && confidence >= VALUE_THRESHOLD_CONFIDENCE;
    const evidenceQuality =
      evidenceEventIds.length === 0 ? 'none' : hasValueSignal ? 'value_signal' : 'context_only';

    if (valueObtained) {
      await this.emitFirstValue(input.workspaceId, entityRef, kind ?? 'multi_signal');
    }

    return {
      workspaceId: input.workspaceId,
      entityRef,
      valueObtained,
      kind: valueObtained ? (kind ?? 'multi_signal') : undefined,
      evidenceEventIds,
      uncertaintyFlags,
      confidence: Math.round(confidence * 100) / 100,
      evidenceQuality,
      control: buildControl({ valueObtained, evidenceQuality, confidence }),
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private async emitFirstValue(
    workspaceId: string,
    entityRef: { readonly entityType: string; readonly entityId: string },
    kind: string,
  ): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.post_sale.first_value_obtained',
        workspaceId,
        entityRef,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: { valueKind: kind },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit first_value_obtained for ws ${workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}

function buildControl(input: {
  readonly valueObtained: boolean;
  readonly evidenceQuality: FirstValueDetection['evidenceQuality'];
  readonly confidence: number;
}): PostSaleDecisionControl {
  if (input.valueObtained) {
    return {
      riskClass: 'R1',
      delegationMode: 'allowed_alone',
      safeNextStep:
        'Mark first value as obtained and keep watching satisfaction before any testimonial, referral, or expansion prompt.',
      uncertainty:
        'First value is inferred from behavior; do not claim satisfaction until explicit satisfaction evidence appears.',
      leadOutcomeGuardrail:
        'Customer should receive continuity toward the promised result, not a new sales ask.',
      rollback:
        'If refund, churn, or negative satisfaction appears, retract first-value confidence and prioritize recovery.',
    };
  }

  if (input.evidenceQuality === 'context_only') {
    return {
      riskClass: 'R1',
      delegationMode: 'silent_monitoring',
      safeNextStep:
        'Do not emit first value yet; wait for member progress, positive satisfaction, or another concrete value signal.',
      uncertainty:
        `Payment/conversion context reached confidence ${Math.round(input.confidence * 100)}%, but value delivery is not evidenced.`,
      leadOutcomeGuardrail:
        'Avoid congratulating or upselling the customer before there is evidence they received value.',
      rollback:
        'Keep the customer in activation monitoring and switch to owner-reviewed help if activation stalls.',
    };
  }

  if (input.evidenceQuality === 'value_signal') {
    return {
      riskClass: 'R1',
      delegationMode: 'silent_monitoring',
      safeNextStep:
        'Do not emit first value yet; wait for member progress to stabilize or satisfaction risk to clear before marking value obtained.',
      uncertainty:
        `Value evidence exists, but confidence is only ${Math.round(input.confidence * 100)}% after risk signals.`,
      leadOutcomeGuardrail:
        'Customer should receive recovery or support before Kloel treats the post-sale as successful.',
      rollback:
        'Keep anti-remorse and human support ahead of testimonial, referral, or expansion prompts.',
    };
  }

  return {
    riskClass: 'R1',
    delegationMode: 'silent_monitoring',
    safeNextStep:
      'Stay silent and keep collecting post-sale evidence before declaring first value.',
    uncertainty: 'No post-sale value evidence exists in the observed events.',
    leadOutcomeGuardrail:
      'Customer should not receive an automated claim of success without proof.',
    rollback: 'Reassess when activation, progress, or satisfaction evidence appears.',
  };
}
