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
} from './analytics.helpers';
import {
  aggregateMessagesByDay,
  buildOutboundStatusMap,
  computeAvgResponseTimeSeconds,
  flattenDailyActivity,
  groupSalesByDay,
  initializeDailyActivityMap,
  processFlowExecutionStats,
  processLeadScoreStats,
  processOutboundDeliveryStats,
  processSentimentStats,
  summarizeFlowExecutions,
} from './analytics.service.helpers';

/**
 * @cluster whatsapp_saas/backend/analytics
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */

/** Analytics service. */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Canonical-name alias of {@link getDashboardStats} for the Kloel
   * capability resolver (`AnalyticsService.get`). Accepts the
   * (workspaceId, args) signature used by `KloelDomainServiceResolver`;
   * args are ignored — analytics are workspace-scoped only.
   */
  async get(workspaceId: string) {
    return this.getDashboardStats(workspaceId);
  }

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

        const sentimentStats = processSentimentStats(sentiment);
        const scoreStats = processLeadScoreStats(leadScore);
        const statusMap = buildOutboundStatusMap(outboundStatus);
        const { deliveryRate, readRate, errorRate } = processOutboundDeliveryStats(statusMap);
        const flowStats = processFlowExecutionStats(flowExecs);

        return {
          messages,
          contacts,
          flows: flowStats.flows,
          flowCompleted: flowStats.flowCompleted,
          flowFailed: flowStats.flowFailed,
          flowRunning: flowStats.flowRunning,
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

    const activity = initializeDailyActivityMap();
    aggregateMessagesByDay(messages, activity);
    return flattenDailyActivity(activity);
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

    return summarizeFlowExecutions(executions);
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

    const revenueByDay = groupSalesByDay(paidSales, days);
    const prevRevenueByDay = groupSalesByDay(prevPaidSales, days);

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
      avgResponseTime = computeAvgResponseTimeSeconds(recent);
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
}
