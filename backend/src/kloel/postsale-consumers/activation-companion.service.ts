import { Injectable } from '@nestjs/common';
import type { ActivationProgress, DetectionInput } from './postsale-consumers.types';
import { daysSince, filterByWorkspace, latestEvent } from './postsale-consumers.types';
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
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };
    const totalSteps = ACTIVATION_MILESTONES.length;

    const startedEvent = latestEvent(wsEvents, 'commerce.post_sale.activation_started');
    const completedMilestones = new Set<string>();
    let lastActivityDate: string | undefined;

    for (const event of wsEvents) {
      if (!lastActivityDate || event.occurredAt > lastActivityDate) {
        lastActivityDate = event.occurredAt;
      }
    }

    if (startedEvent) {
      completedMilestones.add('login');
    }

    const firstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
    if (firstValue) {
      completedMilestones.add('first_result_achieved');
    }

    const hasConfigActivity = wsEvents.some(
      (e: SpineEventRef) =>
        (e.eventName === 'commerce.crm.next_step_defined' ||
          e.eventName === 'commerce.campaign.clicked') &&
        daysSince(e.occurredAt, nowMs) < 30,
    );
    if (hasConfigActivity) {
      completedMilestones.add('platform_configured');
    }

    const hasFeatureUsage = wsEvents.some(
      (e: SpineEventRef) =>
        (e.eventName === 'commerce.whatsapp.message_replied' ||
          e.eventName === 'commerce.member_area.progressed') &&
        daysSince(e.occurredAt, nowMs) < 30,
    );
    if (hasFeatureUsage) {
      completedMilestones.add('first_feature_use');
    }

    const completedSteps = completedMilestones.size;
    const percentComplete = Math.round((completedSteps / totalSteps) * 100);

    const stalledDays = lastActivityDate ? Math.round(daysSince(lastActivityDate, nowMs)) : 0;
    const activationLikely = percentComplete >= 60 && stalledDays <= STALL_THRESHOLD_DAYS;

    const currentMilestone =
      completedSteps < totalSteps
        ? ACTIVATION_MILESTONES[completedSteps]
        : undefined;

    return {
      workspaceId: input.workspaceId,
      entityRef,
      totalSteps,
      completedSteps,
      percentComplete,
      currentMilestone,
      stalledDays,
      activationLikely,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }
}
