/**
 * UTP-INCENT-001..008 — Camada XXXIV (Cognitive Organism — Incentive Integrity).
 *
 * Recomendação cruzada sem conflito oculto, sem viés de plataforma.
 * This module explains recommendations, detects conflicts of interest,
 * enforces silence under conflict, monitors platform bias, auto-discloses
 * Kloel↔party links, exports third-party audit bundles, processes user
 * feedback corrections, and builds recommendation attributions.
 *
 * All services are pure logic — no Prisma, no external dependencies.
 * Uses canonical PCI.1 event taxonomy domain `incentive.*`.
 */
import type { SpineEventRef } from '../mind/mind.types';

export type ExplanationTone = 'educational' | 'transparent' | 'actionable' | 'deferential';

export type ExplanationFormat = 'short' | 'medium' | 'long';

export interface RecommendationExplanation {
  readonly id: string;
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly recommendationSummary: string;
  readonly reasonForUser: string;
  readonly evidenceReferences: readonly string[];
  readonly tone: ExplanationTone;
  readonly format: ExplanationFormat;
  readonly confidenceScore: number;
  readonly explainedAt: string;
}

export type ConflictKind =
  | 'financial_interest'
  | 'platform_preference'
  | 'commission_bias'
  | 'exclusive_partnership'
  | 'cross_ownership'
  | 'data_leverage'
  | 'self_dealing';

export type ConflictSeverity = 'none' | 'potential' | 'actual' | 'structural';

export interface ConflictDetection {
  readonly id: string;
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly conflictDetected: boolean;
  readonly kind: ConflictKind;
  readonly severity: ConflictSeverity;
  readonly affectedParties: readonly string[];
  readonly evidence: readonly string[];
  readonly detectedAt: string;
}

export type SilenceRule =
  | 'structural_conflict'
  | 'lack_of_disclosure'
  | 'platform_bias_alert'
  | 'user_override';

export interface SilenceUnderConflict {
  readonly id: string;
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly silenced: boolean;
  readonly reason: SilenceRule;
  readonly conflictRef: string;
  readonly enforcement: 'automatic' | 'human_review_required';
  readonly silencedAt: string;
  readonly expirationAt?: string;
}

export type BiasSource =
  | 'internal_revenue'
  | 'commission_structure'
  | 'marketplace_ranking'
  | 'platform_lock_in'
  | 'exclusivity_clause';

export type BiasLevel = 'none' | 'low' | 'moderate' | 'high' | 'extreme';

export interface PlatformBias {
  readonly id: string;
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly biasDetected: boolean;
  readonly source: BiasSource;
  readonly level: BiasLevel;
  readonly internalRevenueWeight: number;
  readonly fairWeight: number;
  readonly weightDelta: number;
  readonly mitigationApplied: boolean;
  readonly explanation: string;
  readonly detectedAt: string;
}

export type RelationshipType =
  | 'ownership'
  | 'commission'
  | 'affiliate'
  | 'marketplace'
  | 'referral'
  | 'sponsorship'
  | 'partnership';

export interface Disclosure {
  readonly id: string;
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly disclosingEntity: string;
  readonly relationshipType: RelationshipType;
  readonly relationshipDescription: string;
  readonly financialNature: boolean;
  readonly compensationModel?: string;
  readonly disclosedAt: string;
  readonly disclosureText: string;
}

export interface ThirdPartyAuditExport {
  readonly workspaceId: string;
  readonly auditId: string;
  readonly generatedAt: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly recommendations: readonly AuditRecommendation[];
  readonly explanations: readonly RecommendationExplanation[];
  readonly conflicts: readonly ConflictDetection[];
  readonly silenceEvents: readonly SilenceUnderConflict[];
  readonly biasReports: readonly PlatformBias[];
  readonly disclosures: readonly Disclosure[];
  readonly feedbackCorrections: readonly UserFeedbackCorrection[];
  readonly attributions: readonly RecommendationAttribution[];
  readonly summary: AuditSummary;
}

interface AuditRecommendation {
  readonly recommendationId: string;
  readonly summary: string;
  readonly outcome: string;
  readonly issuedAt: string;
}

interface AuditSummary {
  readonly totalRecommendations: number;
  readonly conflictsDetected: number;
  readonly silenceEvents: number;
  readonly biasAlerts: number;
  readonly disclosuresIssued: number;
  readonly feedbackCorrectionsApplied: number;
  readonly healthyRecommendationRate: number;
}

export type FeedbackKind =
  | 'corrected'
  | 'declined'
  | 'modified'
  | 'alternative_chosen'
  | 'inaccurate';

export interface UserFeedbackCorrection {
  readonly id: string;
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly feedbackKind: FeedbackKind;
  readonly originalRecommendation: string;
  readonly userCorrection: string;
  readonly learnedSignal: string;
  readonly appliedToModel: boolean;
  readonly correctedAt: string;
}

export type AttributionKind =
  | 'platform_data'
  | 'user_history'
  | 'peer_behavior'
  | 'market_trend'
  | 'business_rule'
  | 'expert_knowledge'
  | 'third_party_data';

export interface RecommendationAttribution {
  readonly id: string;
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly attributions: readonly AttributionEntry[];
  readonly isCrossRecommendation: boolean;
  readonly crossSourceCount: number;
  readonly primarySource: AttributionKind;
  readonly transparencyScore: number;
  readonly builtAt: string;
}

export interface AttributionEntry {
  readonly kind: AttributionKind;
  readonly label: string;
  readonly evidenceRef: string;
  readonly weight: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function filterByWorkspace(
  events: readonly SpineEventRef[],
  workspaceId: string,
): readonly SpineEventRef[] {
  return events.filter((e) => e.workspaceId === workspaceId);
}

export function makeIncidentId(prefix: string, seq: number): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${ts}_${seq}_${rnd}`;
}

export function biasLevelFromDelta(delta: number): BiasLevel {
  const absDelta = Math.abs(delta);
  if (absDelta >= 0.4) {
    return 'extreme';
  }
  if (absDelta >= 0.25) {
    return 'high';
  }
  if (absDelta >= 0.12) {
    return 'moderate';
  }
  if (absDelta >= 0.03) {
    return 'low';
  }
  return 'none';
}

export function weightedAverage(values: readonly number[], weights: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) {
    return 0;
  }
  const weighted = values.reduce((sum, v, i) => sum + v * (weights[i] ?? 0), 0);
  return weighted / totalWeight;
}
