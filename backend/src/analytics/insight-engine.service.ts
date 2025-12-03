import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InsightEngineService {
  private readonly logger = new Logger(InsightEngineService.name);

  constructor(private prisma: PrismaService) {}

  async generateInsights() {
    this.logger.log('Running Insight Engine...');
    const workspaces = await this.prisma.workspace.findMany({
      select: { id: true },
    });

    for (const ws of workspaces) {
      await this.analyzeFlowBottlenecks(ws.id);
      await this.analyzeCampaignPerformance(ws.id);
    }
  }

  private async analyzeFlowBottlenecks(workspaceId: string) {
    // Find flows with high drop-off rates
    // Mock logic for "Top 1" demo
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId, isActive: true },
      include: { executions: { take: 100 } },
    });

    for (const flow of flows) {
      const total = flow.executions.length;
      if (total < 10) continue;

      const failed = flow.executions.filter(
        (e) => e.status === 'FAILED',
      ).length;
      const failureRate = failed / total;

      if (failureRate > 0.2) {
        await this.createInsight(workspaceId, {
          type: 'FLOW_BOTTLENECK',
          title: `High failure rate in flow "${flow.name}"`,
          description: `${(failureRate * 100).toFixed(1)}% of executions are failing. Check your API connections or logic.`,
          severity: 'WARNING',
          metadata: { flowId: flow.id, failureRate },
        });
      }
    }
  }

  private analyzeCampaignPerformance(workspaceId: string) {
    void workspaceId;
    // ... similar logic for campaigns
    return Promise.resolve();
  }

  private async createInsight(workspaceId: string, data: any) {
    // Deduplicate: Check if similar insight exists recently
    const existing = await this.prisma.systemInsight.findFirst({
      where: {
        workspaceId,
        type: data.type,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
        title: data.title,
      },
    });

    if (!existing) {
      await this.prisma.systemInsight.create({
        data: {
          workspaceId,
          ...data,
        },
      });
    }
  }

  async getInsights(workspaceId: string) {
    return this.prisma.systemInsight.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
