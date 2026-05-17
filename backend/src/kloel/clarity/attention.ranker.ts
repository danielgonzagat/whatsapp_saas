/**
 * UTP-CLARITY-001 — Attention Ranker.
 *
 * Ranks attention items by urgency * impact * reversibility penalty.
 * Higher urgency and impact increase score; higher reversibility
 * (less risky decisions) decreases penalty, promoting reversible
 * actions that can be undone.
 *
 * Pure function — stateless ranking from input items.
 */

import type { AttentionRanking, DecisionTier, RankingInput } from './clarity.types';
import { clampScore } from './clarity.types';

export interface RankerResult {
  readonly rankings: readonly AttentionRanking[];
  readonly topItem: AttentionRanking | null;
  readonly rankedAt: string;
}

function tierFromScore(score: number): DecisionTier {
  if (score >= 0.75) return 'AGORA';
  if (score >= 0.5) return 'ESTA_SEMANA';
  if (score >= 0.25) return 'PARA_SABER';
  return 'ARQUIVO';
}

function computeScore(urgency: number, impact: number, reversibility: number): number {
  const clampedUrgency = clampScore(urgency);
  const clampedImpact = clampScore(impact);
  const clampedReversibility = clampScore(reversibility);
  const reversibilityPenalty = 1 - clampedReversibility * 0.5;
  const raw = clampedUrgency * clampedImpact * reversibilityPenalty;
  return Math.round(raw * 100) / 100;
}

export function rankAttention(items: readonly RankingInput[], nowMs: number): RankerResult {
  const ranked = items
    .map((item) => {
      const score = computeScore(item.urgency, item.impact, item.reversibility);
      const tier = tierFromScore(score);
      const ranking: AttentionRanking = {
        itemId: item.itemId,
        workspaceId: item.workspaceId,
        label: item.label,
        urgency: clampScore(item.urgency),
        impact: clampScore(item.impact),
        reversibility: clampScore(item.reversibility),
        score,
        tier,
        rankedAt: new Date(nowMs).toISOString(),
      };
      return ranking;
    })
    .sort((a, b) => b.score - a.score);

  return {
    rankings: ranked,
    topItem: ranked.length > 0 ? ranked[0]! : null,
    rankedAt: new Date(nowMs).toISOString(),
  };
}
