import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

interface ReflexivityReport {
  generatedAt: string;
  workspaceId: string;
  periodHours: number;
  totalDecisions: number;
  successfulDecisions: number;
  failedDecisions: number;
  successRate: number;
  topPatterns: Array<{ pattern: string; count: number; outcome: string }>;
  pendingDecisions: number;
  recommendations: string[];
}

@Injectable()
export class KloelReflexivityService {
  private readonly logger = StructuredLogger.from(KloelReflexivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 */4 * * *')
  async periodicReflexivity(): Promise<void> {
    this.logger.log('Starting periodic reflexivity scan');
    try {
      const workspaces = await this.prisma.workspace.findMany({
        select: { id: true },
        take: 100,
      });

      for (const ws of workspaces) {
        try {
          const report = await this.generateReport(ws.id);
          await this.persistReport(report);
        } catch (err: unknown) {
          this.logger.warn(
            `Reflexivity failed for workspace ${ws.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err: unknown) {
      this.logger.error(
        `Periodic reflexivity scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.logger.log('Periodic reflexivity scan completed');
  }

  async generateReport(workspaceId: string, periodHours = 24): Promise<ReflexivityReport> {
    const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);

    const [autopilotEvents, mindPolicies, agentWorkItems] = await Promise.all([
      this.prisma.autopilotEvent.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { intent: true, action: true, status: true, responseText: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.mindPolicy.findMany({
        where: { workspaceId, resolvedAt: { gte: since } },
        select: {
          decisionType: true,
          chosen: true,
          outcome: true,
          baseline: true,
          calcSteps: true,
          resolvedAt: true,
        },
        orderBy: { resolvedAt: 'desc' },
        take: 200,
      }),
      this.prisma.agentWorkItem.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { kind: true, state: true, title: true },
        take: 200,
      }),
    ]);

    const totalDecisions = mindPolicies.length;
    const successfulOutcomes = mindPolicies.filter(
      (p) => p.outcome !== null && p.outcome > 0.5,
    ).length;
    const failedOutcomes = mindPolicies.filter(
      (p) => p.outcome !== null && p.outcome < 0.5,
    ).length;

    const successRate = totalDecisions > 0 ? successfulOutcomes / totalDecisions : 0;

    const patternMap = new Map<string, { count: number; lastOutcome: number | null }>();
    for (const p of mindPolicies) {
      const key = `${p.decisionType}:${p.chosen}`;
      const entry = patternMap.get(key) ?? { count: 0, lastOutcome: null };
      entry.count += 1;
      if (p.outcome !== null) entry.lastOutcome = p.outcome;
      patternMap.set(key, entry);
    }

    const topPatterns = [...patternMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([pattern, data]) => {
        const outcomeLabel = data.lastOutcome !== null
          ? data.lastOutcome > 0.5 ? 'positive' : 'negative'
          : 'unknown';
        return { pattern, count: data.count, outcome: outcomeLabel };
      });

    const pendingWorkItems = agentWorkItems.filter(
      (w) => w.state === 'pending' || w.state === 'in_progress',
    ).length;

    const recommendations: string[] = [];
    if (successRate < 0.3 && totalDecisions >= 5) {
      recommendations.push('success_rate_low: rever decisões recentes e ajustar política');
    }
    if (pendingWorkItems > 20) {
      recommendations.push('work_backlog: priorizar execução de work items pendentes');
    }
    const autopilotErrors = autopilotEvents.filter((e) => e.status === 'failed').length;
    if (autopilotErrors > 10) {
      recommendations.push('autopilot_errors: investigar falhas nos eventos de autopilot');
    }
    if (totalDecisions === 0) {
      recommendations.push('inactivity: nenhuma decisão registrada no período');
    }

    return {
      generatedAt: new Date().toISOString(),
      workspaceId,
      periodHours,
      totalDecisions,
      successfulDecisions: successfulOutcomes,
      failedDecisions: failedOutcomes,
      successRate: Number(successRate.toFixed(4)),
      topPatterns,
      pendingDecisions: pendingWorkItems,
      recommendations,
    };
  }

  async generateGlobalReflexivitySummary(): Promise<{
    totalWorkspaces: number;
    aggregateSuccessRate: number;
    totalDecisions: number;
    recommendations: string[];
  }> {
    const workspaces = await this.prisma.workspace.findMany({
      select: { id: true },
      take: 50,
    });

    let totalDecisions = 0;
    let totalSuccess = 0;

    for (const ws of workspaces) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const policies = await this.prisma.mindPolicy.findMany({
        where: { workspaceId: ws.id, resolvedAt: { gte: since } },
        select: { outcome: true },
        take: 100,
      });
      totalDecisions += policies.length;
      totalSuccess += policies.filter(
        (p) => p.outcome !== null && p.outcome > 0.5,
      ).length;
    }

    const aggregateSuccessRate = totalDecisions > 0 ? totalSuccess / totalDecisions : 0;
    const recommendations: string[] = [];
    if (aggregateSuccessRate < 0.4) {
      recommendations.push('global_low_success: revisar políticas globais e re-treinar MIND');
    }
    if (totalDecisions < 10) {
      recommendations.push('global_low_activity: poucas decisões registradas globalmente');
    }

    return {
      totalWorkspaces: workspaces.length,
      aggregateSuccessRate: Number(aggregateSuccessRate.toFixed(4)),
      totalDecisions,
      recommendations,
    };
  }

  private async persistReport(report: ReflexivityReport): Promise<void> {
    try {
      await this.prisma.mindDailyReport.create({
        data: {
          id: `reflex_${report.workspaceId}_${Date.now().toString(36)}`,
          workspaceId: report.workspaceId,
          reportDate: report.generatedAt,
          content: JSON.stringify(report),
          metrics: {
            totalDecisions: report.totalDecisions,
            successRate: report.successRate,
            recommendations: report.recommendations,
          },
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to persist reflexivity report: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
