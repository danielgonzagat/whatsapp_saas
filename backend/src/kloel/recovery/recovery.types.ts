/**
 * UTP-RECOVERY-001..007 — Camada XIV (Mature Failure Recovery).
 *
 * Converts errors into trust-building events through seven mechanisms:
 * self-detection, honest acknowledgment, commercial explanation,
 * non-repeat guarding, damage recovery tactics, weekly narrative
 * integration, and trust-after-error trajectory tracking.
 *
 * Implements B0.2 (R18 metrics) and the Camada XIV semantics
 * from the Cognitive Organism Plan (Parte B — RECOVERY family).
 */
import type { SpineEventRef } from '../mind/mind.types';

export type ErrorCategory =
  | 'handoff'
  | 'decline'
  | 'misclassification'
  | 'delay'
  | 'wrong_action'
  | 'missed_opportunity'
  | 'double_send'
  | 'inappropriate_timing'
  | 'unknown';

export interface ErrorFingerprint {
  readonly kind: ErrorCategory;
  readonly workspaceId: string;
  readonly entityRef?: string | undefined;
  readonly eventPatternHash: string;
  readonly firstSeenAt: string;
  readonly repeatCount: number;
  readonly lastSeenAt: string;
}

export interface DetectedError {
  readonly errorId: string;
  readonly category: ErrorCategory;
  readonly workspaceId: string;
  readonly detectedAt: string;
  readonly evidenceEventIds: readonly string[];
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly fingerprint: ErrorFingerprint;
}

export interface Acknowledgment {
  readonly errorId: string;
  readonly message: string;
  readonly channel: 'whatsapp' | 'dashboard' | 'email' | 'silent';
  readonly generatedAt: string;
  readonly whatKloelKnows: string;
  readonly whatKloelDoesNotKnow: string;
  readonly safeNextStep: string;
  readonly repairStance: 'non_defensive' | 'investigating' | 'correcting';
}

export interface ErrorExplanation {
  readonly errorId: string;
  readonly summary: string;
  readonly whatHappened: string;
  readonly why: string;
  readonly generatedAt: string;
  readonly evidenceConfidence: 'observed' | 'inferred' | 'uncertain';
  readonly evidenceGaps: string;
  readonly safeNextStep: string;
  readonly certaintyLevel: 'high' | 'moderate' | 'low';
}

export interface RecoveryTactic {
  readonly tacticId: string;
  readonly errorId: string;
  readonly action: RecoveryAction;
  readonly description: string;
  readonly estimatedCostCents: number;
  readonly safetyContract: RecoverySafetyContract;
  readonly generatedAt: string;
}

type RecoveryDelegationRiskClass = 'R1' | 'R2' | 'R3' | 'R4';

type RecoveryDelegationMode =
  | 'allowed_alone'
  | 'requires_review'
  | 'human_only';

export interface RecoverySafetyContract {
  readonly riskClass: RecoveryDelegationRiskClass;
  readonly delegationMode: RecoveryDelegationMode;
  readonly safeNextStep: string;
  readonly rollback: readonly string[];
  readonly leadOutcomeGuardrail: string;
}

export type RecoveryAction =
  | 'small_concession'
  | 'expedited_handling'
  | 'priority_review'
  | 'follow_up_personal'
  | 'discount_offer'
  | 'free_extension'
  | 'manual_review'
  | 'silence'
  | 'apologize';

export interface ErrorNarrative {
  readonly narrativeId: string;
  readonly weekStart: string;
  readonly workspaceId: string;
  readonly errors: readonly ErrorNarrativeEntry[];
  readonly recoverySummary: string;
  readonly trustImpact: 'improving' | 'stable' | 'declining';
}

export interface ErrorNarrativeEntry {
  readonly errorId: string;
  readonly category: ErrorCategory;
  readonly detectedAt: string;
  readonly recoveryTactic: RecoveryAction | null;
  readonly outcome: 'recovered' | 'pending' | 'unresolved';
}

export interface TrustAfterErrorSnapshot {
  readonly workspaceId: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly totalErrors: number;
  readonly autoDetectedErrors: number;
  readonly autoDetectionRate: number;
  readonly nonRepetitionRate: number;
  readonly trustTrend: 'up' | 'flat' | 'down';
  readonly r18Score: number;
  readonly generatedAt: string;
}

export interface ErrorDetectorInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly nowMs: number;
  readonly windowDays: number;
}
export interface NonRepeatCommitment {
  readonly learnedFrom: string;
  readonly preventiveChange: string;
  readonly commitmentStatement: string;
  readonly guardActive: boolean;
  readonly repeatBlockedUntil: string | null;
}

export interface RecoveryProofPackage {
  readonly proofId: string;
  readonly errorId: string;
  readonly workspaceId: string;
  readonly generatedAt: string;
  readonly acknowledgment: Acknowledgment;
  readonly explanation: ErrorExplanation;
  readonly tactic: RecoveryTactic;
  readonly nonRepeatCommitment: NonRepeatCommitment;
  readonly whatKloelKnows: string;
  readonly whatKloelDoesNotKnow: string;
  readonly safeNextStep: string;
  readonly repairStance: Acknowledgment['repairStance'];
  readonly riskClass: RecoveryDelegationRiskClass;
  readonly delegationMode: RecoveryDelegationMode;
  readonly rollback: readonly string[];
  readonly autonomyRaised: false;
  readonly messageSent: false;
  readonly concessionOffered: false;
}

export function hashEventPattern(events: readonly SpineEventRef[]): string {
  const names = events.map((e) => e.eventName).sort().join('|');
  let hash = 0;
  for (let i = 0; i < names.length; i++) {
    const ch = names.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return String(Math.abs(hash)).padStart(8, '0');
}
