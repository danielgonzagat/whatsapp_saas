import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type {
  ChurnRiskAssessment,
  PostSaleDecisionControl,
  WinBackPlan,
  WinBackTacticKind,
  DetectionInput,
} from './postsale-consumers.types';

const PROCESSOR_NAME = 'winback-window-advisor';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

@Injectable()
export class WinBackWindowAdvisor {
  private readonly logger = new Logger(WinBackWindowAdvisor.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public async assess(risk: ChurnRiskAssessment, _input: DetectionInput): Promise<WinBackPlan> {
    const nowMs = _input.nowMs ?? Date.now();
    const entityRef = _input.entityRef ?? risk.entityRef;
    const objectionRootedRisk = risk.contributingSignals.includes('recent_objection_recovery');

    let windowDays = 0;
    let tacticKind: WinBackTacticKind;
    let description: string;
    let suggestedChannel: WinBackPlan['suggestedChannel'] = 'silent';
    let windowOpen = false;

    if (risk.riskLevel === 'critical') {
      windowDays = 7;
      tacticKind = 'conditional_return_offer';
      description =
        'Offer a structured return path with clear conditions and no pressure — the customer decides the terms.';
      suggestedChannel = 'email';
      windowOpen = true;
    } else if (risk.riskLevel === 'high') {
      windowDays = 14;
      tacticKind = objectionRootedRisk ? 'product_evolution_update' : 'departure_survey';
      description = objectionRootedRisk
        ? 'Share only a relevant product progress note after owner review; do not reopen the prior objection or imply the customer should return.'
        : 'Send a brief departure survey asking what could have been better. No offer attached — pure listening.';
      suggestedChannel = 'email';
      windowOpen = true;
    } else if (risk.riskLevel === 'moderate') {
      windowDays = 30;
      tacticKind = objectionRootedRisk ? 'reengagement_content' : 'product_evolution_update';
      description = objectionRootedRisk
        ? 'Keep the customer in silent monitoring; the recovered objection is context for support, not permission to re-sell.'
        : 'Inform the customer of relevant product improvements made since their last interaction. Informational, not promotional.';
      suggestedChannel = objectionRootedRisk ? 'silent' : 'email';
      windowOpen = !objectionRootedRisk;
    } else {
      windowDays = 90;
      tacticKind = 'reengagement_content';
      description =
        "Share educational content aligned with the customer's original interest — no offer, no urgency.";
      suggestedChannel = 'silent';
      windowOpen = false;
    }

    if (windowOpen) {
      await this.emitWindow(risk.workspaceId, entityRef, tacticKind);
    }

    return {
      workspaceId: risk.workspaceId,
      entityRef,
      winBackWindowDays: windowDays,
      windowOpen,
      tacticKind,
      description,
      suggestedChannel,
      control: buildControl(risk, { windowOpen, suggestedChannel, tacticKind }),
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private async emitWindow(
    workspaceId: string,
    entityRef: { readonly entityType: string; readonly entityId: string },
    tactic: WinBackTacticKind,
  ): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.post_sale.win_back_window_opened',
        workspaceId,
        entityRef,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: { tacticKind: tactic },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit win_back_window_opened for ws ${workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}

function buildControl(
  risk: ChurnRiskAssessment,
  plan: Pick<WinBackPlan, 'windowOpen' | 'suggestedChannel' | 'tacticKind'>,
): PostSaleDecisionControl {
  if (!plan.windowOpen || plan.suggestedChannel === 'silent') {
    const objectionRootedRisk = risk.contributingSignals.includes('recent_objection_recovery');
    return {
      riskClass: 'R1',
      delegationMode: 'silent_monitoring',
      safeNextStep: objectionRootedRisk
        ? 'Keep the win-back window closed; use the recovered objection only as private support context until stronger help evidence appears.'
        : 'Keep the win-back window closed and do not contact the customer without stronger recovery evidence.',
      uncertainty: objectionRootedRisk
        ? 'Recovered objection plus missing first value is a listening signal, not explicit permission to re-open the sale.'
        : 'Risk is not strong enough to justify re-opening a customer conversation.',
      leadOutcomeGuardrail: objectionRootedRisk
        ? 'Do not reopen the prior objection as pressure; wait for explicit concern, support need, or first-value evidence.'
        : 'Customer should not receive a reactivation message just because Kloel can send one.',
      rollback: objectionRootedRisk
        ? 'If new outreach was queued from this signal alone, cancel it and return to normal post-sale support.'
        : 'Reassess only when churn, refund, satisfaction, or explicit return-intent evidence changes.',
    };
  }

  if (plan.tacticKind === 'conditional_return_offer') {
    return {
      riskClass: 'R2',
      delegationMode: 'owner_review',
      safeNextStep:
        'Draft return conditions for owner review after listening to the churn reason; do not lead with discount.',
      uncertainty:
        'Critical churn means relationship damage is possible, but the right repair path is not known yet.',
      leadOutcomeGuardrail:
        'Customer must get a fair path back or out, without urgency, guilt, or hidden tradeoffs.',
      rollback:
        'If terms are unclear or the owner cannot honor them, do not send the offer; use a listening survey or human support instead.',
    };
  }

  return {
    riskClass: risk.riskLevel === 'high' ? 'R2' : 'R1',
    delegationMode: risk.riskLevel === 'high' ? 'owner_review' : 'allowed_alone',
    safeNextStep: risk.contributingSignals.includes('recent_objection_recovery')
      ? 'Owner must review each product update and confirm it helps the customer without re-litigating the prior objection.'
      : 'Use the win-back window to listen or inform; attach no discount, deadline, or pressure unless the owner approves it.',
    uncertainty: risk.contributingSignals.includes('recent_objection_recovery')
      ? 'Win-back timing is inferred from a recovered objection path; the customer has not asked to be sold again.'
      : 'Win-back timing is inferred from risk, not from explicit customer permission to be sold again.',
    leadOutcomeGuardrail: risk.contributingSignals.includes('recent_objection_recovery')
      ? 'Do not reopen the prior objection as pressure; the customer should receive only useful context they would be glad to know.'
      : 'Customer should leave clearer or heard, even if they never return.',
    rollback:
      'If the customer ignores, objects, or shows frustration, close the window and stop follow-up until fresh intent appears.',
  };
}
