/**
 * UTP-ROLE-005 — Recommendation Guard.
 *
 * Blocks suggestions that fall outside the role's control radius.
 * Implements B0.3: a suggestion outside the control radius is a
 * grave failure. The guard checks whether a recommended action
 * (identified by its lever name) is within the role's direct or
 * influenced levers.
 *
 * Pure function — no DI, no side effects.
 * Produces RecommendationGuardResult with clear reason on block.
 */

import type { RecommendationGuardResult, Role } from './types';
import { ALL_ROLES, ROLE_DESCRIPTIONS } from './types';
import { isLeverInControlRadius } from './leverage-map.service';

export interface GuardCheckInput {
  readonly suggestedLever: string;
  readonly targetRole: Role;
  readonly suggestionDescription: string;
}

/**
 * UTP-ROLE-005: guard a recommendation against the target role's
 * control radius.
 *
 * Returns `allowed: true` if the suggested action maps to a lever
 * that the role can directly control or influence.
 * Returns `allowed: false` with a reason when the lever is outside
 * the control radius.
 */
export function guardRecommendation(
  input: GuardCheckInput,
): RecommendationGuardResult {
  const guardAppliedAt = new Date().toISOString();

  if (!ALL_ROLES.includes(input.targetRole)) {
    return {
      allowed: false,
      reason: `Role desconhecido '${input.targetRole}'. Nao e possivel verificar raio de controle.`,
      role: input.targetRole,
      guardAppliedAt,
    };
  }

  if (isLeverInControlRadius(input.targetRole, input.suggestedLever)) {
    return {
      allowed: true,
      reason: `Acao '${input.suggestedLever}' esta dentro do raio de controle de ${input.targetRole}.`,
      role: input.targetRole,
      guardAppliedAt,
    };
  }

  const roleDesc = ROLE_DESCRIPTIONS[input.targetRole];
  return {
    allowed: false,
    reason: `Acao '${input.suggestedLever}' esta FORA do raio de controle de ${input.targetRole} ` +
      `(${roleDesc}). Sugerir esta acao a este papel viola B0.3.`,
    role: input.targetRole,
    guardAppliedAt,
  };
}

/**
 * UTP-ROLE-005 helper: batch-guard multiple suggestions.
 */
export function guardRecommendations(
  checks: readonly GuardCheckInput[],
): readonly RecommendationGuardResult[] {
  return checks.map((c) => guardRecommendation(c));
}

/**
 * UTP-ROLE-005 helper: count how many suggestions in a batch were blocked.
 */
export function countBlocked(
  results: readonly RecommendationGuardResult[],
): number {
  return results.filter((r) => !r.allowed).length;
}

/**
 * UTP-ROLE-005 helper: filter only allowed suggestions from batch results.
 */
export function allowedOnly(
  checks: readonly GuardCheckInput[],
  results: readonly RecommendationGuardResult[],
): readonly GuardCheckInput[] {
  if (checks.length !== results.length) {
    return [];
  }
  return checks.filter((_, i) => results[i]!.allowed);
}
