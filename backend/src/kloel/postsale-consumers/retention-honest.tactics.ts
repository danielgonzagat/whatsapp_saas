import { Injectable } from '@nestjs/common';
import type {
  ChurnRiskAssessment,
  RetentionTactic,
  RetentionTacticKind,
  DetectionInput,
} from './postsale-consumers.types';
import { daysSince, filterByWorkspace, latestEvent } from './postsale-consumers.types';

@Injectable()
export class RetentionHonestTactics {
  public suggest(risk: ChurnRiskAssessment, input: DetectionInput): RetentionTactic {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const entityRef = input.entityRef ?? risk.entityRef;

    let tacticKind: RetentionTacticKind;
    let description: string;
    let urgency: RetentionTactic['urgency'];
    let channel: RetentionTactic['channel'];
    let requiresHumanApproval = false;

    switch (risk.riskLevel) {
      case 'critical':
        tacticKind = 'personal_checkin';
        description =
          'Human-led personal check-in with the customer to understand friction and offer assistance. No sales pitch — diagnostic conversation.';
        urgency = 'now';
        channel = 'whatsapp';
        requiresHumanApproval = true;
        break;

      case 'high':
        if (risk.contributingSignals.includes('inactivity')) {
          tacticKind = 'success_reminder';
          description =
            'Surface a specific outcome or milestone the customer already achieved, framed as a summary of progress — not a nudge.';
          urgency = 'this_week';
          channel = 'email';
        } else if (
          risk.contributingSignals.includes('refund_request') ||
          risk.contributingSignals.includes('declined_payment')
        ) {
          tacticKind = 'pacing_adjustment';
          description =
            'Suggest a plan downgrade or payment pause option, transparently. Lower LTV is better than zero LTV.';
          urgency = 'now';
          channel = 'whatsapp';
          requiresHumanApproval = true;
        } else {
          tacticKind = 'resource_share';
          description =
            'Share a relevant resource, guide, or template that matches the last known interest area — no upsell.';
          urgency = 'this_week';
          channel = 'email';
        }
        break;

      case 'moderate':
        if (risk.contributingSignals.includes('inactivity')) {
          tacticKind = 'usage_spotlight';
          description =
            'Highlight a specific feature or workflow the customer has not yet tried, with a short walkthrough.';
          urgency = 'next_week';
          channel = 'dashboard';
        } else {
          tacticKind = 'community_invite';
          description =
            'Invite the customer to a community space, live session, or peer group — optional, no obligation.';
          urgency = 'next_week';
          channel = 'email';
        }
        break;

      case 'low':
      default: {
        const firstValue = latestEvent(wsEvents, 'commerce.post_sale.first_value_obtained');
        if (firstValue && daysSince(firstValue.occurredAt, nowMs) < 14) {
          tacticKind = 'success_reminder';
          description =
            "Summarize the customer's first value milestone and suggest the natural next step at their own pace.";
          urgency = 'background';
          channel = 'dashboard';
        } else {
          tacticKind = 'feature_unlock';
          description =
            'Notify the customer of a feature that became available or relevant based on usage patterns — informational only.';
          urgency = 'background';
          channel = 'dashboard';
        }
        break;
      }
    }

    return {
      workspaceId: risk.workspaceId,
      entityRef,
      tacticKind,
      description,
      urgency,
      channel,
      suggestedAt: new Date(nowMs).toISOString(),
      requiresHumanApproval,
    };
  }

  public explain(tactic: RetentionTactic): string {
    const approvalTag = tactic.requiresHumanApproval ? ' [REQUIRES HUMAN APPROVAL]' : '';
    return `${tactic.tacticKind}: ${tactic.description}${approvalTag} (urgency=${tactic.urgency}, channel=${tactic.channel})`;
  }
}
