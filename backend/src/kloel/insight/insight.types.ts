/**
 * UTP-INSIGHT-001..011 — Camada VII (Strategic Insight Engine).
 *
 * Detectors: funnel-bottleneck, offer-fit, objection-pattern,
 * qualification-leak, cooling-window, pricing-elasticity,
 * channel-roi, product-positioning. Ranked by financial impact
 * with confidence floor, delivered at the right moment and channel.
 *
 * R10 target: >= 1 strategic insight confirmed per workspace per month.
 *
 * Implements PCI conventions: truthMode on inferred insights,
 * workspaceId on all per-tenant data, provenance tracking.
 */

import type { AbiTruthMode, AbiValence } from '../abi/abi-schema';
import type { MaturityStage, SignalSummary } from '../maturity/maturity.types';
export type { MaturityStage };
import type { SpineEventRef } from '../mind/mind.types';

type InsightKind =
  | 'funnel_bottleneck'
  | 'offer_fit'
  | 'objection_pattern'
  | 'qualification_leak'
  | 'cooling_window'
  | 'pricing_elasticity'
  | 'channel_roi'
  | 'product_positioning';

export type RecommendedChannel = 'whatsapp' | 'email' | 'dashboard' | 'silent' | 'report';

export interface Insight {
  readonly insightId: string;
  readonly kind: InsightKind;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly estimatedFinancialImpactCents: number;
  readonly confidence: number;
  readonly recommendedChannel: RecommendedChannel;
  readonly recommendedTiming: 'now' | 'weekly' | 'monthly';
  readonly workspaceId: string;
  readonly truthMode: AbiTruthMode;
  readonly generatedAt: string;
  readonly maturityStage?: MaturityStage;
  readonly valence?: AbiValence;
}

export interface DetectorInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly signals?: SignalSummary;
  readonly maturityStage?: MaturityStage;
  readonly nowMs?: number;
}

export interface DetectorResult {
  readonly insights: readonly Insight[];
}

export interface RankedInsight extends Insight {
  readonly impactConfidenceProduct: number;
}

export interface DeliveryDecision {
  readonly insight: RankedInsight;
  readonly deliver: boolean;
  readonly reason?: string;
}

export interface ChannelTiming {
  readonly channel: RecommendedChannel;
  readonly timing: 'now' | 'weekly' | 'monthly';
  readonly priority: number;
}

export const INSIGHT_EVENT_NAMES: ReadonlySet<string> = new Set([
  'commerce.lead.created',
  'commerce.lead.contacted',
  'commerce.lead.replied',
  'commerce.lead.went_silent',
  'commerce.lead.objection_raised',
  'commerce.lead.qualified',
  'commerce.lead.lost',
  'commerce.lead.converted',
  'commerce.cart.created',
  'commerce.cart.abandoned',
  'commerce.cart.checkout_initiated',
  'commerce.payment.initiated',
  'commerce.payment.approved',
  'commerce.payment.declined',
  'commerce.payment.refunded',
  'commerce.payment.charged_back',
  'commerce.crm.stage_changed',
  'commerce.crm.owner_assigned',
  'commerce.crm.next_step_defined',
  'commerce.crm.deal_won',
  'commerce.crm.deal_lost',
  'commerce.campaign.clicked',
  'commerce.campaign.conversion_associated',
  'commerce.campaign.audience_reached',
  'commerce.campaign.creative_swapped',
  'commerce.campaign.performance_drop_detected',
  'commerce.whatsapp.message_received',
  'commerce.whatsapp.message_read',
  'commerce.whatsapp.message_replied',
  'commerce.whatsapp.handoff_to_human',
  'commerce.whatsapp.conversation_resumed',
  'commerce.post_sale.delivery_completed',
  'commerce.post_sale.activation_started',
  'commerce.post_sale.first_value_obtained',
  'commerce.post_sale.satisfaction_signal_observed',
  'commerce.post_sale.churn_risk_detected',
  'commerce.post_sale.win_back_window_opened',
]);

export const FUNNEL_STEP_ORDER = [
  'commerce.lead.created',
  'commerce.lead.contacted',
  'commerce.lead.replied',
  'commerce.lead.qualified',
  'commerce.cart.created',
  'commerce.cart.checkout_initiated',
  'commerce.payment.approved',
] as const;

type FunnelStep = (typeof FUNNEL_STEP_ORDER)[number];

export const FUNNEL_RELEVANT_EVENTS: ReadonlySet<string> = new Set(FUNNEL_STEP_ORDER);

export interface FunnelBottleneckResult {
  readonly workspaceId: string;
  readonly bottleneckStep: FunnelStep | 'no_data';
  readonly dropRate: number;
  readonly eventCount: number;
  readonly suggestedAction: string;
  readonly financialImpactEstimateCents: number;
  readonly confidence: number;
  readonly truthMode: AbiTruthMode;
}

export interface FunnelBottleneckInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly nowMs?: number;
  readonly windowDays?: number;
}

export interface FunnelStepCounts {
  readonly step: FunnelStep;
  readonly count: number;
  readonly dropFromPrevious: number;
}

export function timestampMs(iso: string): number {
  return Date.parse(iso);
}

export function withinWindow(iso: string, nowMs: number, windowDays: number): boolean {
  const cutoff = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const ts = timestampMs(iso);
  return Number.isFinite(ts) && ts >= cutoff;
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
