/**
 * UTP-DEFENS-001..009 — Camada 30: Defensibility Assets
 *
 * Cada operacao tatica emite sinal para ativos estrategicos defensaveis.
 * This module registers, tracks, and analyzes defensible assets: owned
 * audience, social proof, case library, positioning uniqueness, authority
 * building, tactical-tradeoff advising, and defensibility narratives.
 *
 * All services are pure logic — no Prisma, no external dependencies.
 * They consume spine events (via PCI.1 canonical taxonomy) and produce
 * structured assessments that feed the cognitive organism's strategic layer.
 *
 * Implements B17 (every commercial surface is cognitive tissue) and
 * PCI.5 universal conventions.
 */

import type { SpineEventRef } from '../mind/mind.types';

export type AssetKind =
  | 'owned_audience'
  | 'social_proof'
  | 'case_library'
  | 'positioning'
  | 'authority'
  | 'brand_trust'
  | 'community'
  | 'data_asset'
  | 'process_moat'
  | 'switching_cost';

export type AssetStrength = 'nascent' | 'building' | 'established' | 'formidable';

export type GrowthTrend = 'declining' | 'flat' | 'growing' | 'accelerating';

export type TacticalScore = 'strongly_tactical' | 'mostly_tactical' | 'balanced' | 'mostly_defensible' | 'strongly_defensible';

export type ProofKind =
  | 'testimonial'
  | 'review'
  | 'case_study'
  | 'numeric_result'
  | 'endorsement'
  | 'media_mention';

export type CaseOutcomeKind =
  | 'revenue_growth'
  | 'cost_reduction'
  | 'time_saved'
  | 'risk_mitigated'
  | 'audience_growth'
  | 'capability_unlocked';

export type PositioningSignalKind =
  | 'price_premium'
  | 'category_creation'
  | 'unique_methodology'
  | 'exclusive_data'
  | 'network_effects'
  | 'regulatory_moat';

export type AuthorityPlatform =
  | 'blog'
  | 'podcast'
  | 'youtube'
  | 'social_media'
  | 'conference'
  | 'book'
  | 'course'
  | 'newsletter';

export interface DefensibleAsset {
  readonly workspaceId: string;
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly label: string;
  readonly strength: AssetStrength;
  readonly score: number;
  readonly firstRecordedAt: string;
  readonly lastUpdatedAt: string;
  readonly evidence: readonly string[];
}

export interface AssetGrowth {
  readonly workspaceId: string;
  readonly assetId: string;
  readonly trend: GrowthTrend;
  readonly growthRate: number;
  readonly previousScore: number;
  readonly currentScore: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly assessedAt: string;
}

export interface OwnedAudience {
  readonly workspaceId: string;
  readonly channel: string;
  readonly estimatedSize: number;
  readonly engagementRate: number;
  readonly growthRate: number;
  readonly ownershipLevel: number;
  readonly platformRisk: number;
  readonly assessedAt: string;
}

export interface SocialProof {
  readonly workspaceId: string;
  readonly proofId: string;
  readonly kind: ProofKind;
  readonly source: string;
  readonly url: string | undefined;
  readonly summary: string;
  readonly credibilityScore: number;
  readonly visibilityScore: number;
  readonly recordedAt: string;
}

export interface CaseLibrary {
  readonly workspaceId: string;
  readonly caseId: string;
  readonly title: string;
  readonly outcomeKind: CaseOutcomeKind;
  readonly outcomeSummary: string;
  readonly metrics: readonly CaseMetric[];
  readonly proofCount: number;
  readonly reusabilityScore: number;
  readonly recordedAt: string;
}

export interface CaseMetric {
  readonly label: string;
  readonly value: string;
  readonly trend: string;
}

export interface PositioningUniqueness {
  readonly workspaceId: string;
  readonly signalKind: PositioningSignalKind;
  readonly strength: number;
  readonly evidence: readonly string[];
  readonly competitorOverlap: number;
  readonly assessedAt: string;
}

export interface AuthorityBuilding {
  readonly workspaceId: string;
  readonly platform: AuthorityPlatform;
  readonly contentCount: number;
  readonly consistencyScore: number;
  readonly reachScore: number;
  readonly depthScore: number;
  readonly assessedAt: string;
}

export interface DefensibleVsTacticalTradeoff {
  readonly workspaceId: string;
  readonly tacticalScore: TacticalScore;
  readonly tacticalMix: number;
  readonly defensibleMix: number;
  readonly atRiskAssets: readonly string[];
  readonly recommendations: readonly string[];
  readonly assessedAt: string;
}

export type SwitchingCostDimension =
  | 'memory'
  | 'criterion'
  | 'context'
  | 'judgment'
  | 'commercial_capital';

export interface ReplacementPainItem {
  readonly dimension: SwitchingCostDimension;
  readonly label: string;
  readonly evidenceLevel: 'proven' | 'emerging' | 'not_yet_proven';
  readonly reasoning: string;
  readonly nextEvidenceToCapture?: string;
}

export interface DefensibilityNarrative {
  readonly workspaceId: string;
  readonly summary: string;
  readonly topAssets: readonly string[];
  readonly weakestLinks: readonly string[];
  readonly defensibilityScore: number;
  readonly moatType: string;
  readonly narrativeText: string;
  readonly assessedAt: string;
  readonly switchingCostReasoning: string;
  readonly replacementPain: readonly ReplacementPainItem[];
  readonly replacementPainNarrative: string;
}

export interface EvidenceInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly nowMs?: number;
}

import { clamp } from '../../common/math';
export { clamp };

import { filterByWorkspace } from '../spine-events.helpers';
export { filterByWorkspace };

export function assetStrengthFromScore(score: number): AssetStrength {
  if (score >= 0.75) return 'formidable';
  if (score >= 0.5) return 'established';
  if (score >= 0.25) return 'building';
  return 'nascent';
}

export function growthTrendFromRate(rate: number): GrowthTrend {
  if (rate > 0.2) return 'accelerating';
  if (rate > 0.05) return 'growing';
  if (rate < -0.05) return 'declining';
  return 'flat';
}
