import { Injectable, Logger, Optional } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { AntiRemorseService } from './anti-remorse.service';
import { ActivationCompanionService } from './activation-companion.service';
import { FirstValueDetector } from './first-value.detector';
import { daysSince, filterByWorkspaceAndEntity, latestEvent } from './postsale-consumers.types';
import type {
  DetectionInput,
  NoRegretPhase,
  NoRegretState,
  PostSaleDecisionControl,
} from './postsale-consumers.types';

const POST_SALE_WINDOW_HOURS = 24;
const OBJECTION_RECOVERY_LOOKBACK_HOURS = 48;
const PROCESSOR_NAME = 'no-regret-pipeline';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';
const AUTORUN_EVENT_NAMES = new Set([
  'commerce.payment.approved',
  'commerce.post_sale.delivery_completed',
  'commerce.post_sale.activation_started',
  'commerce.post_sale.first_value_obtained',
]);

@Injectable()
export class NoRegretPipelineService {
  private readonly logger = new Logger(NoRegretPipelineService.name);

  public constructor(
    private readonly antiRemorse: AntiRemorseService,
    private readonly activation: ActivationCompanionService,
    private readonly firstValue: FirstValueDetector,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {
    this.spine?.subscribe((event) => {
      if (!AUTORUN_EVENT_NAMES.has(event.eventName)) {
        return;
      }
      if (
        event.eventName === 'commerce.post_sale.first_value_obtained' &&
        event.truthMode !== 'observed'
      ) {
        return;
      }
      if (event.workspaceId === undefined || event.entityRef === undefined) {
        return;
      }
      void this.assess({
        events: this.spine?.recentEventsAsRef() ?? [],
        workspaceId: event.workspaceId,
        entityRef: event.entityRef,
      }).catch((err: unknown) => {
        this.logger.error(
          `post-sale autorun failed for ${event.eventName}: ${(err as Error)?.message ?? String(err)}`,
        );
      });
    });
  }

  public async assess(input: DetectionInput, refundRisk?: number): Promise<NoRegretState> {
    const nowMs = input.nowMs ?? Date.now();
    const initialEvents = filterByWorkspaceAndEntity(input.events, input.workspaceId, input.entityRef);
    const initialPayment = latestEvent(initialEvents, 'commerce.payment.approved');
    const scopedEntityRef = input.entityRef ?? initialPayment?.entityRef;
    const scopedInput = scopedEntityRef === undefined ? input : { ...input, entityRef: scopedEntityRef };
    const antiRemorse = this.antiRemorse.assess(scopedInput, refundRisk);
    const activation = this.activation.track(scopedInput);
    const firstValue = await this.firstValue.detect(scopedInput);
    const wsEvents = filterByWorkspaceAndEntity(
      scopedInput.events,
      scopedInput.workspaceId,
      scopedInput.entityRef,
    );
    const payment = latestEvent(wsEvents, 'commerce.payment.approved');
    const entityRef = scopedInput.entityRef ?? payment?.entityRef ?? antiRemorse.entityRef;
    const explicitFirstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    const firstValueObtained = firstValue.valueObtained || explicitFirstValue !== undefined;
    const firstValueEvidenceEventIds = uniqueEventIds(
      firstValue.evidenceEventIds,
      explicitFirstValue?.eventId,
    );
    const firstValueKind =
      firstValue.kind ?? (explicitFirstValue === undefined ? undefined : 'explicit_first_value');
    const effectiveFirstValue =
      firstValueObtained === firstValue.valueObtained
        ? firstValue
        : {
            ...firstValue,
            valueObtained: true,
            kind: firstValueKind,
            evidenceEventIds: firstValueEvidenceEventIds,
            evidenceQuality: 'value_signal' as const,
          };
    const explicitActivationStarted =
      latestEvent(wsEvents, 'commerce.post_sale.activation_started') !== undefined;
    const activationLikely =
      activation.activationLikely ||
      (explicitActivationStarted && effectiveFirstValue.valueObtained);
    const priorObjectionRecoveryDetected =
      antiRemorse.objectionRecoveryDetected ||
      (payment !== undefined &&
        hasRecentPriorObjection(wsEvents, scopedInput.workspaceId, payment, entityRef));
    const positiveSatisfactionObserved = hasPositiveSatisfaction(
      wsEvents,
      scopedInput.workspaceId,
      entityRef,
    );
    const phase = classifyPhase({
      hasPayment: payment !== undefined,
      hoursSincePayment: payment ? daysSince(payment.occurredAt, nowMs) * 24 : undefined,
      activationStarted: activation.completedSteps > 0,
      activationLikely,
      stalledDays: activation.stalledDays,
      firstValueObtained: effectiveFirstValue.valueObtained,
      positiveSatisfactionObserved,
      antiRemorseAction: antiRemorse.recommendedAction,
      objectionRecoveryDetected: priorObjectionRecoveryDetected,
    });
    const isNoRegret = phase === 'no_regret_confirmed';
    if (isNoRegret) {
      await this.emitNoRegretConfirmed(scopedInput.workspaceId, entityRef, {
        firstValueKind,
        firstValueEvidenceEventIds,
        activationEvidenceEventIds: activation.evidenceEventIds,
        remorseRiskScore: antiRemorse.remorseRiskScore,
      });
    }

    return {
      workspaceId: scopedInput.workspaceId,
      entityRef,
      phase,
      isNoRegret,
      antiRemorse,
      activation,
      firstValue: effectiveFirstValue,
      control: buildControl(phase),
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private async emitNoRegretConfirmed(
    workspaceId: string,
    entityRef: { readonly entityType: string; readonly entityId: string },
    payload: {
      readonly firstValueKind: string | undefined;
      readonly firstValueEvidenceEventIds: readonly string[];
      readonly activationEvidenceEventIds: readonly string[];
      readonly remorseRiskScore: number;
    },
  ): Promise<void> {
    if (!this.spine) {
      return;
    }
    const alreadyConfirmed = this.spine.recentEvents().some((event) => {
      return (
        event.eventName === 'commerce.post_sale.no_regret_confirmed' &&
        event.workspaceId === workspaceId &&
        event.entityRef?.entityType === entityRef.entityType &&
        event.entityRef.entityId === entityRef.entityId
      );
    });
    if (alreadyConfirmed) {
      return;
    }
    try {
      await this.spine.emit({
        eventName: 'commerce.post_sale.no_regret_confirmed',
        workspaceId,
        entityRef,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: {
          firstValueKind: payload.firstValueKind ?? 'multi_signal',
          firstValueEvidenceEventIds: payload.firstValueEvidenceEventIds,
          activationEvidenceEventIds: payload.activationEvidenceEventIds,
          remorseRiskScore: payload.remorseRiskScore,
          guardrail: 'not_a_testimonial_or_satisfaction_claim',
        },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit no_regret_confirmed for ws ${workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}

function uniqueEventIds(ids: readonly string[], extraId: string | undefined): string[] {
  return Array.from(new Set(extraId === undefined ? ids : [...ids, extraId]));
}

function classifyPhase(input: {
  readonly hasPayment: boolean;
  readonly hoursSincePayment: number | undefined;
  readonly activationStarted: boolean;
  readonly activationLikely: boolean;
  readonly stalledDays: number;
  readonly firstValueObtained: boolean;
  readonly positiveSatisfactionObserved: boolean;
  readonly antiRemorseAction: 'send_reassurance' | 'send_welcome' | 'monitor' | 'none';
  readonly objectionRecoveryDetected: boolean;
}): NoRegretPhase {
  if (!input.hasPayment) {
    return 'no_payment_observed';
  }

  if (input.antiRemorseAction === 'send_reassurance') {
    return 'recovery_needed';
  }

  if (
    input.firstValueObtained &&
    input.activationLikely &&
    (!input.objectionRecoveryDetected || input.positiveSatisfactionObserved)
  ) {
    return 'no_regret_confirmed';
  }

  if (input.objectionRecoveryDetected && !input.firstValueObtained) {
    return 'recovery_needed';
  }

  if (input.activationStarted && !input.firstValueObtained && input.stalledDays > 5) {
    return 'stalled_risk';
  }

  if (input.hoursSincePayment !== undefined && input.hoursSincePayment <= POST_SALE_WINDOW_HOURS) {
    return 'immediate_post_sale';
  }

  if (input.activationStarted || input.firstValueObtained) {
    return 'value_forming';
  }

  return 'silent_monitoring';
}

function hasRecentPriorObjection(
  events: readonly {
    eventName: string;
    workspaceId?: string;
    occurredAt: string;
    entityRef?: { readonly entityType: string; readonly entityId: string };
  }[],
  workspaceId: string,
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
      event.workspaceId !== workspaceId ||
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

function hasPositiveSatisfaction(
  events: readonly {
    eventName: string;
    workspaceId?: string;
    entityRef?: { readonly entityType: string; readonly entityId: string };
    payload?: unknown;
  }[],
  workspaceId: string,
  entityRef: { readonly entityType: string; readonly entityId: string },
): boolean {
  return events.some((event) => {
    if (
      event.workspaceId !== workspaceId ||
      event.eventName !== 'commerce.post_sale.satisfaction_signal_observed' ||
      event.entityRef?.entityType !== entityRef.entityType ||
      event.entityRef.entityId !== entityRef.entityId
    ) {
      return false;
    }

    return (
      typeof event.payload === 'object' &&
      event.payload !== null &&
      'sentimentLabel' in event.payload &&
      event.payload.sentimentLabel === 'positive'
    );
  });
}

function buildControl(phase: NoRegretPhase): PostSaleDecisionControl {
  switch (phase) {
    case 'no_regret_confirmed':
      return {
        riskClass: 'R1',
        delegationMode: 'allowed_alone',
        safeNextStep:
          'Record no-regret status, keep satisfaction monitoring, and block expansion prompts until satisfaction is explicit.',
        uncertainty:
          'No-regret is inferred from activation plus first value; it is not a testimonial or satisfaction claim.',
        leadOutcomeGuardrail:
          'Customer should keep receiving value without being pushed into a new offer.',
        rollback:
          'If refund, churn, negative satisfaction, or support escalation appears, clear no-regret status and move to recovery.',
      };

    case 'stalled_risk':
      return {
        riskClass: 'R2',
        delegationMode: 'owner_review',
        safeNextStep:
          'Prepare one owner-reviewed help check-in focused on the blocked first-value step.',
        uncertainty:
          'The customer is stalled, but Kloel does not know whether the cause is confusion, lack of time, or regret.',
        leadOutcomeGuardrail:
          'Customer must get help to reach the promised value, not pressure to justify the purchase.',
        rollback:
          'If the owner rejects the check-in or the customer signals refund intent, stop automation and escalate to human support.',
      };

    case 'recovery_needed':
      return {
        riskClass: 'R2',
        delegationMode: 'owner_review',
        safeNextStep:
          'Prioritize anti-remorse recovery before any activation, referral, testimonial, or expansion action.',
        uncertainty:
          'Risk signals are strong enough that Kloel should not assume normal onboarding will solve the issue.',
        leadOutcomeGuardrail:
          'Customer must leave clearer and less anxious, even if that means no sale-preserving action.',
        rollback:
          'If recovery evidence is weak or rejected by the owner, keep the case in human review and do not send.',
      };

    case 'immediate_post_sale':
      return {
        riskClass: 'R1',
        delegationMode: 'allowed_alone',
        safeNextStep:
          'Keep the customer on the first useful step and wait for activation or risk evidence before claiming success.',
        uncertainty:
          'Payment is recent; Kloel knows the purchase happened, not whether value has landed.',
        leadOutcomeGuardrail:
          'Customer should know what happens next without urgency, upsell, or celebration before value.',
        rollback:
          'If no activation appears after the normal window, move to stalled-risk review instead of repeated nudges.',
      };

    case 'value_forming':
      return {
        riskClass: 'R1',
        delegationMode: 'allowed_alone',
        safeNextStep:
          'Continue monitoring the current activation path and surface only the missing first-value evidence.',
        uncertainty: 'There is post-sale movement, but no-regret is not confirmed yet.',
        leadOutcomeGuardrail:
          'Customer should get continuity toward the promised result without extra decision load.',
        rollback: 'If progress stops or risk appears, switch to owner-reviewed help.',
      };

    case 'no_payment_observed':
    case 'silent_monitoring':
    default:
      return {
        riskClass: 'R1',
        delegationMode: 'silent_monitoring',
        safeNextStep:
          'Stay silent and do not create a post-sale task until payment, activation, first-value, or risk evidence appears.',
        uncertainty: 'Observed evidence is insufficient for a post-sale no-regret claim.',
        leadOutcomeGuardrail: 'Avoid contacting or classifying the customer without evidence.',
        rollback: 'Reassess when a concrete post-sale event enters the spine.',
      };
  }
}
