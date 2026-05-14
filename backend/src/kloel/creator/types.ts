/**
 * UTP-CREATOR-001..006 — Camada XXVI: Creator Intelligence
 *
 * Monetizar audiência sem destruir relação.
 *
 * Types are plain data — no NestJS decorators.
 *
 * R30 — Creator trust capital protected (creators monetize without
 * destroying audience relationship). Depends on R12 (Trust) + R34
 * (Defensibility).
 */

/**
 * Fitness of an audience for a partnership/brand mention.
 */
export interface AudiencePartnerFit {
  readonly partnerId: string;
  readonly partnerBrand: string;
  readonly workspaceId: string;
  readonly fitScore: number;
  readonly audienceRelevance: number;
  readonly valueAlignment: number;
  readonly authenticityRisk: number;
  readonly verdict: AudiencePartnerFitVerdict;
  readonly reasons: readonly string[];
  readonly generatedAt: string;
}

export type AudiencePartnerFitVerdict =
  | 'strong_fit'
  | 'moderate_fit'
  | 'weak_fit'
  | 'mismatch';

/**
 * Advisory result for optimal mention/promotion timing.
 */
export interface MentionTiming {
  readonly mentionReady: boolean;
  readonly optimalWindow: boolean;
  readonly saturationIndex: number;
  readonly daysSinceLastMention: number;
  readonly engagementSinceLastMention: number;
  readonly audienceReceptivity: number;
  readonly recommendation: MentionTimingRecommendation;
  readonly reason: string;
  readonly generatedAt: string;
}

export type MentionTimingRecommendation = 'now' | 'wait' | 'pause' | 'never';

/**
 * Detection of whether an audience is saturated with promotions.
 */
export interface AudienceSaturation {
  readonly saturated: boolean;
  readonly saturationIndex: number;
  readonly promotionRatio: number;
  readonly recentMentions: number;
  readonly negativeSignalCount: number;
  readonly disengagementTrend: DisengagementTrend;
  readonly reason: string;
  readonly generatedAt: string;
}

export type DisengagementTrend = 'rising' | 'stable' | 'falling';

/**
 * Authenticity protection analysis for creator messaging.
 */
export interface AuthenticityProtection {
  readonly authenticityScore: number;
  readonly atRisk: boolean;
  readonly organicRatio: number;
  readonly endorsementConsistency: number;
  readonly warningFlags: readonly AuthenticityWarningFlag[];
  readonly generatedAt: string;
}

export interface AuthenticityWarningFlag {
  readonly kind: AuthenticityWarningKind;
  readonly confidence: number;
  readonly matchedPattern: string;
}

export type AuthenticityWarningKind =
  | 'overselling'
  | 'misleading_claim'
  | 'forced_endorsement'
  | 'value_misalignment'
  | 'audience_gaslighting';

/**
 * Engagement versus conversion balance tracker.
 */
export interface EngagementVsConversion {
  readonly engagementRate: number;
  readonly conversionPressure: number;
  readonly balance: EngagementConversionBalance;
  readonly organicRatio: number;
  readonly promotionRatio: number;
  readonly responseQuality: number;
  readonly interactionFrequency: number;
  readonly reason: string;
  readonly generatedAt: string;
}

export type EngagementConversionBalance =
  | 'healthy'
  | 'leaning_conversion'
  | 'leaning_engagement'
  | 'crisis';

/**
 * Creator trust capital tracker — extends Camada IX trust for
 * creator-audience relationships. Measures accumulated trust capital
 * between a creator and their audience, distinct from per-conversation
 * trust states.
 */
export interface CreatorTrustCapital {
  readonly workspaceId: string;
  readonly trustCapital: number;
  readonly audienceTrust: number;
  readonly authenticityIndex: number;
  readonly consistencyScore: number;
  readonly recommendationFidelity: number;
  readonly recoveryCapacity: number;
  readonly audienceRetentionRate: number;
  readonly verdict: CreatorTrustVerdict;
  readonly reason: string;
  readonly generatedAt: string;
}

export type CreatorTrustVerdict = 'strong' | 'stable' | 'eroding' | 'depleted';

/**
 * Input event for creator detectors — a lightweight event reference
 * with message body for content analysis.
 */
export interface CreatorEvent {
  readonly eventId: string;
  readonly eventName: string;
  readonly occurredAt: string;
  readonly valence?: 'positive' | 'negative' | 'neutral' | 'ambiguous';
  readonly payload?: Readonly<Record<string, unknown>>;
}
