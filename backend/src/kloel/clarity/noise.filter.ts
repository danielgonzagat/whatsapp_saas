/**
 * UTP-CLARITY-003 — Noise Filter.
 *
 * Suppresses ranked items below a configured threshold.
 * Default is silence: when silent is true, filtered items are
 * discarded entirely rather than down-ranked.
 *
 * Pure function — stateless filtering.
 */

import type {
  AttentionRanking,
  NoiseFilter,
  NoiseFilterInput,
} from './clarity.types';
import { DEFAULT_NOISE_THRESHOLD } from './clarity.types';

export interface NoiseFilterResult {
  readonly kept: readonly AttentionRanking[];
  readonly filtered: readonly AttentionRanking[];
  readonly filter: NoiseFilter;
}

export function applyNoiseFilter(input: NoiseFilterInput): NoiseFilterResult {
  const threshold = input.threshold > 0
    ? input.threshold
    : DEFAULT_NOISE_THRESHOLD;

  const kept: AttentionRanking[] = [];
  const filtered: AttentionRanking[] = [];

  for (const ranking of input.rankings) {
    if (ranking.score >= threshold) {
      kept.push(ranking);
    } else {
      filtered.push(ranking);
    }
  }

  const noiseFilter: NoiseFilter = {
    threshold,
    silent: input.silent,
    filteredCount: filtered.length,
    totalCount: input.rankings.length,
    lastFilteredAt: new Date(input.nowMs).toISOString(),
  };

  return {
    kept: input.silent ? kept : input.rankings,
    filtered,
    filter: noiseFilter,
  };
}
