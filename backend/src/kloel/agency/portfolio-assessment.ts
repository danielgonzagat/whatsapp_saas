/**
 * UTP-AGENCY-001 — Portfolio State Service.
 *
 * Assesses the aggregate state of the agency portfolio:
 * total clients, active/at-risk/critical counts, revenue,
 * satisfaction, and an overall health score.
 *
 * Pure function — stateless computation from input bundles.
 */

import type { PortfolioInput, PortfolioState } from './types';
import { clampScore, daysSince } from './types';

export interface PortfolioResult {
  readonly state: PortfolioState;
  readonly summary: string;
}

export function assessPortfolio(input: PortfolioInput): PortfolioResult {
  const nowMs = input.nowMs ?? Date.now();
  const bundles = input.bundles;

  if (bundles.length === 0) {
    const state: PortfolioState = {
      workspaceId: input.workspaceId,
      totalClients: 0,
      activeClients: 0,
      atRiskClients: 0,
      criticalClients: 0,
      totalMonthlyRevenueCents: 0n,
      averageSatisfactionScore: 0,
      healthScore: 0,
      assessedAt: new Date(nowMs).toISOString(),
    };
    return { state, summary: 'No clients in portfolio.' };
  }

  let activeClients = 0;
  let atRiskClients = 0;
  let criticalClients = 0;
  let totalRevenue = 0n;
  let satisfactionSum = 0;

  for (const b of bundles) {
    totalRevenue += b.monthlyRevenueCents;
    satisfactionSum += b.satisfactionScore;

    const sinceContact = daysSince(b.lastContactAt, nowMs);
    if (sinceContact > 30) {
      criticalClients++;
    } else if (sinceContact > 14) {
      atRiskClients++;
    } else {
      activeClients++;
    }
  }

  const total = bundles.length;
  const avgSatisfaction = satisfactionSum / total;

  const activeRatio = activeClients / total;
  const riskRatio = 1 - (atRiskClients + criticalClients) / total;
  const healthScore = clampScore(activeRatio * 0.4 + riskRatio * 0.3 + avgSatisfaction * 0.3);

  const state: PortfolioState = {
    workspaceId: input.workspaceId,
    totalClients: total,
    activeClients,
    atRiskClients,
    criticalClients,
    totalMonthlyRevenueCents: totalRevenue,
    averageSatisfactionScore: Math.round(avgSatisfaction * 100) / 100,
    healthScore: Math.round(healthScore * 100) / 100,
    assessedAt: new Date(nowMs).toISOString(),
  };

  const summary = buildSummary(state);

  return { state, summary };
}

function buildSummary(state: PortfolioState): string {
  if (state.totalClients === 0) {
    return 'Portfolio vazio — sem clientes ativos.';
  }
  if (state.criticalClients > 0) {
    return `${state.criticalClients} cliente(s) critico(s) sem contato ha >30 dias. Acao urgente necessaria.`;
  }
  if (state.atRiskClients > 0) {
    return `${state.atRiskClients} cliente(s) em risco (sem contato ha >14 dias). Reengaje esta semana.`;
  }
  if (state.healthScore >= 0.8) {
    return `Portfolio saudavel — ${state.activeClients} clientes ativos, satisfacao media ${state.averageSatisfactionScore.toFixed(2)}.`;
  }
  return `Portfolio estavel — ${state.totalClients} clientes, health score ${state.healthScore.toFixed(2)}.`;
}
