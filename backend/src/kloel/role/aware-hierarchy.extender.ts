/**
 * UTP-ROLE-007 — Role-Aware Hierarchy Extender.
 *
 * Extends the Clarity hierarchy (Camada XXII) with role awareness.
 * The AGORA / ESTA_SEMANA / PARA_SABER / ARQUIVO decision tiers
 * are re-weighted based on the workspace owner's economic role.
 *
 * Uses B0.10 (reduzir ansiedade decisoria) and B0.3 (role-aware).
 *
 * For example, a CLOSER prioritises deal-related items (higher
 * AGORA weight), while a PRODUTOR prioritises product/checkout
 * items. Default is silence; role-awareness adds signal.
 *
 * Pure function — no DI, no side effects.
 */

import type { AttentionRanking, DecisionTier } from '../clarity/clarity.types';
import type { Role } from './types';

/**
 * Role-specific tier boost multipliers.
 * Values > 1.0 increase urgency (push toward AGORA).
 * Values < 1.0 decrease urgency (push toward ARQUIVO).
 */
interface RoleTierBoost {
  readonly role: Role;
  readonly agoraBoost: number;
  readonly estaSemanaBoost: number;
  readonly paraSaberBoost: number;
  readonly arquivoBoost: number;
}

const ROLE_TIER_BOOSTS: readonly RoleTierBoost[] = [
  {
    role: 'produtor',
    agoraBoost: 1.2,
    estaSemanaBoost: 1.1,
    paraSaberBoost: 0.9,
    arquivoBoost: 0.8,
  },
  {
    role: 'afiliado',
    agoraBoost: 1.0,
    estaSemanaBoost: 1.2,
    paraSaberBoost: 1.0,
    arquivoBoost: 0.9,
  },
  {
    role: 'agencia',
    agoraBoost: 1.1,
    estaSemanaBoost: 1.1,
    paraSaberBoost: 1.0,
    arquivoBoost: 0.85,
  },
  {
    role: 'gestor',
    agoraBoost: 1.15,
    estaSemanaBoost: 1.1,
    paraSaberBoost: 0.95,
    arquivoBoost: 0.85,
  },
  {
    role: 'closer',
    agoraBoost: 1.3,
    estaSemanaBoost: 1.0,
    paraSaberBoost: 0.85,
    arquivoBoost: 0.8,
  },
  {
    role: 'creator',
    agoraBoost: 1.0,
    estaSemanaBoost: 1.15,
    paraSaberBoost: 1.05,
    arquivoBoost: 0.9,
  },
  {
    role: 'especialista',
    agoraBoost: 1.0,
    estaSemanaBoost: 1.0,
    paraSaberBoost: 1.1,
    arquivoBoost: 0.95,
  },
];

const BOOST_BY_ROLE: ReadonlyMap<Role, RoleTierBoost> = new Map(
  ROLE_TIER_BOOSTS.map((b) => [b.role, b]),
);

/**
 * UTP-ROLE-007: extend hierarchy projection with role-aware re-weighting.
 *
 * Computes role-adjusted scores for each attention ranking.
 * The role-adjusted score = original score × role boost for that tier.
 *
 * Items that match the role's priority boost get moved toward AGORA;
 * items in deprioritised tiers drift toward ARQUIVO.
 */
export interface RoleAwareWeights {
  readonly itemId: string;
  readonly originalScore: number;
  readonly originalTier: DecisionTier;
  readonly adjustedScore: number;
  readonly roleApplied: Role;
}

export function extendHierarchyWithRole(input: {
  readonly rankings: readonly AttentionRanking[];
  readonly role: Role;
}): readonly RoleAwareWeights[] {
  const boost = BOOST_BY_ROLE.get(input.role);
  if (!boost) {
    return input.rankings.map((r) => ({
      itemId: r.itemId,
      originalScore: r.score,
      originalTier: r.tier,
      adjustedScore: r.score,
      roleApplied: input.role,
    }));
  }

  return input.rankings.map((r) => {
    const tierBoost = getTierBoost(boost, r.tier);
    const adjusted = Math.min(1, Math.max(0, r.score * tierBoost));
    return {
      itemId: r.itemId,
      originalScore: r.score,
      originalTier: r.tier,
      adjustedScore: Math.round(adjusted * 100) / 100,
      roleApplied: input.role,
    };
  });
}

/**
 * UTP-ROLE-007 helper: re-assign tiers based on role-adjusted scores.
 *
 * After re-weighting, items that cross tier thresholds get re-tiered.
 * Higher adjusted score → closer to AGORA.
 */
export function roleAwareReTier(
  weights: readonly RoleAwareWeights[],
): readonly (RoleAwareWeights & { readonly adjustedTier: DecisionTier })[] {
  return weights.map((w) => {
    let tier: DecisionTier;
    if (w.adjustedScore >= 0.75) {tier = 'AGORA';}
    else if (w.adjustedScore >= 0.5) {tier = 'ESTA_SEMANA';}
    else if (w.adjustedScore >= 0.25) {tier = 'PARA_SABER';}
    else {tier = 'ARQUIVO';}
    return { ...w, adjustedTier: tier };
  });
}

/**
 * UTP-ROLE-007 helper: count how many items changed tier due to role awareness.
 */
export function countTierChanges(
  original: readonly AttentionRanking[],
  reTiered: readonly (RoleAwareWeights & { readonly adjustedTier: DecisionTier })[],
): number {
  if (original.length !== reTiered.length) {return 0;}
  let changes = 0;
  for (let i = 0; i < original.length; i++) {
    if (original[i]!.tier !== reTiered[i]!.adjustedTier) {changes++;}
  }
  return changes;
}

function getTierBoost(boost: RoleTierBoost, tier: DecisionTier): number {
  switch (tier) {
    case 'AGORA':
      return boost.agoraBoost;
    case 'ESTA_SEMANA':
      return boost.estaSemanaBoost;
    case 'PARA_SABER':
      return boost.paraSaberBoost;
    case 'ARQUIVO':
      return boost.arquivoBoost;
  }
}
