/**
 * UTP-TRUST-001..008 — Camada IX: Trust Capital Protection
 *
 * Per-conversation trust state with fatigue, desperation, timing
 * appropriateness, brand-protection, silence-as-action, human-handoff
 * trigger, and recovery tactics.
 *
 * All types are plain data — no NestJS decorators.
 */

import type { SpineEventRef } from '../mind/mind.types';

/**
 * A lightweight reference to a conversation, sufficient for trust tracking
 * without pulling in the full conversation model.
 */
export interface ConversationRef {
  readonly entityType: 'conversation';
  readonly entityId: string;
}

/**
 * A recent event summary as consumed by trust detectors. Subset of
 * the full SpineEventRef — only the fields trust needs.
 */
export interface TrustEvent {
  readonly eventId: string;
  readonly eventName: string;
  readonly occurredAt: string;
  readonly valence?: 'positive' | 'negative' | 'neutral' | 'ambiguous';
  readonly payload?: Readonly<Record<string, unknown>>;
}

/**
 * Converts a full SpineEventRef into the trust-consumable subset.
 */
export function toTrustEvent(ref: SpineEventRef): TrustEvent {
  return {
    eventId: ref.eventId,
    eventName: ref.eventName,
    occurredAt: ref.occurredAt,
    ...(ref.valence !== undefined ? { valence: ref.valence } : {}),
    ...(ref.payload !== undefined ? { payload: ref.payload } : {}),
  };
}

/**
 * Per-conversation trust state. Maintained by TrustStateTrackerService.
 */
export interface TrustState {
  readonly trustScore: number;
  readonly fatigueLevel: number;
  readonly desperationLevel: number;
  readonly lastInteractionAt: string;
  readonly silentInteractionsCount: number;
  readonly brandRiskFlags: readonly BrandRiskFlag[];
}

/**
 * Brand-risk classification produced by brand-protection guard.
 */
export interface BrandRiskFlag {
  readonly kind: BrandRiskKind;
  readonly confidence: number;
  readonly matchedPattern: string;
}

export type BrandRiskKind =
  | 'false_promise'
  | 'complaint_trigger'
  | 'pressure_tactic'
  | 'unsubstantiated_claim'
  | 'inappropriate_timing';

/**
 * Result of fatigue detection.
 */
export interface FatigueResult {
  readonly fatigued: boolean;
  readonly level: number;
  readonly reason: string;
}

/**
 * Result of desperation detection.
 */
export interface DesperationResult {
  readonly desperate: boolean;
  readonly level: number;
  readonly reason: string;
}

/**
 * Result of timing evaluation.
 */
export interface TimingResult {
  readonly appropriate: boolean;
  readonly localHour?: number;
  readonly peakWindow?: boolean;
  readonly reason: string;
}

/**
 * Result of silence-as-action policy.
 *
 * SilenceDecision carries an operational delegation contract so the
 * organism does not treat silence as passive inactivity. Every silence
 * decision includes a safe next step, a rollback path, and a guardrail
 * for lead outcome to prevent overreach after the decision.
 */
export interface SilenceDecision {
  readonly remainSilent: boolean;
  readonly reason: string;
  readonly riskClass: 'R1';
  readonly delegationMode: 'allowed_alone';
  readonly safeNextStep: string;
  readonly rollback: string;
  readonly leadOutcomeGuardrail: string;
}

/**
 * Result of human handoff trigger.
 */
export interface HandoffDecision {
  readonly shouldHandoff: boolean;
  readonly reason: string;
  readonly urgency: 'low' | 'medium' | 'high';
}

/**
 * Proposed trust-recovery action.
 */
export interface RecoveryAction {
  readonly action: RecoveryActionKind;
  readonly priority: number;
  readonly reason: string;
  readonly suggestedDelayMinutes: number;
}

export type RecoveryActionKind =
  | 'wait_and_cool_down'
  | 'acknowledge_mistake'
  | 'provide_value'
  | 'escalate_to_human'
  | 'change_channel'
  | 'reduce_frequency';
