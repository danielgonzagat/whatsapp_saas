/**
 * Camada XXII — Decision Clarity types.
 *
 * AttentionRankerService classifies decision items by
 * urgency × impact × (1 - reversibility) into a 4-tier
 * hierarchy. Default is silence when nothing crosses threshold.
 * B-rules: B0.10. R: R26.
 */

/** ── utility ── */

import { clampScore } from '../../common/math';
export { clampScore };

/** ── pre-existing shared types ── */

export type DecisionTier = 'AGORA' | 'ESTA_SEMANA' | 'PARA_SABER' | 'ARQUIVO';

export interface RankingInput {
  readonly itemId: string;
  readonly workspaceId: string;
  readonly label: string;
  readonly urgency: number;
  readonly impact: number;
  readonly reversibility: number;
}

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

/** ── noise filter ── */

export const DEFAULT_NOISE_THRESHOLD = 0.1;

export interface NoiseFilter {
  readonly threshold: number;
  readonly silent: boolean;
  readonly filteredCount: number;
  readonly totalCount: number;
  readonly lastFilteredAt: string;
}

export interface NoiseFilterInput {
  readonly rankings: readonly AttentionRanking[];
  readonly threshold: number;
  readonly silent: boolean;
  readonly nowMs: number;
}

/** ── hierarchy projector ── */

export interface HierarchyProjectionInput {
  readonly rankings: readonly AttentionRanking[];
}

/** ── anxiety mode detector ── */

export const ANXIETY_OVERLOAD_FACTOR_THRESHOLD = 0.5;
export const ANXIETY_URGENT_COUNT_THRESHOLD = 3;
export const ANXIETY_BACKLOG_THRESHOLD = 5;
export const ANXIETY_COOLDOWN_MS = 10 * 60 * 1000;

export interface AnxietyMode {
  readonly active: boolean;
  readonly triggeredAt: string | null;
  readonly triggerReason: string | null;
  readonly cooldownUntil: string | null;
}

export interface AnxietyTrigger {
  readonly workspaceId: string;
  readonly overloadFactor: number;
  readonly urgentItemCount: number;
  readonly decisionBacklog: number;
  readonly nowMs: number;
}

/** ── feedback loop ── */

export interface ClarityFeedback {
  readonly feedbackId: string;
  readonly itemId: string;
  readonly workspaceId: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly receivedAt: string;
  readonly appliedToRanking: boolean;
}

export interface FeedbackInput {
  readonly feedback: ClarityFeedback;
  readonly rankings: readonly AttentionRanking[];
  readonly nowMs: number;
}

/** ── narrative builder ── */

export interface ShortNarrative {
  readonly narrativeId: string;
  readonly workspaceId: string;
  readonly topItems: readonly AttentionRanking[];
  readonly message: string;
  readonly generatedAt: string;
  readonly anxietyActive: boolean;
}

export interface NarrativeInput {
  readonly workspaceId: string;
  readonly rankings: readonly AttentionRanking[];
  readonly anxietyMode: AnxietyMode;
  readonly nowMs: number;
}

/** ── AttentionRankerService (UTP-CLARITY-001) new types ── */

export interface AttentionItem {
  readonly id: string;
  readonly urgency: number;
  readonly impact: number;
  readonly reversibility: number;
  readonly evidenceLevel: number;
}

export interface RankedItem {
  readonly id: string;
  readonly score: number;
  readonly tier: DecisionTier;
  readonly urgency: number;
  readonly impact: number;
  readonly reversibility: number;
  readonly evidenceLevel: number;
}

export interface AttentionRankingResult {
  readonly ranked: readonly RankedItem[];
  readonly silent: boolean;
  readonly dominatedTier: DecisionTier | null;
}
