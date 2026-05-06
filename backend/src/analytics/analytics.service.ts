import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../common/cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DAY_MS,
  aggregatePaymentMethods,
  aggregateTimePatterns,
  aggregateTopProducts,
  buildReportFinancial,
  buildReportKpi,
  buildSalesSummary,
  computeTrendPct,
  resolveReportWindow,
} from './__companions__/analytics.service.companion';

/** Analytics service. */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Get dashboard stats. */
  async getDashboardStats(workspaceId: string) {
    return this.cache.wrap(
      `cache:analytics:stats:${workspaceId}`,
      async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [messages, contacts, flowExecs, sentiment, leadScore, outboundStatus] =
          await Promise.all([
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
              take: 5000,
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
          ]);

        // Process Sentiment
        const sentimentStats = { positive: 0, negative: 0, neutral: 0 };
        sentiment.forEach((s) => {
          if (s.sentiment === 'POSITIVE') {
            sentimentStats.positive = s._count.sentiment;
          } else if (s.sentiment === 'NEGATIVE') {
            sentimentStats.negative = s._count.sentiment;
          } else {
            sentimentStats.neutral += s._count.sentiment;
          }
        });

        // Process Score
        const scoreStats = { high: 0, medium: 0, low: 0 };
        leadScore.forEach((c) => {
          if (c.leadScore > 70) {
            scoreStats.high++;
          } else if (c.leadScore > 30) {
            scoreStats.medium++;
          } else {
            scoreStats.low++;
          }
        });

        // Process delivery/read/error based on outbound status
        const statusMap: Record<string, number> = {};
        outboundStatus.forEach((s) => {
          statusMap[(s.status || 'UNKNOWN').toUpperCase()] = s._count.status;
        });
        // Considera SENT como entregue para não zerar métricas em ambientes sem callbacks
        const delivered = (statusMap.DELIVERED || 0) + (statusMap.SENT || 0);
        const read = statusMap.READ || 0;
        const failed = statusMap.FAILED || 0;
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
          flowCompleted: flowStatsMap.COMPLETED || 0,
          flowFailed: flowStatsMap.FAILED || 0,
          flowRunning: flowStatsMap.RUNNING || 0,
          deliveryRate,
          readRate,
          errorRate,
          sentiment: sentimentStats,
          leadScore: scoreStats,
        };
      },
      { ttl: 120 },
    );
  }

  /** Get daily activity. */
  async getDailyActivity(workspaceId: string) {
    // Group messages by date (Last 7 days)
    // Prisma doesn't support native date grouping easily without raw query,
    // so we fetch metadata and aggregate in JS for portability (or use raw query if performance needed)

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const messages = await this.prisma.message.findMany({
      take: 10000,
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
        if (m.direction === 'INBOUND') {
          activity[key].inbound++;
        } else {
          activity[key].outbound++;
        }
      }
    });

    return Object.entries(activity)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Get flow stats. */
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
        const logs = exec.logs as Record<string, unknown>[];
        const visitedNodes = new Set<string>();
        logs.forEach((log) => {
          if (typeof log.nodeId === 'string') {
            visitedNodes.add(log.nodeId);
            return;
          }

          if (typeof log.nodeId === 'number') {
            visitedNodes.add(String(log.nodeId));
          }
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

  // ═══════════════════════════════════════
  // FULL REPORT — aggregation for Relatorio page
  // ═══════════════════════════════════════

  async getFullReport(workspaceId: string, period = '30d', startDate?: Date, endDate?: Date) {
    const window = resolveReportWindow(period, startDate, endDate);
    const { since, prevSince, days } = window;

    const [sales, prevSales] = await this.fetchReportSales(workspaceId, since, prevSince);
    const salesSummary = buildSalesSummary(sales, prevSales);
    const { paidSales, prevPaidSales, refunds, totalRevenue, totalPending, avgTicket } =
      salesSummary;

    const revenueByDay = this.groupByDay(paidSales, days);
    const prevRevenueByDay = this.groupByDay(prevPaidSales, days);

    const [leads, prevLeads] = await this.fetchLeadCounts(workspaceId, since, prevSince);
    const leadsTrend = computeTrendPct(leads, prevLeads);
    const conversionRate = leads > 0 ? (paidSales.length / leads) * 100 : 0;

    const topProducts = aggregateTopProducts(paidSales);

    const funnel = await this.fetchFunnelCounts(workspaceId);

    const paymentMethods = aggregatePaymentMethods(paidSales);

    const { salesByHour, salesByWeekday } = aggregateTimePatterns(paidSales);

    const wallet = await this.fetchWalletSafe(workspaceId);
    const adSpend = 0;

    const [totalMessages, aiMessages] = await this.fetchMessageCountsSafe(workspaceId, since);

    return {
      period,
      kpi: buildReportKpi({
        totalRevenue,
        revenueTrend: salesSummary.revenueTrend,
        paidSales,
        prevPaidSales,
        leads,
        leadsTrend,
        conversionRate,
        avgTicket,
        totalPending,
        adSpend,
      }),
      revenueChart: { current: revenueByDay, previous: prevRevenueByDay },
      topProducts,
      funnel,
      paymentMethods,
      salesByHour,
      salesByWeekday,
      aiPerformance: { totalMessages, aiMessages },
      financial: buildReportFinancial(wallet, refunds),
    };
  }

  private async fetchReportSales(workspaceId: string, since: Date, prevSince: Date) {
    return Promise.all([
      this.prisma.kloelSale.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: {
          amount: true,
          status: true,
          paymentMethod: true,
          productName: true,
          createdAt: true,
        },
        take: 5000,
      }),
      this.prisma.kloelSale.findMany({
        where: { workspaceId, createdAt: { gte: prevSince, lt: since } },
        select: { amount: true, status: true, createdAt: true },
        take: 5000,
      }),
    ]);
  }

  private async fetchLeadCounts(workspaceId: string, since: Date, prevSince: Date) {
    return Promise.all([
      this.prisma.kloelLead.count({
        where: { workspaceId, createdAt: { gte: since } },
      }),
      this.prisma.kloelLead.count({
        where: { workspaceId, createdAt: { gte: prevSince, lt: since } },
      }),
    ]);
  }

  private async fetchFunnelCounts(workspaceId: string) {
    const [totalContacts, totalLeadsAll, qualifiedLeads, convertedLeads] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId } }),
      this.prisma.kloelLead.count({ where: { workspaceId } }),
      this.prisma.kloelLead.count({ where: { workspaceId, score: { gte: 50 } } }).catch(() => 0),
      this.prisma.kloelLead.count({ where: { workspaceId, status: 'converted' } }).catch(() => 0),
    ]);
    return {
      visitors: totalContacts,
      leads: totalLeadsAll,
      qualified: qualifiedLeads,
      negotiation: 0,
      converted: convertedLeads,
    };
  }

  private async fetchWalletSafe(workspaceId: string) {
    return this.prisma.kloelWallet.findFirst({ where: { workspaceId } }).catch((err) => {
      this.logger.warn(`Failed to fetch wallet for workspace ${workspaceId}: ${err?.message}`);
      return null;
    });
  }

  private async fetchMessageCountsSafe(workspaceId: string, since: Date) {
    return Promise.all([
      this.prisma.message
        .count({ where: { workspaceId, createdAt: { gte: since } } })
        .catch((err) => {
          this.logger.warn(`Failed to count messages: ${err?.message}`);
          return 0;
        }),
      this.prisma.message
        .count({
          where: {
            workspaceId,
            direction: 'OUTBOUND',
            createdAt: { gte: since },
          },
        })
        .catch((err) => {
          this.logger.warn(`Failed to count outbound messages: ${err?.message}`);
          return 0;
        }),
    ]);
  }

  /** Get ai report. */
  async getAIReport(workspaceId: string) {
    const [totalProcessed, activeConvos, productsLoaded] = await Promise.all([
      this.prisma.message.count({ where: { workspaceId, direction: 'OUTBOUND' } }).catch(() => 0),
      this.prisma.conversation.count({ where: { workspaceId, status: 'OPEN' } }).catch(() => 0),
      this.prisma.product.count({ where: { workspaceId, active: true } }).catch(() => 0),
    ]);

    // Compute real average response time from recent outbound messages
    let avgResponseTime: number | null = null;
    try {
      const recent = await this.prisma.message.findMany({
        where: {
          workspaceId,
          direction: 'OUTBOUND',
          createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) },
        },
        select: { createdAt: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      });
      if (recent.length >= 2) {
        const sorted = recent.map((m) => m.createdAt.getTime()).sort((a, b) => a - b);
        const intervals: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
          const delta = (sorted[i] - sorted[i - 1]) / 1000;
          if (delta > 0 && delta < 3600) intervals.push(delta);
        }
        if (intervals.length > 0) {
          const sum = intervals.reduce((a, b) => a + b, 0);
          avgResponseTime = Math.round((sum / intervals.length) * 10) / 10;
        }
      }
    } catch {
      this.logger.warn(`Failed to compute avg response time for workspace ${workspaceId}`);
    }

    return {
      messagesProcessed: totalProcessed,
      avgResponseTime: avgResponseTime ?? null,
      activeConversations: activeConvos,
      resolutionRate: null,
      autonomousSales: null,
      followupsSent: null,
      objectionsHandled: null,
      csat: null,
      productsLoaded,
    };
  }

  private groupByDay(
    sales: Array<{ createdAt: Date | string; amount: number }>,
    days: number,
  ): number[] {
    const result = new Array(days).fill(0);
    const now = Date.now();
    sales.forEach((s) => {
      const daysAgo = Math.floor((now - new Date(s.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      const idx = days - 1 - daysAgo;
      if (idx >= 0 && idx < days) {
        result[idx] += s.amount;
      }
    });
    return result;
  }
}
