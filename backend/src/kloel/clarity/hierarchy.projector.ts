/**
 * UTP-CLARITY-002 — Hierarchy Projector.
 *
 * Projects ranked attention items into decision tiers:
 * AGORA, ESTA_SEMANA, PARA_SABER, ARQUIVO.
 *
 * Pure function — stateless projection from computed rankings.
 */

import type { AttentionRanking, DecisionTier, HierarchyProjectionInput } from './clarity.types';

interface TierProjection {
  readonly tier: DecisionTier;
  readonly items: readonly AttentionRanking[];
  readonly count: number;
  readonly totalScore: number;
}

export interface HierarchyProjection {
  readonly projections: readonly TierProjection[];
  readonly agoralCount: number;
  readonly estaSemanaCount: number;
  readonly paraSaberCount: number;
  readonly arquivoCount: number;
  readonly totalItems: number;
}

const TIER_ORDER: readonly DecisionTier[] = [
  'AGORA',
  'ESTA_SEMANA',
  'PARA_SABER',
  'ARQUIVO',
];

export function projectHierarchy(
  input: HierarchyProjectionInput,
): HierarchyProjection {
  const grouped = new Map<DecisionTier, AttentionRanking[]>();
  for (const tier of TIER_ORDER) {
    grouped.set(tier, []);
  }

  for (const ranking of input.rankings) {
    const bucket = grouped.get(ranking.tier);
    if (bucket) {
      bucket.push(ranking);
    }
  }

  const projections: TierProjection[] = [];
  let agora = 0;
  let semana = 0;
  let saber = 0;
  let arquivo = 0;

  for (const tier of TIER_ORDER) {
    const items = grouped.get(tier) ?? [];
    const totalScore = items.reduce((sum, r) => sum + r.score, 0);
    projections.push({
      tier,
      items: [...items],
      count: items.length,
      totalScore: Math.round(totalScore * 100) / 100,
    });

    switch (tier) {
      case 'AGORA':
        agora = items.length;
        break;
      case 'ESTA_SEMANA':
        semana = items.length;
        break;
      case 'PARA_SABER':
        saber = items.length;
        break;
      case 'ARQUIVO':
        arquivo = items.length;
        break;
    }
  }

  return {
    projections,
    agoralCount: agora,
    estaSemanaCount: semana,
    paraSaberCount: saber,
    arquivoCount: arquivo,
    totalItems: input.rankings.length,
  };
}
