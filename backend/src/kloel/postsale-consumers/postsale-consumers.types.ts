/**
 * UTP-POSTSALE-001..012 — Camada XVIII (Post-Sale & LTV Engine).
 *
 * Consumer logic types for the post-sale pipeline. These types describe
 * the output of each detector/advisor/service. The emitter
 * (PostSaleEventEmitterService in post-sale-emitter/) is the canonical
 * surface for emitting `commerce.post_sale.*` events on the spine.
 *
 * Implements B0.6 (operate past sale toward LTV), PCI.1 §3.12
 * (commerce.post_sale.* taxonomy), and PCI.5 conventions.
 */

import type { SpineEventRef } from '../mind/mind.types';

export type SatisfactionMethod = 'nps' | 'csat' | 'behavioral' | 'support_sentiment';

export type ChurnSignalKind =
  | 'inactivity'
  | 'support_escalation'
  | 'declined_payment'
  | 'refund_request'
  | 'negative_nps'
  | 'member_dropout'
  | 'handoff_repeat'
  | 'conversation_cooldown'
  | 'first_value_missing'
  | 'recent_objection_recovery';

export type RetentionTacticKind =
  | 'usage_spotlight'
  | 'success_reminder'
  | 'personal_checkin'
  | 'resource_share'
  | 'feature_unlock'
  | 'pacing_adjustment'
  | 'community_invite'
  | 'early_renewal_offer';

export type WinBackTacticKind =
  | 'departure_survey'
  | 'conditional_return_offer'
  | 'product_evolution_update'
  | 'reengagement_content';

export type ExpansionSignalKind =
  | 'feature_adoption'
  | 'volume_growth'
  | 'multi_user_pattern'
  | 'complementary_need'
  | 'enterprise_readiness';

export interface AntiRemorseSignal {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly paymentEventId: string;
  readonly remorseRiskScore: number;
  readonly riskFactors: readonly string[];
  readonly objectionRecoveryDetected: boolean;
  readonly recommendedAction: 'send_reassurance' | 'send_welcome' | 'monitor' | 'none';
  readonly control: AntiRemorseControl;
  readonly assessedAt: string;
}

export interface AntiRemorseControl {
  readonly riskClass: 'R1' | 'R2';
  readonly requiresHumanApproval: boolean;
  readonly safeNextStep: string;
  readonly leadOutcomeGuardrail: string;
  readonly rollback: string;
  readonly objectionRecoveryGuardrail?: string;
}

type PostSaleDelegationMode = 'allowed_alone' | 'owner_review' | 'silent_monitoring';

export interface PostSaleDecisionControl {
  readonly riskClass: 'R1' | 'R2';
  readonly delegationMode: PostSaleDelegationMode;
  readonly safeNextStep: string;
  readonly uncertainty: string;
  readonly leadOutcomeGuardrail: string;
  readonly rollback: string;
}

export interface ActivationProgress {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly percentComplete: number;
  readonly currentMilestone: string | undefined;
  readonly stalledDays: number;
  readonly activationLikely: boolean;
  readonly evidenceEventIds: readonly string[];
  readonly control: PostSaleDecisionControl;
  readonly assessedAt: string;
}

export interface FirstValueDetection {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly valueObtained: boolean;
  readonly kind: string | undefined;
  readonly evidenceEventIds: readonly string[];
  readonly uncertaintyFlags: readonly string[];
  readonly confidence: number;
  readonly evidenceQuality: 'none' | 'context_only' | 'value_signal';
  readonly control: PostSaleDecisionControl;
  readonly assessedAt: string;
}

export type NoRegretPhase =
  | 'no_payment_observed'
  | 'immediate_post_sale'
  | 'value_forming'
  | 'no_regret_confirmed'
  | 'stalled_risk'
  | 'recovery_needed'
  | 'silent_monitoring';

export interface NoRegretState {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly phase: NoRegretPhase;
  readonly isNoRegret: boolean;
  readonly antiRemorse: AntiRemorseSignal;
  readonly activation: ActivationProgress;
  readonly firstValue: FirstValueDetection;
  readonly control: PostSaleDecisionControl;
  readonly assessedAt: string;
}

export interface SatisfactionSignal {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly method: SatisfactionMethod;
  readonly score: number | undefined;
  readonly sentimentLabel: 'positive' | 'negative' | 'neutral' | 'mixed';
  readonly freeText: string | undefined;
  readonly observedAt: string;
  readonly sourceEventId: string | undefined;
}

export interface TestimonialReadiness {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly ready: boolean;
  readonly readinessScore: number;
  readonly reasons: readonly string[];
  readonly suggestedChannel: 'whatsapp' | 'email' | 'dashboard' | 'silent';
  readonly control: PostSaleDecisionControl;
  readonly assessedAt: string;
}

export interface RepurchaseWindow {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly windowOpen: boolean;
  readonly windowScore: number;
  readonly suggestedProductIds: readonly string[];
  readonly signals: readonly string[];
  readonly control: PostSaleDecisionControl;
  readonly assessedAt: string;
}

export interface ChurnRiskAssessment {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  readonly riskProbability: number;
  readonly primarySignal: ChurnSignalKind | undefined;
  readonly contributingSignals: readonly ChurnSignalKind[];
  readonly daysSinceLastActivity: number;
  readonly control: PostSaleDecisionControl;
  readonly assessedAt: string;
}

export interface RetentionTactic {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly tacticKind: RetentionTacticKind;
  readonly description: string;
  readonly urgency: 'now' | 'this_week' | 'next_week' | 'background';
  readonly channel: 'whatsapp' | 'email' | 'dashboard' | 'silent';
  readonly suggestedAt: string;
  readonly requiresHumanApproval: boolean;
  readonly control: PostSaleDecisionControl;
}

export interface WinBackPlan {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly winBackWindowDays: number;
  readonly windowOpen: boolean;
  readonly tacticKind: WinBackTacticKind;
  readonly description: string;
  readonly suggestedChannel: 'email' | 'whatsapp' | 'silent';
  readonly control: PostSaleDecisionControl;
  readonly assessedAt: string;
}

export interface LtvProjection {
  readonly workspaceId: string;
  readonly cohortKey: string;
  readonly cohortSize: number;
  readonly averageRevenueCents: number;
  readonly projectedLtvCents: number;
  readonly projectedLtvMonths: number;
  readonly confidence: number;
  readonly growthRate: number;
  readonly assessedAt: string;
}

export interface ExpansionFit {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly expansionReady: boolean;
  readonly fitScore: number;
  readonly signals: readonly ExpansionSignalKind[];
  readonly suggestedExpansionOffer: string | undefined;
  readonly control: PostSaleDecisionControl;
  readonly assessedAt: string;
}

export interface DetectionInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly nowMs?: number;
}

import { clamp, daysSince } from '../../common/math';
export { clamp, daysSince };
import { filterByWorkspace, filterByWorkspaceAndEntity } from '../spine-events.helpers';
export { filterByWorkspace, filterByWorkspaceAndEntity };

export function latestEvent(
  events: readonly SpineEventRef[],
  name: string,
): SpineEventRef | undefined {
  let latest: SpineEventRef | undefined;
  for (const e of events) {
    if (e.eventName !== name) {
      continue;
    }
    if (!latest || e.occurredAt > latest.occurredAt) {
      latest = e;
    }
  }
  return latest;
}
