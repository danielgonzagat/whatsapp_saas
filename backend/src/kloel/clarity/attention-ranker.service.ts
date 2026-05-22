import { Injectable } from '@nestjs/common';
import type { AttentionItem, AttentionRankingResult, DecisionTier, RankedItem } from './clarity.types';
import { clampScore } from './clarity.types';

const AGORA_THRESHOLD = 0.7;
const ESTA_SEMANA_THRESHOLD = 0.4;
const PARA_SABER_THRESHOLD = 0.15;
const SILENCE_THRESHOLD = 0.0;

function computeScore(item: AttentionItem): number {
  const urgency = clampScore(item.urgency);
  const impact = clampScore(item.impact);
  const reversibility = clampScore(item.reversibility);
  return urgency * impact * (1 - reversibility);
}

function classify(score: number): DecisionTier {
  if (score >= AGORA_THRESHOLD) return 'AGORA';
  if (score >= ESTA_SEMANA_THRESHOLD) return 'ESTA_SEMANA';
  if (score >= PARA_SABER_THRESHOLD) return 'PARA_SABER';
  return 'ARQUIVO';
}

function dominatedTier(ranked: readonly RankedItem[]): DecisionTier | null {
  const counts: Record<DecisionTier, number> = {
    AGORA: 0,
    ESTA_SEMANA: 0,
    PARA_SABER: 0,
    ARQUIVO: 0,
  };
  for (const item of ranked) {
    counts[item.tier] += 1;
  }
  const entries = (Object.entries(counts) as [DecisionTier, number][]).filter(
    ([, c]) => c > 0,
  );
  if (entries.length === 0) return null;
  return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/**
 * UTP-CLARITY-001 — Ranks attention items by urgency × impact × (1 - reversibility).
 * Default is silence when nothing crosses the noise floor (score > 0).
 */
@Injectable()
export class AttentionRankerService {
  public rank(items: readonly AttentionItem[]): AttentionRankingResult {
    const scored: RankedItem[] = [];

    for (const item of items) {
      const score = computeScore(item);
      if (score <= SILENCE_THRESHOLD) continue;
      scored.push({
        id: item.id,
        score,
        tier: classify(score),
        urgency: clampScore(item.urgency),
        impact: clampScore(item.impact),
        reversibility: clampScore(item.reversibility),
        evidenceLevel: clampScore(item.evidenceLevel),
      });
    }

    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

    const silent = scored.length === 0;

    return {
      ranked: scored,
      silent,
      dominatedTier: silent ? null : dominatedTier(scored),
    };
  }
}
