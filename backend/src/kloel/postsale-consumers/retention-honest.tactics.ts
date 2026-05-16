import { Injectable } from '@nestjs/common';
import type {
  ChurnRiskAssessment,
  PostSaleDecisionControl,
  RetentionTactic,
  RetentionTacticKind,
  DetectionInput,
} from './postsale-consumers.types';
import { daysSince, filterByWorkspaceAndEntity, latestEvent } from './postsale-consumers.types';

@Injectable()
export class RetentionHonestTactics {
  public suggest(risk: ChurnRiskAssessment, input: DetectionInput): RetentionTactic {
    const nowMs = input.nowMs ?? Date.now();
    const entityRef = input.entityRef ?? risk.entityRef;
    const wsEvents = filterByWorkspaceAndEntity(input.events, input.workspaceId, entityRef);

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
      control: buildControl(risk, { urgency, channel, requiresHumanApproval }),
    };
  }

  public explain(tactic: RetentionTactic): string {
    const approvalTag = tactic.requiresHumanApproval ? ' [REQUIRES HUMAN APPROVAL]' : '';
    return `${tactic.tacticKind}: ${tactic.description}${approvalTag} (urgency=${tactic.urgency}, channel=${tactic.channel})`;
  }
}

function buildControl(
  risk: ChurnRiskAssessment,
  tactic: Pick<RetentionTactic, 'urgency' | 'channel' | 'requiresHumanApproval'>,
): PostSaleDecisionControl {
  if (tactic.requiresHumanApproval || risk.riskLevel === 'critical') {
    return {
      riskClass: 'R2',
      delegationMode: 'owner_review',
      safeNextStep:
        'Prepare a human-reviewed retention action focused on understanding friction before offering each commercial concession.',
      uncertainty:
        'Churn risk explains that something may be wrong, not which promise failed or what the customer wants now.',
      leadOutcomeGuardrail:
        'Customer must feel heard and clearer about options; do not pressure, guilt, or hide refund/downgrade paths.',
      rollback:
        'If the owner rejects the action or the customer signals refund/escalation, stop retention automation and move to human recovery.',
    };
  }

  if (tactic.channel === 'silent') {
    return {
      riskClass: 'R1',
      delegationMode: 'silent_monitoring',
      safeNextStep:
        'Stay silent and keep monitoring until a concrete retention signal appears.',
      uncertainty:
        'Current evidence is insufficient for an outbound retention action.',
      leadOutcomeGuardrail:
        'Avoid creating customer noise when the relationship does not need intervention.',
      rollback:
        'Reassess when churn, support, satisfaction, or first-value evidence changes.',
    };
  }

  return {
    riskClass: 'R1',
    delegationMode: 'allowed_alone',
    safeNextStep:
      'Surface the retention suggestion as informational support, not as a sales or urgency message.',
    uncertainty:
      'The tactic is low-risk but still inferred from behavior; do not claim customer intent.',
    leadOutcomeGuardrail:
      'Customer should get help or clarity without being pushed toward another purchase.',
    rollback:
      'If a negative response, refund signal, or support escalation appears, pause the tactic and move to owner review.',
  };
}
