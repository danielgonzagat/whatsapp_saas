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
}

export interface ErrorExplanation {
  readonly errorId: string;
  readonly summary: string;
  readonly whatHappened: string;
  readonly why: string;
  readonly generatedAt: string;
}

export interface RecoveryTactic {
  readonly tacticId: string;
  readonly errorId: string;
  readonly action: RecoveryAction;
  readonly description: string;
  readonly estimatedCostCents: number;
  readonly generatedAt: string;
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

export const ERROR_RECOVERY_EVENT_NAMES: ReadonlySet<string> = new Set([
  'commerce.whatsapp.handoff_to_human',
  'commerce.payment.declined',
  'commerce.lead.objection_raised',
  'commerce.lead.lost',
  'commerce.lead.went_silent',
  'commerce.crm.deal_lost',
  'commerce.payment.refunded',
  'commerce.payment.charged_back',
  'commerce.post_sale.churn_risk_detected',
  'pulse.gate_failed',
]);

export function hashEventPattern(events: readonly SpineEventRef[]): string {
  const names = events.map((e) => e.eventName).sort().join('|');
  let hash = 0;
  for (let i = 0; i < names.length; i++) {
    const ch = names.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return String(Math.abs(hash)).padStart(8, '0');
}
