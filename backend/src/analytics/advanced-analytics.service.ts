import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentPerformanceService } from './agent-performance.service';
import { QueueStatsService } from './queue-stats.service';

// cache.invalidate — analytics queries are read-only aggregations; no cached writes to invalidate
@Injectable()
/**
 * @cluster whatsapp_saas/backend/analytics
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AdvancedAnalyticsService {
  private readonly logger = new Logger(AdvancedAnalyticsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly agentPerformance: AgentPerformanceService,
    private readonly queueStats: QueueStatsService,
  ) {
    this.logger.log('AdvancedAnalyticsService initialized');
  }

  private toDayKey(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Get advanced dashboard. */
  async getAdvancedDashboard(workspaceId: string, startDate: Date, endDate: Date) {
    const [agentPerformance, queueStats] = await Promise.all([
      this.agentPerformance.getAgentPerformance(workspaceId, startDate, endDate),
      this.queueStats.getQueueStats(workspaceId),
    ]);

    const [sales, conversationsAgg, executionsAgg, newContactsCount] = await Promise.all([
      this.prisma.kloelSale.findMany({
        take: 5000,
        where: {
          workspaceId,
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          amount: true,
          status: true,
          paymentMethod: true,
          createdAt: true,
          paidAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.conversation.groupBy({
        by: ['status'],
        where: {
          workspaceId,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      this.prisma.flowExecution.groupBy({
        by: ['status'],
        where: {
          workspaceId,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
      }),
      this.prisma.contact.count({
        where: {
          workspaceId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    const salesTotals = sales.reduce(
      (acc, s) => {
        acc.totalCount += 1;
        acc.totalAmount += s.amount || 0;
        if (s.status === 'paid') {
          acc.paidCount += 1;
          acc.paidAmount += s.amount || 0;
        }
        return acc;
      },
      { totalCount: 0, totalAmount: 0, paidCount: 0, paidAmount: 0 },
    );

    const salesByDayMap = new Map<
      string,
      { day: string; paidAmount: number; paidCount: number; totalCount: number }
    >();
    for (const s of sales) {
      const dayKey = this.toDayKey(s.paidAt || s.createdAt);
      const current = salesByDayMap.get(dayKey) || {
        day: dayKey,
        paidAmount: 0,
        paidCount: 0,
        totalCount: 0,
      };
      current.totalCount += 1;
      if (s.status === 'paid') {
        current.paidAmount += s.amount || 0;
        current.paidCount += 1;
      }
      salesByDayMap.set(dayKey, current);
    }

    const salesByDay = Array.from(salesByDayMap.values()).sort((a, b) =>
      a.day.localeCompare(b.day),
    );

    const conversationsByStatus = conversationsAgg.reduce((acc: Record<string, number>, row) => {
      acc[row.status] = row._count.id;
      return acc;
    }, {});

    const executionsByStatus = executionsAgg.reduce((acc: Record<string, number>, row) => {
      acc[row.status] = row._count.id;
      return acc;
    }, {});

    const executionsTotal = Object.values(executionsByStatus).reduce(
      (sum, value) => sum + value,
      0,
    );
    const executionsCompleted = executionsByStatus.COMPLETED || 0;
    const executionsFailed = executionsByStatus.FAILED || 0;

    const topFlowAgg = await this.prisma.flowExecution.groupBy({
      by: ['flowId'],
      where: {
        workspaceId,
        createdAt: { gte: startDate, lte: endDate },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const flowIds = topFlowAgg.map((row) => row.flowId);
    const flows = await this.prisma.flow.findMany({
      take: 100,
      where: { id: { in: flowIds }, workspaceId },
      select: { id: true, name: true },
    });
    const flowNameById = new Map(flows.map((f) => [f.id, f.name || f.id]));

    const topFlows = topFlowAgg.map((row) => ({
      flowId: row.flowId,
      name: flowNameById.get(row.flowId) || row.flowId,
      executions: row._count.id,
    }));

    return {
      range: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      sales: {
        totals: {
          totalCount: salesTotals.totalCount,
          totalAmount: Math.round(salesTotals.totalAmount * 100) / 100,
          paidCount: salesTotals.paidCount,
          paidAmount: Math.round(salesTotals.paidAmount * 100) / 100,
          conversionRate:
            salesTotals.totalCount > 0 ? salesTotals.paidCount / salesTotals.totalCount : 0,
        },
        byDay: salesByDay,
      },
      leads: {
        newContacts: newContactsCount,
      },
      inbox: {
        conversationsByStatus,
        waitingByQueue: queueStats,
      },
      funnels: {
        executionsByStatus,
        totals: {
          total: executionsTotal,
          completed: executionsCompleted,
          failed: executionsFailed,
          completionRate: executionsTotal > 0 ? executionsCompleted / executionsTotal : 0,
        },
        topFlows,
      },
      agents: {
        performance: agentPerformance,
      },
      queues: {
        stats: queueStats,
      },
    };
  }
}
