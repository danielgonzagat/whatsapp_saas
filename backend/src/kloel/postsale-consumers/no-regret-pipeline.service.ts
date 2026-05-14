import { Injectable } from '@nestjs/common';
import { AntiRemorseService } from './anti-remorse.service';
import { ActivationCompanionService } from './activation-companion.service';
import { FirstValueDetector } from './first-value.detector';
import { daysSince, latestEvent } from './postsale-consumers.types';
import type {
  DetectionInput,
  NoRegretPhase,
  NoRegretState,
  PostSaleDecisionControl,
} from './postsale-consumers.types';

const POST_SALE_WINDOW_HOURS = 24;

@Injectable()
export class NoRegretPipelineService {
  public constructor(
    private readonly antiRemorse: AntiRemorseService,
    private readonly activation: ActivationCompanionService,
    private readonly firstValue: FirstValueDetector,
  ) {}

  public async assess(input: DetectionInput, refundRisk?: number): Promise<NoRegretState> {
    const nowMs = input.nowMs ?? Date.now();
    const antiRemorse = this.antiRemorse.assess(input, refundRisk);
    const activation = this.activation.track(input);
    const firstValue = await this.firstValue.detect(input);
    const payment = latestEvent(input.events, 'commerce.payment.approved');
    const entityRef = input.entityRef ?? antiRemorse.entityRef;
    const phase = classifyPhase({
      hasPayment: payment !== undefined,
      hoursSincePayment: payment ? daysSince(payment.occurredAt, nowMs) * 24 : undefined,
      activationStarted: activation.completedSteps > 0,
      activationLikely: activation.activationLikely,
      stalledDays: activation.stalledDays,
      firstValueObtained: firstValue.valueObtained,
      antiRemorseAction: antiRemorse.recommendedAction,
      objectionRecoveryDetected: antiRemorse.objectionRecoveryDetected,
    });
    const isNoRegret = phase === 'no_regret_confirmed';

    return {
      workspaceId: input.workspaceId,
      entityRef,
      phase,
      isNoRegret,
      antiRemorse,
      activation,
      firstValue,
      control: buildControl(phase),
      assessedAt: new Date(nowMs).toISOString(),
    };
  }
}

function classifyPhase(input: {
  readonly hasPayment: boolean;
  readonly hoursSincePayment: number | undefined;
  readonly activationStarted: boolean;
  readonly activationLikely: boolean;
  readonly stalledDays: number;
  readonly firstValueObtained: boolean;
  readonly antiRemorseAction: 'send_reassurance' | 'send_welcome' | 'monitor' | 'none';
  readonly objectionRecoveryDetected: boolean;
}): NoRegretPhase {
  if (!input.hasPayment) {
    return 'no_payment_observed';
  }

  if (input.antiRemorseAction === 'send_reassurance') {
    return 'recovery_needed';
  }

  if (input.firstValueObtained && input.activationLikely) {
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
        uncertainty:
          'There is post-sale movement, but no-regret is not confirmed yet.',
        leadOutcomeGuardrail:
          'Customer should get continuity toward the promised result without extra decision load.',
        rollback:
          'If progress stops or risk appears, switch to owner-reviewed help.',
      };

    case 'no_payment_observed':
    case 'silent_monitoring':
    default:
      return {
        riskClass: 'R1',
        delegationMode: 'silent_monitoring',
        safeNextStep:
          'Stay silent and do not create a post-sale task until payment, activation, first-value, or risk evidence appears.',
        uncertainty:
          'Observed evidence is insufficient for a post-sale no-regret claim.',
        leadOutcomeGuardrail:
          'Avoid contacting or classifying the customer without evidence.',
        rollback:
          'Reassess when a concrete post-sale event enters the spine.',
      };
  }
}
