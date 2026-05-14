/**
 * UTP-CLARITY-001..006 — Camada XX (Clarity — Cognitive Prioritization).
 *
 * Reduzir o mundo a poucas decisoes certas agora.
 * Default is silence. Anxiety collapses everything to AGORA.
 *
 * Types: AttentionRanking, DecisionTier, NoiseFilter, AnxietyMode,
 * ClarityFeedback, ShortNarrative.
 */

export type DecisionTier = 'AGORA' | 'ESTA_SEMANA' | 'PARA_SABER' | 'ARQUIVO';

export interface AttentionRanking {
  readonly itemId: string;
  readonly workspaceId: string;
  readonly label: string;
  readonly urgency: number;
  readonly impact: number;
  readonly reversibility: number;
  readonly score: number;
  readonly tier: DecisionTier;
  readonly rankedAt: string;
}

export interface NoiseFilter {
  readonly threshold: number;
  readonly silent: boolean;
  readonly filteredCount: number;
  readonly totalCount: number;
  readonly lastFilteredAt: string;
}

export interface AnxietyMode {
  readonly active: boolean;
  readonly triggeredAt: string | null;
  readonly triggerReason: string | null;
  readonly cooldownUntil: string | null;
}

export interface ClarityFeedback {
  readonly feedbackId: string;
  readonly itemId: string;
  readonly workspaceId: string;
  readonly rating: -1 | 0 | 1;
  readonly comment: string | null;
  readonly receivedAt: string;
  readonly appliedToRanking: boolean;
}

export interface ShortNarrative {
  readonly narrativeId: string;
  readonly workspaceId: string;
  readonly topItems: readonly AttentionRanking[];
  readonly message: string;
  readonly generatedAt: string;
  readonly anxietyActive: boolean;
}

export interface RankingInput {
  readonly itemId: string;
  readonly workspaceId: string;
  readonly label: string;
  readonly urgency: number;
  readonly impact: number;
  readonly reversibility: number;
}

export interface HierarchyProjectionInput {
  readonly rankings: readonly AttentionRanking[];
}

export interface NoiseFilterInput {
  readonly rankings: readonly AttentionRanking[];
  readonly threshold: number;
  readonly silent: boolean;
  readonly nowMs: number;
}

export interface AnxietyTrigger {
  readonly workspaceId: string;
  readonly overloadFactor: number;
  readonly urgentItemCount: number;
  readonly decisionBacklog: number;
  readonly nowMs: number;
}

export interface FeedbackInput {
  readonly feedback: ClarityFeedback;
  readonly rankings: readonly AttentionRanking[];
  readonly nowMs: number;
}

export interface NarrativeInput {
  readonly workspaceId: string;
  readonly rankings: readonly AttentionRanking[];
  readonly anxietyMode: AnxietyMode;
  readonly nowMs: number;
}

export const DEFAULT_NOISE_THRESHOLD = 0.3;
export const ANXIETY_OVERLOAD_FACTOR_THRESHOLD = 0.7;
export const ANXIETY_URGENT_COUNT_THRESHOLD = 5;
export const ANXIETY_BACKLOG_THRESHOLD = 15;
export const ANXIETY_COOLDOWN_MS = 30 * 60 * 1000;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampScore(value: number): number {
  return clamp(value, 0, 1);
}
