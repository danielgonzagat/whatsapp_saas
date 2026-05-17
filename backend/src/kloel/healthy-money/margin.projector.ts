/**
 * UTP-HEALTHYMONEY-002 — Margin Projector.
 *
 * Projects margin by separating fixed and variable cost estimates
 * from observed revenue events. Outputs projected margin in basis
 * points and percentage.
 *
 * Implements B0.7: receita ponderada por margem.
 */
import type { MarginProjection } from './healthy-money.types';

export interface MarginProjectorInput {
  readonly workspaceId: string;
  readonly revenueCents: number;
  readonly variableCostCents: number;
  readonly fixedCostCents: number;
  readonly nowMs: number;
}

export function projectMargin(input: MarginProjectorInput): MarginProjection {
  const totalCost = input.fixedCostCents + input.variableCostCents;
  const grossProfit = input.revenueCents - totalCost;

  const projectedMarginPct =
    input.revenueCents > 0 ? Math.round((grossProfit / input.revenueCents) * 10000) / 100 : 0;

  const projectedMarginBps =
    input.revenueCents > 0 ? Math.round((grossProfit / input.revenueCents) * 10000) : 0;

  const contributionMarginBps =
    input.revenueCents > 0
      ? Math.round(((input.revenueCents - input.variableCostCents) / input.revenueCents) * 10000)
      : 0;

  return {
    workspaceId: input.workspaceId,
    projectedMarginBps,
    projectedMarginPct,
    fixedCostCents: input.fixedCostCents,
    variableCostCents: input.variableCostCents,
    revenueCents: input.revenueCents,
    contributionMarginBps,
    projectedAt: new Date(input.nowMs).toISOString(),
  };
}