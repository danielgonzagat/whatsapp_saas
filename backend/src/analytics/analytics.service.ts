import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(workspaceId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      messages,
      contacts,
      flowExecs,
      sentiment,
      leadScore,
      outboundStatus,
    ] = await Promise.all(
      [
        this.prisma.message.count({
          where: { workspaceId, createdAt: { gte: today } },
        }),
        this.prisma.contact.count({ where: { workspaceId } }),
        this.prisma.flowExecution.groupBy({
          by: ['status'],
          where: { workspaceId, createdAt: { gte: sevenDaysAgo } },
          _count: { status: true },
        }),
        // NeuroCRM Sentiment
        this.prisma.contact.groupBy({
          by: ['sentiment'],
          where: { workspaceId },
          _count: { sentiment: true },
        }),
        // NeuroCRM Score buckets (simplified fetch, buckets handled in logic)
        this.prisma.contact.findMany({
          where: { workspaceId },
          select: { leadScore: true },
        }),
        this.prisma.message.groupBy({
          by: ['status'],
          where: {
            workspaceId,
            direction: 'OUTBOUND',
            createdAt: { gte: today },
          },
          _count: { status: true },
        }),
      ],
    );

    // Process Sentiment
    const sentimentStats = { positive: 0, negative: 0, neutral: 0 };
    sentiment.forEach((s) => {
      if (s.sentiment === 'POSITIVE')
        sentimentStats.positive = s._count.sentiment;
      else if (s.sentiment === 'NEGATIVE')
        sentimentStats.negative = s._count.sentiment;
      else sentimentStats.neutral += s._count.sentiment;
    });

    // Process Score
    const scoreStats = { high: 0, medium: 0, low: 0 };
    leadScore.forEach((c) => {
      if (c.leadScore > 70) scoreStats.high++;
      else if (c.leadScore > 30) scoreStats.medium++;
      else scoreStats.low++;
    });

    // Process delivery/read/error based on outbound status
    const statusMap: Record<string, number> = {};
    outboundStatus.forEach((s) => {
      statusMap[(s.status || 'UNKNOWN').toUpperCase()] = s._count.status;
    });
    // Considera SENT como entregue para não zerar métricas em ambientes sem callbacks
    const delivered = (statusMap['DELIVERED'] || 0) + (statusMap['SENT'] || 0);
    const read = statusMap['READ'] || 0;
    const failed = statusMap['FAILED'] || 0;
    const totalOutbound = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const pct = (val: number) =>
      totalOutbound > 0 ? Math.round((val / totalOutbound) * 100) : 0;
    const deliveryRate = pct(delivered);
    const readRate = pct(read);
    const errorRate = pct(failed);

    // Flow execution status (últimos 7d)
    const flowStatsMap: Record<string, number> = {};
    flowExecs.forEach((f) => {
      flowStatsMap[f.status || 'UNKNOWN'] = f._count.status;
    });

    return {
      messages,
      contacts,
      flows: Object.values(flowStatsMap).reduce((a, b) => a + b, 0),
      flowCompleted: flowStatsMap['COMPLETED'] || 0,
      flowFailed: flowStatsMap['FAILED'] || 0,
      flowRunning: flowStatsMap['RUNNING'] || 0,
      deliveryRate,
      readRate,
      errorRate,
      sentiment: sentimentStats,
      leadScore: scoreStats,
    };
  }

  async getDailyActivity(workspaceId: string) {
    // Group messages by date (Last 7 days)
    // Prisma doesn't support native date grouping easily without raw query,
    // so we fetch metadata and aggregate in JS for portability (or use raw query if performance needed)

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const messages = await this.prisma.message.findMany({
      where: {
        workspaceId,
        createdAt: { gte: sevenDaysAgo },
      },
      select: { createdAt: true, direction: true },
    });

    const activity: Record<string, { inbound: number; outbound: number }> = {};

    // Initialize last 7 days
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      activity[key] = { inbound: 0, outbound: 0 };
    }

    messages.forEach((m) => {
      const key = m.createdAt.toISOString().split('T')[0];
      if (activity[key]) {
        if (m.direction === 'INBOUND') activity[key].inbound++;
        else activity[key].outbound++;
      }
    });

    return Object.entries(activity)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getFlowStats(workspaceId: string, flowId: string) {
    // Garante que o fluxo pertence ao workspace
    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      select: { workspaceId: true },
    });
    if (!flow || flow.workspaceId !== workspaceId) {
      throw new Error('Fluxo não encontrado no workspace');
    }

    const executions = await this.prisma.flowExecution.findMany({
      where: { flowId, workspaceId },
      select: { status: true, logs: true, createdAt: true },
      take: 100, // Limit for performance
    });

    const total = executions.length;
    const completed = executions.filter((e) => e.status === 'COMPLETED').length;
    const failed = executions.filter((e) => e.status === 'FAILED').length;

    // Drop-off analysis (Node visits)
    const nodeVisits: Record<string, number> = {};
    executions.forEach((exec) => {
      if (Array.isArray(exec.logs)) {
        const logs = exec.logs as any[];
        const visitedNodes = new Set<string>();
        logs.forEach((log) => {
          if (log.nodeId) visitedNodes.add(log.nodeId);
        });
        visitedNodes.forEach((nodeId) => {
          nodeVisits[nodeId] = (nodeVisits[nodeId] || 0) + 1;
        });
      }
    });

    return {
      total,
      completed,
      failed,
      conversionRate: total > 0 ? (completed / total) * 100 : 0,
      nodeVisits,
    };
  }
}
