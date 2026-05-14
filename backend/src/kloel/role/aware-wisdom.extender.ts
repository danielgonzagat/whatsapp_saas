/**
 * UTP-ROLE-008 — Role-Aware Wisdom Extender.
 *
 * Filters and re-ranks cross-workspace wisdom patterns (Camada VI)
 * by relevance to the workspace owner's economic role. Implements
 * B0.3 (role-aware intelligence) and B0.11 (ecosystem intelligence).
 *
 * A producer sees patterns about conversion, pricing, and bonus;
 * an affiliate sees patterns about audience, commission, and traffic;
 * an agency sees patterns about margin, churn, and team utilisation.
 *
 * Pure function — no DI, no side effects.
 * Consumes WisdomPattern (Camada VI) and produces role-filtered
 * output for the ABI builder.
 */

import type { WisdomPattern } from '../wisdom/wisdom.types';
import type { Role } from './types';

/**
 * Which signal kinds are relevant to each role.
 * Derived from the lever map and B0.3 semantics.
 */
const RELEVANT_SIGNAL_KINDS: Readonly<Record<Role, readonly string[]>> = {
  produtor: [
    'conversion_rate',
    'refund_rate',
    'deal_close_rate',
    'product_concentration',
    'lead_volume',
  ],
  afiliado: [
    'conversion_rate',
    'campaign_efficiency',
    'lead_volume',
  ],
  agencia: [
    'refund_rate',
    'deal_close_rate',
    'lead_volume',
    'stage_distribution',
  ],
  gestor: [
    'conversion_rate',
    'deal_close_rate',
    'lead_volume',
    'stage_distribution',
  ],
  closer: [
    'conversion_rate',
    'reply_rate',
    'deal_close_rate',
    'lead_volume',
  ],
  creator: [
    'reply_rate',
    'campaign_efficiency',
    'lead_volume',
    'peak_activity',
  ],
  especialista: [
    'handoff_rate',
    'stage_distribution',
    'product_concentration',
  ],
};

export interface RoleFilteredWisdom {
  readonly role: Role;
  readonly allPatterns: readonly WisdomPattern[];
  readonly filteredPatterns: readonly WisdomPattern[];
  readonly filteredOutCount: number;
}

/**
 * UTP-ROLE-008: filter wisdom patterns by role relevance.
 *
 * Keeps patterns whose signalKind is relevant to the given role.
 * Patterns without a relevant signalKind are excluded.
 */
export function filterWisdomByRole(input: {
  readonly patterns: readonly WisdomPattern[];
  readonly role: Role;
}): RoleFilteredWisdom {
  const relevantKinds = RELEVANT_SIGNAL_KINDS[input.role] ?? [];
  const filtered = input.patterns.filter((p) =>
    relevantKinds.includes(p.signalKind),
  );

  return {
    role: input.role,
    allPatterns: input.patterns,
    filteredPatterns: filtered,
    filteredOutCount: input.patterns.length - filtered.length,
  };
}

/**
 * UTP-ROLE-008: filter and re-rank wisdom by multi-role profile.
 *
 * When a workspace has multiple roles, patterns relevant to any
 * active role are included. The primary role's patterns receive
 * a confidence boost.
 */
export interface MultiRoleFilteredWisdom {
  readonly roles: readonly Role[];
  readonly filteredPatterns: readonly WisdomPattern[];
  readonly totalFilteredOut: number;
}

export function filterWisdomByMultiRole(input: {
  readonly patterns: readonly WisdomPattern[];
  readonly primaryRole: Role | undefined;
  readonly secondaryRoles: readonly Role[];
}): MultiRoleFilteredWisdom {
  const allRoles = new Set<Role>();
  if (input.primaryRole) allRoles.add(input.primaryRole);
  for (const r of input.secondaryRoles) allRoles.add(r);

  const relevantKinds = new Set<string>();
  for (const role of allRoles) {
    const kinds = RELEVANT_SIGNAL_KINDS[role] ?? [];
    for (const k of kinds) relevantKinds.add(k);
  }

  const filtered = input.patterns.filter((p) =>
    relevantKinds.has(p.signalKind),
  );

  // Boost confidence for patterns matching primary role
  const boosted = filtered.map((p) => {
    if (!input.primaryRole) return p;
    const primaryKinds = RELEVANT_SIGNAL_KINDS[input.primaryRole] ?? [];
    if (primaryKinds.includes(p.signalKind)) {
      const boostedConf = Math.min(1, p.confidence * 1.15);
      return { ...p, confidence: Math.round(boostedConf * 100) / 100 };
    }
    return p;
  });

  const sorted = [...boosted].sort((a, b) => b.confidence - a.confidence);

  return {
    roles: [...allRoles],
    filteredPatterns: sorted,
    totalFilteredOut: input.patterns.length - sorted.length,
  };
}

/**
 * UTP-ROLE-008 helper: explain why a wisdom pattern is (or is not)
 * relevant to a given role.
 */
export function explainRelevance(
  pattern: WisdomPattern,
  role: Role,
): { relevant: boolean; reason: string } {
  const relevantKinds = RELEVANT_SIGNAL_KINDS[role] ?? [];
  if (relevantKinds.includes(pattern.signalKind)) {
    return {
      relevant: true,
      reason: `Pattern kind '${pattern.signalKind}' e relevante para ${role}.`,
    };
  }
  return {
    relevant: false,
    reason: `Pattern kind '${pattern.signalKind}' nao e relevante para ${role}.`,
  };
}
