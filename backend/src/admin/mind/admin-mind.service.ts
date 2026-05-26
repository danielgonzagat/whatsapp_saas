import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MindBeliefService } from '../../kloel/mind-belief.service';
import { MindLiftReportService } from '../../kloel/mind-lift-report.service';
import { MindPolicyService } from '../../kloel/mind-policy.service';
import { MindObservabilityService } from '../../kloel/mind-observability.service';
import { MindReportService } from '../../kloel/mind-report.service';

type PolicyCountRow = {
  total: bigint;
  resolved: bigint;
  unresolved: bigint;
  decisionTypes: string[];
};

function severityLabel(surprise: number): string {
  if (surprise >= 2.0) {return 'critical';}
  if (surprise >= 1.0) {return 'high';}
  if (surprise >= 0.5) {return 'moderate';}
  return 'low';
}

@Injectable()
export class AdminMindService {
  private readonly logger = new Logger(AdminMindService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
    private readonly liftReport: MindLiftReportService,
    private readonly policy: MindPolicyService,
    private readonly observability: MindObservabilityService,
    private readonly reports: MindReportService,
  ) {
    this.logger.debug?.(`AdminMindService initialized`);
  }

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

    const rows = await this.prisma.mindPrediction.findMany({
      where: {
        workspaceId,
        resolvedAt: { not: null },
        surprise: { not: null },
      },
      orderBy: { resolvedAt: 'desc' },
      take: limit,
    });

    const items = rows.map((item) => ({
      id: item.id,
      subject: item.subject,
      predicate: item.predicate,
      predictedMean: item.predictedMean,
      actual: item.actual,
      surprise: item.surprise,
      severity: severityLabel(item.surprise!),
      horizonSec: item.horizonSec,
      resolvedAt: item.resolvedAt,
      createdAt: item.createdAt,
    }));

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      items,
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

    const harnessResult = await this.policy.harness(workspaceId, decisionType, sinceDays);
    const since = new Date(Date.now() - sinceDays * 86400 * 1000);

    const groupRows = await this.prisma.$queryRaw<
      Array<{ chosen: string; baseline: string; outcome: number; count: bigint }>
    >`
      SELECT "chosen", "baseline", "outcome", COUNT(*)::bigint AS "count"
      FROM "RAC_MindPolicy"
      WHERE "workspaceId" = ${workspaceId}
        AND "decisionType" = ${decisionType}
        AND "resolvedAt" IS NOT NULL
        AND "resolvedAt" >= ${since}
        AND "outcome" IS NOT NULL
      GROUP BY "chosen", "baseline", "outcome"
      ORDER BY "count" DESC
      LIMIT 20
    `;

    const topDecisions = groupRows.map((row) => ({
      chosen: row.chosen,
      baseline: row.baseline,
      outcome: row.outcome,
      count: row.count,
    }));

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      decisionType,
      sinceDays,
      n: harnessResult.n,
      mindMean: harnessResult.mindMean,
      baselineMean: harnessResult.baselineMean,
      lift: harnessResult.lift,
      pZScore: harnessResult.pZScore,
      topChosenActions: topDecisions.map((row) => ({
        chosen: row.chosen,
        baseline: row.baseline,
        outcome: row.outcome,
        count: Number(row.count),
      })),
    };
  }

  async getConcepts(workspaceId: string, hours = 24) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const result = await this.observability.concepts(workspaceId, hours);
    return { ...result, workspaceId: workspace.id, workspaceName: workspace.name };
  }

  async getHealth(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const result = await this.observability.health(workspaceId);
    return { ...result, workspaceId: workspace.id, workspaceName: workspace.name };
  }

  async getBriefing(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const result = await this.observability.briefing(workspaceId);
    return { ...result, workspaceId: workspace.id, workspaceName: workspace.name };
  }

  async askQuestion(workspaceId: string, question: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const result = await this.observability.ask(workspaceId, question);
    return { ...result, workspaceId: workspace.id, workspaceName: workspace.name };
  }

  async getLiftReport(sinceDays = 14) {
    return this.liftReport.aggregate(sinceDays);
  }

  async generateReport(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const result = await this.reports.generateDaily(workspaceId);
    return { ...result, workspaceId: workspace.id, workspaceName: workspace.name };
  }

  private async queryBeliefAggregates(workspaceId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        predicate: string;
        total: bigint;
        minSamples: number | null;
        maxSamples: number | null;
        avgMean: number | null;
      }>
    >`
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

    return rows.map((row) => ({
      predicate: row.predicate,
      total: row.total,
      minSamples: row.minSamples ?? 0,
      maxSamples: row.maxSamples ?? 0,
      avgMean: row.avgMean ?? 0,
    }));
  }

  private async queryPredictionCounts(workspaceId: string) {
    const [total, resolved, openCount, highSurpriseCount, avgResult] = await Promise.all([
      this.prisma.mindPrediction.count({ where: { workspaceId } }),
      this.prisma.mindPrediction.count({ where: { workspaceId, resolvedAt: { not: null } } }),
      this.prisma.mindPrediction.count({ where: { workspaceId, resolvedAt: null } }),
      this.prisma.mindPrediction.count({ where: { workspaceId, surprise: { gte: 1.0 } } }),
      this.prisma.mindPrediction.aggregate({
        where: { workspaceId, resolvedAt: { not: null }, surprise: { not: null } },
        _avg: { surprise: true },
      }),
    ]);

    return {
      total: BigInt(total),
      resolved: BigInt(resolved),
      openCount: BigInt(openCount),
      avgSurprise: avgResult._avg.surprise ?? null,
      highSurpriseCount: BigInt(highSurpriseCount),
    };
  }

  private async queryPolicyCounts(workspaceId: string): Promise<PolicyCountRow> {
    const [total, resolved, unresolved, typeRows] = await Promise.all([
      this.prisma.mindPolicy.count({ where: { workspaceId } }),
      this.prisma.mindPolicy.count({ where: { workspaceId, resolvedAt: { not: null } } }),
      this.prisma.mindPolicy.count({ where: { workspaceId, resolvedAt: null } }),
      this.prisma.mindPolicy.findMany({
        where: { workspaceId },
        select: { decisionType: true },
        distinct: ['decisionType'],
        orderBy: { decisionType: 'asc' },
        take: 50,
      }),
    ]);

    return {
      total: BigInt(total),
      resolved: BigInt(resolved),
      unresolved: BigInt(unresolved),
      decisionTypes: typeRows.map((row) => row.decisionType),
    };
  }
}
