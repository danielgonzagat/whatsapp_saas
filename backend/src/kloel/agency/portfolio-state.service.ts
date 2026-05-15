/**
 * UTP-AGENCY-009 — Portfolio State Service.
 *
 * Consolidates portfolio state across all clients of an agency:
 * client count, margin per client, churn risk per client,
 * priority ranking, and team load.
 *
 * NestJS service — stateless computation from input data.
 */

import { Injectable } from '@nestjs/common';
import type {
  ChurnRiskSnapshot,
  ConsolidatedPortfolioState,
  MarginSnapshot,
  PortfolioResult,
  PrioritySnapshot,
  TeamLoadSnapshot,
} from './agency.types';
import { clampScore } from './agency.types';

export interface ClientData {
  readonly workspaceId: string;
  readonly revenueCents: bigint;
  readonly costCents: bigint;
  readonly previousMarginPercent?: number;
  readonly satisfactionScore: number;
  readonly openIssues: number;
  readonly activeProjects: number;
  readonly relationshipDays: number;
  readonly lastContactDaysAgo: number;
  readonly delayedPayment: boolean;
  readonly complaintCount: number;
  readonly scopeReduction: boolean;
  readonly contractRenewalAt: string | null;
}

export interface TeamMemberData {
  readonly memberId: string;
  readonly memberName: string;
  readonly maxCapacity: number;
  readonly assignedClientIds: readonly string[];
}

export interface ConsolidationInput {
  readonly agencyWorkspaceId: string;
  readonly clients: readonly ClientData[];
  readonly teamMembers?: readonly TeamMemberData[];
  readonly nowMs?: number;
}

@Injectable()
export class PortfolioStateService {
  consolidate(input: ConsolidationInput): PortfolioResult {
    const nowMs = input.nowMs ?? Date.now();
    const clients = input.clients;

    if (clients.length === 0) {
      return {
        state: this.emptyState(input.agencyWorkspaceId, nowMs),
        summary: 'No clients in portfolio.',
      };
    }

    const marginPerClient = this.buildMarginSnapshots(clients, nowMs);
    const churnRiskPerClient = this.buildChurnSnapshots(clients, nowMs);
    const priorityRanking = this.buildPriorityRankings(clients, nowMs);
    const teamLoad = input.teamMembers
      ? this.buildTeamLoad(input.teamMembers, clients)
      : null;

    const healthScore = this.computeHealthScore(clients);

    const state: ConsolidatedPortfolioState = {
      agencyWorkspaceId: input.agencyWorkspaceId,
      clientCount: clients.length,
      marginPerClient,
      churnRiskPerClient,
      priorityRanking,
      teamLoad,
      assessedAt: new Date(nowMs).toISOString(),
    };

    const summary = this.buildSummary(state, healthScore);

    return { state, summary };
  }

  private emptyState(
    agencyWorkspaceId: string,
    nowMs: number,
  ): ConsolidatedPortfolioState {
    return {
      agencyWorkspaceId,
      clientCount: 0,
      marginPerClient: [],
      churnRiskPerClient: [],
      priorityRanking: [],
      teamLoad: null,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private buildMarginSnapshots(
    clients: readonly ClientData[],
    nowMs: number,
  ): readonly MarginSnapshot[] {
    void nowMs;
    return clients.map((c) => {
      const marginCents = c.revenueCents - c.costCents;
      const marginPercent =
        c.revenueCents > 0n
          ? Number((marginCents * 10000n) / c.revenueCents) / 100
          : 0;

      let trend: MarginSnapshot['trend'] = 'stable';
      if (c.revenueCents === 0n) {
        trend = 'negative';
      } else if (c.previousMarginPercent !== undefined) {
        const delta = marginPercent - c.previousMarginPercent;
        if (delta > 5) {
          trend = 'improving';
        } else if (delta < -5) {
          trend = 'declining';
        } else {
          trend = 'stable';
        }
      }

      return {
        clientWorkspaceId: c.workspaceId,
        marginPercent: Math.round(marginPercent * 100) / 100,
        marginCents,
        revenueCents: c.revenueCents,
        costCents: c.costCents,
        trend,
      };
    });
  }

  private buildChurnSnapshots(
    clients: readonly ClientData[],
    nowMs: number,
  ): readonly ChurnRiskSnapshot[] {
    void nowMs;
    return clients.map((c) => {
      const probability = this.computeChurnProbability(c);
      const riskLevel = this.riskLevelFromProbability(probability);
      const signals = this.collectChurnSignals(c);

      return {
        clientWorkspaceId: c.workspaceId,
        riskLevel,
        riskProbability: Math.round(probability * 100) / 100,
        signals,
      };
    });
  }

  private computeChurnProbability(c: ClientData): number {
    let p = 0;

    if (c.lastContactDaysAgo > 30) {
      p += 0.4;
    } else if (c.lastContactDaysAgo > 14) {
      p += 0.25;
    } else if (c.lastContactDaysAgo > 7) {
      p += 0.1;
    }

    if (c.delayedPayment) {
      p += 0.2;
    }

    p += Math.min(c.complaintCount * 0.1, 0.3);

    if (c.scopeReduction) {
      p += 0.15;
    }

    if (c.satisfactionScore < 0.3) {
      p += 0.2;
    } else if (c.satisfactionScore < 0.5) {
      p += 0.1;
    }

    return clampScore(p);
  }

  private riskLevelFromProbability(
    probability: number,
  ): ChurnRiskSnapshot['riskLevel'] {
    if (probability >= 0.7) {
      return 'critical';
    }
    if (probability >= 0.5) {
      return 'high';
    }
    if (probability >= 0.3) {
      return 'moderate';
    }
    return 'low';
  }

  private collectChurnSignals(c: ClientData): readonly string[] {
    const signals: string[] = [];

    if (c.lastContactDaysAgo > 14) {
      signals.push('no_recent_contact');
    }
    if (c.delayedPayment) {
      signals.push('delayed_payment');
    }
    if (c.complaintCount > 0) {
      signals.push(`complaints_${Math.min(c.complaintCount, 5)}`);
    }
    if (c.scopeReduction) {
      signals.push('scope_reduction');
    }
    if (c.satisfactionScore < 0.5) {
      signals.push('low_satisfaction');
    }

    if (signals.length === 0) {
      signals.push('no_signals');
    }

    return signals;
  }

  private buildPriorityRankings(
    clients: readonly ClientData[],
    nowMs: number,
  ): readonly PrioritySnapshot[] {
    void nowMs;
    if (clients.length === 0) {
      return [];
    }

    const maxRevenue = clients.reduce(
      (max, c) => (c.revenueCents > max ? c.revenueCents : max),
      0n,
    );

    const scored = clients.map((c) => {
      const revenueWeight =
        maxRevenue > 0n
          ? Number(c.revenueCents) / Number(maxRevenue)
          : 0;
      const recencyWeight = Math.max(0, 1 - c.lastContactDaysAgo / 30);
      const issueWeight = Math.max(0, 1 - c.openIssues / 10);
      const satisfactionWeight = c.satisfactionScore;

      const score = clampScore(
        revenueWeight * 0.35 +
          recencyWeight * 0.25 +
          issueWeight * 0.15 +
          satisfactionWeight * 0.25,
      );

      let tier: PrioritySnapshot['tier'] = 'sustentar';
      if (score >= 0.7) {
        tier = 'agora';
      } else if (score >= 0.4) {
        tier = 'esta_semana';
      } else if (score >= 0.2) {
        tier = 'em_breve';
      }

      const drivers: string[] = [];
      if (c.openIssues > 3) {
        drivers.push('open_issues');
      }
      if (c.lastContactDaysAgo > 14) {
        drivers.push('stale_contact');
      }
      if (c.satisfactionScore < 0.5) {
        drivers.push('low_satisfaction');
      }
      if (drivers.length === 0) {
        drivers.push('sustained_health');
      }

      return { clientWorkspaceId: c.workspaceId, score, tier, drivers };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.map((s, i) => ({
      clientWorkspaceId: s.clientWorkspaceId,
      rank: i + 1,
      score: Math.round(s.score * 100) / 100,
      tier: s.tier,
      drivers: s.drivers,
    }));
  }

  private buildTeamLoad(
    members: readonly TeamMemberData[],
    clients: readonly ClientData[],
  ): TeamLoadSnapshot {
    if (members.length === 0) {
      return {
        totalMembers: 0,
        overworkedCount: 0,
        underutilizedCount: 0,
        recommendation: 'No team members configured.',
      };
    }

    void clients;

    let overworkedCount = 0;
    let underutilizedCount = 0;

    for (const m of members) {
      const assignedCount = m.assignedClientIds.length;
      const loadPercent =
        m.maxCapacity > 0 ? assignedCount / m.maxCapacity : 0;

      if (loadPercent >= 0.85) {
        overworkedCount++;
      } else if (loadPercent < 0.3 && loadPercent > 0) {
        underutilizedCount++;
      }
    }

    let recommendation = 'Carga balanceada — nenhum ajuste necessario.';
    if (overworkedCount > 0 && underutilizedCount > 0) {
      recommendation = `${overworkedCount} membro(s) sobrecarregado(s), ${underutilizedCount} subutilizado(s). Redistribuir clientes.`;
    } else if (overworkedCount > 0) {
      recommendation = `${overworkedCount} membro(s) sobrecarregado(s). Contratar ou redistribuir carga.`;
    } else if (underutilizedCount > 0) {
      recommendation = `${underutilizedCount} membro(s) subutilizado(s). Alocar novos clientes.`;
    }

    return {
      totalMembers: members.length,
      overworkedCount,
      underutilizedCount,
      recommendation,
    };
  }

  private computeHealthScore(clients: readonly ClientData[]): number {
    const total = clients.length;
    if (total === 0) {
      return 0;
    }

    let activeCount = 0;
    let atRiskCount = 0;
    let criticalCount = 0;
    let satisfactionSum = 0;

    for (const c of clients) {
      satisfactionSum += c.satisfactionScore;
      if (c.lastContactDaysAgo > 30) {
        criticalCount++;
      } else if (c.lastContactDaysAgo > 14) {
        atRiskCount++;
      } else {
        activeCount++;
      }
    }

    const activeRatio = activeCount / total;
    const riskRatio = 1 - (atRiskCount + criticalCount) / total;
    const avgSatisfaction = satisfactionSum / total;

    return clampScore(activeRatio * 0.4 + riskRatio * 0.3 + avgSatisfaction * 0.3);
  }

  private buildSummary(
    state: ConsolidatedPortfolioState,
    healthScore: number,
  ): string {
    if (state.clientCount === 0) {
      return 'Portfolio vazio — sem clientes ativos.';
    }
    const criticalClients = state.churnRiskPerClient.filter(
      (c) => c.riskLevel === 'critical',
    ).length;
    const atRiskClients = state.churnRiskPerClient.filter(
      (c) => c.riskLevel === 'high',
    ).length;
    if (criticalClients > 0) {
      return `${criticalClients} cliente(s) critico(s). Acao urgente necessaria.`;
    }
    if (atRiskClients > 0) {
      return `${atRiskClients} cliente(s) em risco alto. Reengaje esta semana.`;
    }
    if (healthScore >= 0.8) {
      return 'Portfolio saudavel — todos os indicadores estaveis.';
    }
    return `Portfolio estavel — ${state.clientCount} clientes monitorados.`;
  }
}
