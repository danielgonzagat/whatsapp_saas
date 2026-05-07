import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MindBeliefService } from '../../kloel/mind-belief.service';
import { MindPolicyService } from '../../kloel/mind-policy.service';
import type { MindPrediction, MindPolicyDecision } from '../../kloel/mind.types';

type BeliefAggregateRow = {
  predicate: string;
  total: bigint;
  minSamples: number;
  maxSamples: number;
  avgMean: number;
};

type PredictionCountRow = {
  total: bigint;
  resolved: bigint;
  openCount: bigint;
  avgSurprise: number | null;
  highSurpriseCount: bigint;
};

type PolicyCountRow = {
  total: bigint;
  resolved: bigint;
  unresolved: bigint;
  decisionTypes: string[];
};

type SurpriseRow = MindPrediction & {
  severity: string;
};

@Injectable()
export class AdminMindService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
  ) {}

  async getState(workspaceId: string, _decisionType?: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const [beliefAggregates, predictionCounts, policyCounts] = await Promise.all([
      this.queryBeliefAggregates(workspaceId),
      this.queryPredictionCounts(workspaceId),
      this.queryPolicyCounts(workspaceId),
    ]);

    const topBeliefs = await this.beliefs.list(
      workspaceId,
      'P(conversion|segment,price_band,channel,hour)',
    );

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      beliefSummary: {
        totalPredicates: beliefAggregates.length,
        predicates: beliefAggregates.map((row) => ({
          predicate: row.predicate,
          total: Number(row.total),
          minSamples: row.minSamples,
          maxSamples: row.maxSamples,
          avgMean: row.avgMean,
        })),
      },
      predictionSummary: {
        total: Number(predictionCounts.total),
        resolved: Number(predictionCounts.resolved),
        open: Number(predictionCounts.openCount),
        avgSurprise: predictionCounts.avgSurprise ?? 0,
        highSurpriseCount: Number(predictionCounts.highSurpriseCount),
      },
      policySummary: {
        total: Number(policyCounts.total),
        resolved: Number(policyCounts.resolved),
        unresolved: Number(policyCounts.unresolved),
        decisionTypes: policyCounts.decisionTypes,
      },
      topConversionBeliefs: topBeliefs.slice(0, 10).map((belief) => ({
        subject: belief.subject,
        context: belief.context,
        mean: belief.mean,
        variance: belief.variance,
        samples: belief.samples,
      })),
    };
  }

  async getRecentSurprise(workspaceId: string, limit = 20) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const items = await this.prisma.$queryRaw<SurpriseRow[]>`
      SELECT *,
        CASE
          WHEN "surprise" >= 2.0 THEN 'critical'
          WHEN "surprise" >= 1.0 THEN 'high'
          WHEN "surprise" >= 0.5 THEN 'moderate'
          ELSE 'low'
        END AS "severity"
      FROM "RAC_MindPrediction"
      WHERE "workspaceId" = ${workspaceId}
        AND "resolvedAt" IS NOT NULL
        AND "surprise" IS NOT NULL
      ORDER BY "resolvedAt" DESC
      LIMIT ${limit}
    `;

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      items: items.map((item) => ({
        id: item.id,
        subject: item.subject,
        predicate: item.predicate,
        predictedMean: item.predictedMean,
        actual: item.actual,
        surprise: item.surprise,
        severity: item.severity,
        horizonSec: item.horizonSec,
        resolvedAt: item.resolvedAt,
        createdAt: item.createdAt,
      })),
      total: items.length,
    };
  }

  async getLift(workspaceId: string, decisionType: string, sinceDays = 14) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const harness = await this.policy.harness(workspaceId, decisionType, sinceDays);

    const topDecisions = await this.prisma.$queryRaw<
      Array<Pick<MindPolicyDecision, 'chosen' | 'baseline' | 'outcome'> & { count: bigint }>
    >`
      SELECT "chosen", "baseline", "outcome", COUNT(*)::bigint AS "count"
      FROM "RAC_MindPolicy"
      WHERE "workspaceId" = ${workspaceId}
        AND "decisionType" = ${decisionType}
        AND "resolvedAt" IS NOT NULL
        AND "outcome" IS NOT NULL
      GROUP BY "chosen", "baseline", "outcome"
      ORDER BY "count" DESC
      LIMIT 20
    `;

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      decisionType,
      sinceDays,
      n: harness.n,
      mindMean: harness.mindMean,
      baselineMean: harness.baselineMean,
      lift: harness.lift,
      pZScore: harness.pZScore,
      topChosenActions: topDecisions.map((row) => ({
        chosen: row.chosen,
        baseline: row.baseline,
        outcome: row.outcome,
        count: Number(row.count),
      })),
    };
  }

  private async queryBeliefAggregates(workspaceId: string): Promise<BeliefAggregateRow[]> {
    return this.prisma.$queryRaw<BeliefAggregateRow[]>`
      SELECT
        "predicate",
        COUNT(*)::bigint AS "total",
        MIN("samples")::int AS "minSamples",
        MAX("samples")::int AS "maxSamples",
        AVG("mean")::float AS "avgMean"
      FROM "RAC_MindBelief"
      WHERE "workspaceId" = ${workspaceId}
      GROUP BY "predicate"
      ORDER BY "total" DESC
      LIMIT 50
    `;
  }

  private async queryPredictionCounts(workspaceId: string): Promise<PredictionCountRow> {
    const rows = await this.prisma.$queryRaw<PredictionCountRow[]>`
      SELECT
        COUNT(*)::bigint AS "total",
        COUNT(CASE WHEN "resolvedAt" IS NOT NULL THEN 1 END)::bigint AS "resolved",
        COUNT(CASE WHEN "resolvedAt" IS NULL THEN 1 END)::bigint AS "openCount",
        AVG(CASE WHEN "resolvedAt" IS NOT NULL THEN "surprise" END)::float AS "avgSurprise",
        COUNT(CASE WHEN "surprise" >= 1.0 THEN 1 END)::bigint AS "highSurpriseCount"
      FROM "RAC_MindPrediction"
      WHERE "workspaceId" = ${workspaceId}
    `;
    return rows[0];
  }

  private async queryPolicyCounts(workspaceId: string): Promise<PolicyCountRow> {
    const countRows = await this.prisma.$queryRaw<
      Array<{ total: bigint; resolved: bigint; unresolved: bigint }>
    >`
      SELECT
        COUNT(*)::bigint AS "total",
        COUNT(CASE WHEN "resolvedAt" IS NOT NULL THEN 1 END)::bigint AS "resolved",
        COUNT(CASE WHEN "resolvedAt" IS NULL THEN 1 END)::bigint AS "unresolved"
      FROM "RAC_MindPolicy"
      WHERE "workspaceId" = ${workspaceId}
    `;

    const typeRows = await this.prisma.$queryRaw<Array<{ decisionType: string }>>`
      SELECT DISTINCT "decisionType"
      FROM "RAC_MindPolicy"
      WHERE "workspaceId" = ${workspaceId}
      ORDER BY "decisionType"
      LIMIT 50
    `;

    return {
      total: countRows[0]?.total ?? 0n,
      resolved: countRows[0]?.resolved ?? 0n,
      unresolved: countRows[0]?.unresolved ?? 0n,
      decisionTypes: typeRows.map((row) => row.decisionType),
    };
  }
}
