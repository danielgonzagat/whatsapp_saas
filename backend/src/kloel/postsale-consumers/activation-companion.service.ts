import { Injectable } from '@nestjs/common';
import type {
  ActivationProgress,
  DetectionInput,
  PostSaleDecisionControl,
} from './postsale-consumers.types';
import { daysSince, filterByWorkspaceAndEntity, latestEvent } from './postsale-consumers.types';
import type { SpineEventRef } from '../mind/mind.types';

const STALL_THRESHOLD_DAYS = 5;

const ACTIVATION_MILESTONES: readonly string[] = [
  'login',
  'profile_complete',
  'first_feature_use',
  'first_result_achieved',
  'platform_configured',
];

@Injectable()
export class ActivationCompanionService {
  public track(input: DetectionInput): ActivationProgress {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspaceAndEntity(input.events, input.workspaceId, input.entityRef);
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
    const totalSteps = ACTIVATION_MILESTONES.length;

    const startedEvent = latestEvent(wsEvents, 'commerce.post_sale.activation_started');
    const completedMilestones = new Set<string>();
    const evidenceEventIds: string[] = [];
    let lastActivityDate: string | undefined;

    for (const event of wsEvents) {
      if (!lastActivityDate || event.occurredAt > lastActivityDate) {
        lastActivityDate = event.occurredAt;
      }
    }

    if (startedEvent) {
      completedMilestones.add('login');
      evidenceEventIds.push(startedEvent.eventId);
    }

    const firstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    if (firstValue) {
      completedMilestones.add('first_result_achieved');
      evidenceEventIds.push(firstValue.eventId);
    }

    const hasConfigActivity = wsEvents.some(
      (e: SpineEventRef) =>
        (e.eventName === 'commerce.crm.next_step_defined' ||
          e.eventName === 'commerce.campaign.clicked') &&
        daysSince(e.occurredAt, nowMs) < 30,
    );
    if (hasConfigActivity) {
      completedMilestones.add('platform_configured');
      evidenceEventIds.push(
        ...wsEvents
          .filter(
            (e) =>
              (e.eventName === 'commerce.crm.next_step_defined' ||
                e.eventName === 'commerce.campaign.clicked') &&
              daysSince(e.occurredAt, nowMs) < 30,
          )
          .map((e) => e.eventId),
      );
    }

    const hasFeatureUsage = wsEvents.some(
      (e: SpineEventRef) =>
        (e.eventName === 'commerce.whatsapp.message_replied' ||
          e.eventName === 'commerce.member_area.progressed') &&
        daysSince(e.occurredAt, nowMs) < 30,
    );
    if (hasFeatureUsage) {
      completedMilestones.add('first_feature_use');
      evidenceEventIds.push(
        ...wsEvents
          .filter(
            (e) =>
              (e.eventName === 'commerce.whatsapp.message_replied' ||
                e.eventName === 'commerce.member_area.progressed') &&
              daysSince(e.occurredAt, nowMs) < 30,
          )
          .map((e) => e.eventId),
      );
    }

    const completedSteps = completedMilestones.size;
    const percentComplete = Math.round((completedSteps / totalSteps) * 100);

    const stalledDays = lastActivityDate ? Math.round(daysSince(lastActivityDate, nowMs)) : 0;
    const activationLikely = percentComplete >= 60 && stalledDays <= STALL_THRESHOLD_DAYS;

    const currentMilestone =
      completedSteps < totalSteps ? ACTIVATION_MILESTONES[completedSteps] : undefined;

    return {
      workspaceId: input.workspaceId,
      entityRef,
      totalSteps,
      completedSteps,
      percentComplete,
      currentMilestone,
      stalledDays,
      activationLikely,
      evidenceEventIds: Array.from(new Set(evidenceEventIds)),
      control: buildControl({ activationLikely, completedSteps, stalledDays, currentMilestone }),
      assessedAt: new Date(nowMs).toISOString(),
    };
  }
}

function buildControl(input: {
  readonly activationLikely: boolean;
  readonly completedSteps: number;
  readonly stalledDays: number;
  readonly currentMilestone: string | undefined;
}): PostSaleDecisionControl {
  if (input.activationLikely) {
    return {
      riskClass: 'R1',
      delegationMode: 'allowed_alone',
      safeNextStep:
        'Record the customer as activated, keep normal monitoring, and avoid adding another post-sale prompt unless a new risk signal appears.',
      uncertainty:
        'Activation is inferred from recent behavior; do not claim satisfaction or business result until satisfaction or outcome evidence appears.',
      leadOutcomeGuardrail:
        'Customer should keep receiving the expected value without being pushed toward another offer.',
      rollback:
        'If a refund, churn, negative satisfaction, or support escalation appears, remove activation confidence and reassess anti-remorse first.',
    };
  }

  if (input.completedSteps > 0 && input.stalledDays > STALL_THRESHOLD_DAYS) {
    return {
      riskClass: 'R2',
      delegationMode: 'owner_review',
      safeNextStep:
        'Draft a short help check-in for owner review that asks what blocked the next step and offers one concrete path to first value.',
      uncertainty:
        'The stall is behavioral evidence, not proof of dissatisfaction; ask before assuming the customer regrets the purchase.',
      leadOutcomeGuardrail:
        'Customer must leave clearer about the next useful step, not pressured to justify the purchase or buy more.',
      rollback:
        'If the owner rejects the draft or the customer signals confusion/refund intent, stop outbound automation and escalate to human support.',
    };
  }

  if (input.completedSteps > 0) {
    return {
      riskClass: 'R1',
      delegationMode: 'allowed_alone',
      safeNextStep:
        'Keep watching for the next activation milestone and surface only the current missing step to the owner.',
      uncertainty:
        'Progress exists, but first value is not fully evidenced yet; keep the claim limited to activation progress.',
      leadOutcomeGuardrail:
        'Customer should get one clear next step without extra noise or premature upsell.',
      rollback:
        'If no further progress appears after the stall threshold, move to owner-reviewed help instead of automated pressure.',
    };
  }

  return {
    riskClass: 'R1',
    delegationMode: 'silent_monitoring',
    safeNextStep:
      'Stay silent until post-sale activation starts or a customer risk signal appears; do not create a new owner task yet.',
    uncertainty:
      'No activation evidence exists in the observed events, so Kloel cannot infer progress.',
    leadOutcomeGuardrail:
      'Avoid contacting the customer without evidence that help is needed.',
    rollback:
      'When activation evidence appears, reassess and choose the next safe step from the new evidence.',
  };
}
