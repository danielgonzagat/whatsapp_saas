/**
 * UTP-TEAM-001..007 — Camada XII: Team Augmentation
 *
 * Types for the third stage: Kloel accepted as ally by the human team.
 * All types are plain data — no NestJS decorators.
 *
 * Camada XII capabilities:
 *   - pre-call context builder
 *   - next-best-action suggester
 *   - forgotten-followup rescuer
 *   - blind-spot illuminator
 *   - smart handoff
 *   - team-respect protocol
 *   - operator feedback loop
 */

import type { AbiValence } from '../abi/abi-schema';
import type { SpineEventRef } from '../mind/mind.types';

export interface LeadHistoryEntry {
  readonly eventId: string;
  readonly eventName: string;
  readonly occurredAt: string;
  readonly summary: string;
  readonly valence?: AbiValence;
}

export interface ValenceTraceEntry {
  readonly eventId: string;
  readonly valence: AbiValence;
  readonly weight: number;
  readonly occurredAt: string;
}

export interface PreCallContext {
  readonly leadId: string;
  readonly conversationId: string;
  readonly workspaceId: string;
  readonly leadHistory: readonly LeadHistoryEntry[];
  readonly valenceTrace: readonly ValenceTraceEntry[];
  readonly openQuestions: readonly string[];
  readonly currentStage?: string;
  readonly lastContactAt?: string;
  readonly assembledAt: string;
}

export type TeamDelegationRiskClass = 'R1' | 'R2' | 'R3' | 'R4';

export type TeamDelegationMode =
  | 'allowed_alone'
  | 'requires_review'
  | 'human_only';

export type TeamRollbackAction =
  | 'dismiss_suggestion'
  | 'snooze_suggestion'
  | 'manual_review';

export interface LeadOutcomeGuardrail {
  readonly antiPressureLanguage: boolean;
  readonly respectsSilenceWindow: boolean;
  readonly requiresContextQualification: boolean;
  readonly maxFollowupAttempts?: number;
}

export interface SuggestionR1Contract {
  readonly riskClass: TeamDelegationRiskClass;
  readonly delegationMode: TeamDelegationMode;
  readonly safeNextStep: string;
  readonly rollback: readonly TeamRollbackAction[];
  readonly leadOutcomeGuardrail: LeadOutcomeGuardrail;
}

export interface NextBestAction {
  readonly rank: number;
  readonly action: string;
  readonly rationale: string;
  readonly confidence: number;
  readonly evidenceRefs: readonly string[];
  readonly guardrails: readonly string[];
  readonly r1Contract: SuggestionR1Contract;
}

export interface ForgottenFollowup {
  readonly leadId: string;
  readonly workspaceId: string;
  readonly silentAt: string;
  readonly silentDurationHours: number;
  readonly budgetHours: number;
  readonly lastOperatorActionAt?: string;
  readonly urgency: 'low' | 'medium' | 'high';
  readonly r1Contract: SuggestionR1Contract;
}

export interface BlindSpotEntry {
  readonly leadId: string;
  readonly workspaceId: string;
  readonly reason: string;
  readonly lastTouchAt?: string;
  readonly assignedOperatorId?: string;
  readonly activityCount: number;
}

export interface HandoffPackage {
  readonly leadId: string;
  readonly conversationId: string;
  readonly workspaceId: string;
  readonly preCallContext: PreCallContext;
  readonly suggestedActions: readonly NextBestAction[];
  readonly trustState?: Readonly<Record<string, unknown>>;
  readonly maturityStage?: string;
  readonly packagedAt: string;
}

export type OperatorAction = 'dismiss' | 'accept' | 'override' | 'snooze';

export interface SuggestionDismissal {
  readonly suggestionId: string;
  readonly operatorId: string;
  readonly action: OperatorAction;
  readonly note?: string;
  readonly dismissedAt: string;
}

export interface FeedbackEntry {
  readonly suggestionId: string;
  readonly accepted: boolean;
  readonly operatorNote?: string;
  readonly submittedAt: string;
  readonly workspaceId: string;
  readonly operatorId: string;
}

export interface PreCallContextInput {
  readonly leadId: string;
  readonly conversationId: string;
  readonly workspaceId: string;
  readonly events: readonly SpineEventRef[];
  readonly nowIso?: string;
}

export interface ForgottenFollowupInput {
  readonly workspaceId: string;
  readonly events: readonly SpineEventRef[];
  readonly budgetHours?: number;
  readonly nowIso?: string;
}

export interface BlindSpotInput {
  readonly workspaceId: string;
  readonly events: readonly SpineEventRef[];
  readonly windowHours?: number;
  readonly nowIso?: string;
}

export interface SuggestInput {
  readonly context: PreCallContext;
  readonly maturityStage?: string;
  readonly trustState?: Readonly<Record<string, unknown>>;
}

export interface FeedbackInput {
  readonly suggestionId: string;
  readonly accepted: boolean;
  readonly operatorId: string;
  readonly workspaceId: string;
  readonly operatorNote?: string;
}
