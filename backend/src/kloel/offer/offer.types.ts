/**
 * UTP-OFFER-001..009 — Camada XV (Offer Evolution Intelligence).
 *
 * Detects what to change in the product/offer based on observable evidence:
 * bonus desirability, promise strength, product versioning, positioning
 * mismatch, page-promise mismatch, and pricing psychology signals.
 *
 * UTP-OFFER-007 ranks by impactMultiplicative * confidence.
 * UTP-OFFER-008 enforces a confidence floor.
 * UTP-OFFER-009 delivers insights via the right channel and timing.
 *
 * Implements PCI conventions: truthMode on inferred insights,
 * workspaceId on all per-tenant data, provenance tracking.
 */

import type { AbiTruthMode, AbiValence } from '../abi/abi-schema';
import type { MaturityStage } from '../maturity/maturity.types';
export type { MaturityStage };
import type { SpineEventRef } from '../mind/mind.types';

type OfferInsightKind =
  | 'bonus_desirability'
  | 'promise_strength'
  | 'product_version_fit'
  | 'positioning_mismatch'
  | 'page_promise_mismatch'
  | 'pricing_psychology';

export type RecommendedChannel =
  | 'whatsapp'
  | 'email'
  | 'dashboard'
  | 'silent'
  | 'report';

export interface OfferInsight {
  readonly insightId: string;
  readonly kind: OfferInsightKind;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly impactMultiplicative: number;
  readonly confidence: number;
  readonly recommendedChannel: RecommendedChannel;
  readonly recommendedTiming: 'now' | 'weekly' | 'monthly';
  readonly workspaceId: string;
  readonly truthMode: AbiTruthMode;
  readonly generatedAt: string;
  readonly maturityStage?: MaturityStage;
  readonly valence?: AbiValence;
}

export interface OfferDetectorInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly nowMs?: number;
  readonly maturityStage?: MaturityStage;
}

export interface OfferDetectorResult {
  readonly insights: readonly OfferInsight[];
}

export interface RankedOfferInsight extends OfferInsight {
  readonly rankedProduct: number;
}

export interface DeliveryDecision {
  readonly insight: RankedOfferInsight;
  readonly deliver: boolean;
  readonly reason?: string;
}

export type { ChannelTiming } from '../insight/insight.types';

export const OFFER_EVENT_NAMES: ReadonlySet<string> = new Set([
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
  'commerce.crm.deal_won',
  'commerce.crm.deal_lost',
  'commerce.campaign.clicked',
  'commerce.campaign.conversion_associated',
  'commerce.campaign.creative_swapped',
  'commerce.post_sale.delivery_completed',
  'commerce.post_sale.first_value_obtained',
  'commerce.post_sale.satisfaction_signal_observed',
  'commerce.post_sale.churn_risk_detected',
]);

function timestampMs(iso: string): number {
  return Date.parse(iso);
}

export function withinWindow(
  iso: string,
  nowMs: number,
  windowDays: number,
): boolean {
  const cutoff = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const ts = timestampMs(iso);
  return Number.isFinite(ts) && ts >= cutoff;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export type PromiseStrength = 'weak' | 'moderate' | 'strong';

export interface PromiseStrengthConversionData {
  readonly leadToCartRate: number;
  readonly cartToPurchaseRate: number;
  readonly overallConversionRate: number;
  readonly sampleSize: number;
  readonly windowDays: number;
}

export interface PromiseStrengthResult {
  readonly strength: PromiseStrength;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly computedAt: string;
}

export interface AudienceProfile {
  readonly role: string;
  readonly painPoints: readonly string[];
  readonly expectedValue: string;
  readonly pricePerception: 'low' | 'medium' | 'high';
  readonly maturitySignal: string;
}

export interface ConversionFeedback {
  readonly objectionKinds: Readonly<Record<string, number>>;
  readonly lostReasons: Readonly<Record<string, number>>;
  readonly refundReasons: Readonly<Record<string, number>>;
  readonly totalLeads: number;
}

export interface PositioningGapDetail {
  readonly category: string;
  readonly description: string;
  readonly severity: number;
  readonly evidence: readonly string[];
}

export interface PositioningMismatchResult {
  readonly hasMismatch: boolean;
  readonly gapDescription: string;
  readonly severity: 'none' | 'minor' | 'moderate' | 'critical';
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly gaps: readonly PositioningGapDetail[];
  readonly computedAt: string;
}
