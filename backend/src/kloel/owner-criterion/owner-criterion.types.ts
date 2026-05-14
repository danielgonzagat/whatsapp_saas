/**
 * UTP-OWNER-CRIT-001..008 — Camada XVI (Owner Criterion Memory).
 *
 * The Kloel learns how the owner wants to operate through coexistence,
 * not through a configuration form. Six observer types watch owner
 * behavior across the commercial surface and infer criteria that
 * are projected into the ABI as context.
 *
 * Implements B0.2 (delegation confidence), B1 (no behavioral
 * instruction to LLM), and the Camada XVI semantics from the
 * Cognitive Organism Plan (Parte B — OWNER-CRIT family).
 */

import type { SpineEventRef } from '../mind/mind.types';

export type DecisionKind =
  | 'override'
  | 'escalation'
  | 'rejection'
  | 'autonomy_grant'
  | 'autonomy_revoke';

export interface DecisionObservation {
  readonly observationId: string;
  readonly workspaceId: string;
  readonly decisionKind: DecisionKind;
  readonly targetDomain: string;
  readonly chosenAction: string;
  readonly alternativesObserved: readonly string[];
  readonly observedAt: string;
  readonly evidenceEventIds: readonly string[];
  readonly confidence: number;
}

export type CorrectionKind =
  | 'message_rewrite'
  | 'classification_fix'
  | 'action_reversal'
  | 'policy_adjustment';

export interface FutureBehaviorChange {
  readonly declarativeRule: string;
  readonly targetDomain: string;
  readonly behaviorConstraint: string;
  readonly confidence: number;
}

export interface CorrectionObservation {
  readonly observationId: string;
  readonly workspaceId: string;
  readonly correctedTarget: string;
  readonly originalOutput: string;
  readonly correctedOutput: string;
  readonly correctionKind: CorrectionKind;
  readonly observedAt: string;
  readonly evidenceEventIds: readonly string[];
  readonly confidence: number;
  readonly learnedCriterion: string;
  readonly futureBehaviorChange: FutureBehaviorChange;
  readonly acceptedWithoutDefense: boolean;
}

export interface ToneObservation {
  readonly observationId: string;
  readonly workspaceId: string;
  readonly directness: number;
  readonly formality: number;
  readonly vocabularyComplexity: number;
  readonly preferredPhrases: readonly string[];
  readonly avoidedPhrases: readonly string[];
  readonly observedAt: string;
  readonly evidenceEventIds: readonly string[];
  readonly confidence: number;
}

export type RiskAppetite = 'conservative' | 'moderate' | 'aggressive';

export interface RiskToleranceObservation {
  readonly observationId: string;
  readonly workspaceId: string;
  readonly riskAppetite: RiskAppetite;
  readonly confidence: number;
  readonly evidenceSignals: readonly string[];
  readonly observedAt: string;
  readonly evidenceEventIds: readonly string[];
}

export type EthicalBoundaryType =
  | 'compliance_hard'
  | 'compliance_soft'
  | 'reputation'
  | 'customer_protection'
  | 'data_privacy';

export interface EthicalLineObservation {
  readonly observationId: string;
  readonly workspaceId: string;
  readonly boundaryType: EthicalBoundaryType;
  readonly boundaryDescription: string;
  readonly triggerContext: string;
  readonly confidence: number;
  readonly observedAt: string;
  readonly evidenceEventIds: readonly string[];
}

export type ThresholdDomain =
  | 'autopilot_auto_reply'
  | 'lead_qualification'
  | 'deal_advancement'
  | 'payment_processing'
  | 'campaign_launch';

export type ThresholdLevel = 'low' | 'medium' | 'high' | 'manual_only';

export interface ApprovalThresholdObservation {
  readonly observationId: string;
  readonly workspaceId: string;
  readonly thresholdDomain: ThresholdDomain;
  readonly thresholdLevel: ThresholdLevel;
  readonly confidence: number;
  readonly autoApprovalRate: number;
  readonly manualOverrideRate: number;
  readonly observedAt: string;
  readonly evidenceEventIds: readonly string[];
}

export interface OwnerDecisionPattern {
  readonly mostFrequentDecisionKind: DecisionKind;
  readonly overrideRate: number;
  readonly escalationRate: number;
  readonly autonomyGrantRate: number;
  readonly topTargetDomains: readonly string[];
  readonly confidence: number;
}

export interface OwnerCorrectionPattern {
  readonly mostFrequentCorrectionKind: CorrectionKind;
  readonly correctionRate: number;
  readonly messageRewriteRate: number;
  readonly classificationFixRate: number;
  readonly actionReversalRate: number;
  readonly topCorrectedTargets: readonly string[];
  readonly confidence: number;
}

export interface OwnerToneProfile {
  readonly directness: number;
  readonly formality: number;
  readonly vocabularyComplexity: number;
  readonly stabilityScore: number;
  readonly confidence: number;
}

export interface OwnerRiskProfile {
  readonly riskAppetite: RiskAppetite;
  readonly stabilityScore: number;
  readonly confidence: number;
}

export interface OwnerEthicalProfile {
  readonly boundaries: readonly {
    readonly boundaryType: EthicalBoundaryType;
    readonly description: string;
    readonly confidence: number;
  }[];
  readonly confidence: number;
}

export interface OwnerApprovalProfile {
  readonly thresholds: readonly {
    readonly domain: ThresholdDomain;
    readonly level: ThresholdLevel;
    readonly confidence: number;
  }[];
  readonly overallAutoApprovalRate: number;
  readonly confidence: number;
}

export interface OwnerCriterionProjection {
  readonly workspaceId: string;
  readonly decisionPattern: OwnerDecisionPattern;
  readonly correctionPattern: OwnerCorrectionPattern;
  readonly toneProfile: OwnerToneProfile;
  readonly riskProfile: OwnerRiskProfile;
  readonly ethicalProfile: OwnerEthicalProfile;
  readonly approvalProfile: OwnerApprovalProfile;
  readonly lastUpdated: string;
  readonly totalObservations: number;
  readonly observationWindows: number;
}

export interface CriterionEvidence {
  readonly criterionName: string;
  readonly workspaceId: string;
  readonly observationCount: number;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly confidence: number;
  readonly stabilityScore: number;
  readonly notablePatterns: readonly string[];
  readonly generatedAt: string;
}

export interface ObserverInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly nowMs: number;
  readonly windowDays: number;
}
