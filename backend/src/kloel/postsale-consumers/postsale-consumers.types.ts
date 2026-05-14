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
  | 'conversation_cooldown';

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
  readonly recommendedAction: 'send_reassurance' | 'send_welcome' | 'monitor' | 'none';
  readonly assessedAt: string;
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
  readonly assessedAt: string;
}

export interface FirstValueDetection {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly valueObtained: boolean;
  readonly kind: string | undefined;
  readonly evidenceEventIds: readonly string[];
  readonly confidence: number;
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
  readonly assessedAt: string;
}

export interface RepurchaseWindow {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly windowOpen: boolean;
  readonly windowScore: number;
  readonly suggestedProductIds: readonly string[];
  readonly signals: readonly string[];
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
}

export interface WinBackPlan {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly winBackWindowDays: number;
  readonly windowOpen: boolean;
  readonly tacticKind: WinBackTacticKind;
  readonly description: string;
  readonly suggestedChannel: 'email' | 'whatsapp' | 'silent';
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
  readonly assessedAt: string;
}

export interface DetectionInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly nowMs?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function daysSince(iso: string, nowMs: number): number {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, (nowMs - ts) / (1000 * 60 * 60 * 24));
}

export function countByEventName(
  events: readonly SpineEventRef[],
  name: string,
): number {
  return events.filter((e) => e.eventName === name).reduce((c) => c + 1, 0);
}

export function filterByWorkspace(
  events: readonly SpineEventRef[],
  workspaceId: string,
): readonly SpineEventRef[] {
  return events.filter((e) => e.workspaceId === workspaceId);
}

export function latestEvent(
  events: readonly SpineEventRef[],
  name: string,
): SpineEventRef | undefined {
  let latest: SpineEventRef | undefined;
  for (const e of events) {
    if (e.eventName !== name) continue;
    if (!latest || e.occurredAt > latest.occurredAt) latest = e;
  }
  return latest;
}
