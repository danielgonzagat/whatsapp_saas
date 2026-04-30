import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { asProviderSettings } from '../whatsapp/provider-settings.types';
import {
  computeAverageResponseTimeSeconds,
  computeOperationalHealth,
  countByBuckets,
  resolveDashboardHomeRange,
  sumByBuckets,
} from './home-aggregation.util';

/** Dashboard service. */
// PULSE_OK: all new Date() in this service construct from numbers (Date.now, getTime, getFullYear) — no unsafe string parsing
@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /** Get stats. */
  async getStats(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const billingSuspended =
      asProviderSettings(workspace?.providerSettings).billingSuspended === true;

    // 1. Basic Counts
    const [totalContacts, totalCampaigns, totalFlows] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId } }),
      this.prisma.campaign.count({ where: { workspaceId } }),
      this.prisma.flow.count({ where: { workspaceId } }),
    ]);

    // 2. Message Metrics (Real Aggregation)
    // Fetch counts by status for OUTBOUND messages
    const messageStats = await this.prisma.message.groupBy({
      by: ['status'],
      where: {
        workspaceId,
        direction: 'OUTBOUND',
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      _count: { status: true },
    });

    const statsMap = messageStats.reduce(
      (acc, curr) => {
        acc[curr.status] = curr._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );

    const sent = statsMap.SENT || 0;
    const delivered = statsMap.DELIVERED || 0;
    const read = statsMap.READ || 0;
    const failed = statsMap.FAILED || 0;
    const totalOutbound = sent + delivered + read + failed;

    // Delivery Rate: (Delivered + Read) / Total Attempted
    const deliveryRate = totalOutbound > 0 ? ((delivered + read) / totalOutbound) * 100 : 0;

    // Read Rate (Open Rate): Read / (Delivered + Read)
    const deliveredOrRead = delivered + read;
    const readRate = deliveredOrRead > 0 ? (read / deliveredOrRead) * 100 : 0;

    // 3. Active Conversations
    const activeConversations = await this.prisma.conversation.count({
      where: { workspaceId, status: 'OPEN' },
    });

    // 4. Flow Executions (Today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const flowExecutions = await this.prisma.flowExecution.groupBy({
      by: ['status'],
      where: {
        workspaceId,
        createdAt: { gte: todayStart },
      },
      _count: { status: true },
    });

    const flowStats = flowExecutions.reduce(
      (acc, curr) => {
        acc[curr.status] = curr._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );

    // 5. Health Metrics (Redis Rolling Window)
    const key = `metrics:${workspaceId}`;
    const events = await this.redis.lrange(key, 0, -1);
    let healthScore = 100;
    let avgLatency = 0;

    if (events.length > 0) {
      let success = 0;
      let totalLatency = 0;
      events.forEach((e) => {
        const [ok, lat] = e.split(':');
        if (ok === '1') {
          success++;
        }
        totalLatency += Number(lat || 0);
      });
      healthScore = Math.round((success / events.length) * 100);
      avgLatency = Math.round(totalLatency / events.length);
    }

    return {
      contacts: totalContacts,
      campaigns: totalCampaigns,
      flows: totalFlows,
      messages: totalOutbound,

      // Calculated Rates
      deliveryRate: Number(deliveryRate.toFixed(1)),
      readRate: Number(readRate.toFixed(1)),
      errorRate: totalOutbound > 0 ? Number(((failed / totalOutbound) * 100).toFixed(1)) : 0,

      // Operational
      activeConversations,
      healthScore,
      avgLatency,

      // Flow Funnel (Today)
      flowCompleted: flowStats.COMPLETED || 0,
      flowRunning: flowStats.RUNNING || 0,
      flowFailed: flowStats.FAILED || 0,

      billingSuspended,
    };
  }

  /** Get home snapshot. */
  async getHomeSnapshot(
    workspaceId: string,
    input?: { period?: string; startDate?: string; endDate?: string },
  ) {
    const range = resolveDashboardHomeRange(input);
    const snapshotNow = new Date();
    const paidStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];
    const startOfToday = new Date(snapshotNow);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const endOfYesterday = new Date(startOfToday.getTime() - 1);
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
    const startOfPreviousMonth = new Date(
      startOfToday.getFullYear(),
      startOfToday.getMonth() - 1,
      1,
    );
    const endOfPreviousMonth = new Date(startOfMonth.getTime() - 1);

    const [
      wallet,
      currentPaidOrders,
      previousPaidOrders,
      currentOrders,
      monthPaidAggregate,
      previousMonthPaidAggregate,
      todayPaidAggregate,
      yesterdayPaidAggregate,
      currentConversationCount,
      waitingForHumanCount,
      recentConversations,
      responseMessages,
    ] = await Promise.all([
      this.prisma.kloelWallet.findUnique({
        where: { workspaceId },
      }),
      // PULSE_OK: bounded by date range and workspace filter
      this.prisma.checkoutOrder.findMany({
        where: {
          workspaceId,
          status: { in: paidStatuses },
          createdAt: { gte: range.start, lte: range.end },
        },
        select: {
          id: true,
          createdAt: true,
          totalInCents: true,
          plan: {
            select: {
              productId: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  active: true,
                  imageUrl: true,
                  category: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 5000,
      }),
      this.prisma.checkoutOrder.findMany({
        where: {
          workspaceId,
          status: { in: paidStatuses },
          createdAt: { gte: range.previousStart, lte: range.previousEnd },
        },
        select: {
          createdAt: true,
          totalInCents: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 5000,
      }),
      this.prisma.checkoutOrder.findMany({
        where: {
          workspaceId,
          createdAt: { gte: range.start, lte: range.end },
        },
        select: {
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 5000,
      }),
      this.prisma.checkoutOrder.aggregate({
        where: {
          workspaceId,
          status: { in: paidStatuses },
          createdAt: { gte: startOfMonth, lte: snapshotNow },
        },
        _sum: { totalInCents: true },
      }),
      this.prisma.checkoutOrder.aggregate({
        where: {
          workspaceId,
          status: { in: paidStatuses },
          createdAt: { gte: startOfPreviousMonth, lte: endOfPreviousMonth },
        },
        _sum: { totalInCents: true },
      }),
      this.prisma.checkoutOrder.aggregate({
        where: {
          workspaceId,
          status: { in: paidStatuses },
          createdAt: { gte: startOfToday, lte: snapshotNow },
        },
        _sum: { totalInCents: true },
      }),
      this.prisma.checkoutOrder.aggregate({
        where: {
          workspaceId,
          status: { in: paidStatuses },
          createdAt: { gte: startOfYesterday, lte: endOfYesterday },
        },
        _sum: { totalInCents: true },
      }),
      this.prisma.conversation.count({
        where: {
          workspaceId,
          createdAt: { gte: range.start, lte: range.end },
        },
      }),
      this.prisma.conversation.count({
        where: {
          workspaceId,
          status: 'OPEN',
          OR: [{ mode: 'HUMAN' }, { assignedAgentId: { not: null } }, { unreadCount: { gt: 0 } }],
        },
      }),
      this.prisma.conversation.findMany({
        where: { workspaceId },
        include: {
          contact: {
            select: {
              name: true,
              phone: true,
              avatarUrl: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              content: true,
              createdAt: true,
              direction: true,
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 4,
      }),
      this.prisma.message.findMany({
        where: {
          workspaceId,
          conversationId: { not: null },
          createdAt: { gte: range.start, lte: range.end },
        },
        select: {
          conversationId: true,
          direction: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 3000,
      }),
    ]);

    const currentRevenueInCents = currentPaidOrders.reduce(
      (sum, order) => sum + Number(order.totalInCents || 0),
      0,
    );
    const previousRevenueInCents = previousPaidOrders.reduce(
      (sum, order) => sum + Number(order.totalInCents || 0),
      0,
    );
    const paidOrderCount = currentPaidOrders.length;
    const orderCount = currentOrders.length;
    const averageTicketInCents =
      paidOrderCount > 0 ? Math.round(currentRevenueInCents / paidOrderCount) : 0;
    const checkoutCompletionRatePct =
      orderCount > 0 ? Number(((paidOrderCount / orderCount) * 100).toFixed(1)) : 0;

    const revenueSeries = sumByBuckets(
      currentPaidOrders,
      range.buckets,
      (row) => row.createdAt,
      (row) => Number(row.totalInCents || 0),
    );
    const previousRevenueSeries = sumByBuckets(
      previousPaidOrders,
      range.previousBuckets,
      (row) => row.createdAt,
      (row) => Number(row.totalInCents || 0),
    );
    const paidOrdersSeries = countByBuckets(
      currentPaidOrders,
      range.buckets,
      (row) => row.createdAt,
    );
    const allOrdersSeries = countByBuckets(currentOrders, range.buckets, (row) => row.createdAt);

    const conversionSeries = paidOrdersSeries.map((value, index) => {
      const total = allOrdersSeries[index] || 0;
      return total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
    });
    const averageTicketSeries = revenueSeries.map((value, index) => {
      const totalPaid = paidOrdersSeries[index] || 0;
      return totalPaid > 0 ? Math.round(value / totalPaid) : 0;
    });

    const productStats = new Map<
      string,
      {
        id: string;
        name: string;
        status: string;
        category: string | null;
        imageUrl: string | null;
        totalRevenueInCents: number;
        totalSales: number;
      }
    >();

    currentPaidOrders.forEach((order) => {
      const product = order.plan?.product;
      if (!product?.id) {
        return;
      }
      const key = product.id;
      if (!productStats.has(key)) {
        productStats.set(key, {
          id: product.id,
          name: product.name,
          status: product.status || (product.active ? 'ACTIVE' : 'DRAFT'),
          category: product.category || null,
          imageUrl: product.imageUrl || null,
          totalRevenueInCents: 0,
          totalSales: 0,
        });
      }

      const current = productStats.get(key);
      current.totalRevenueInCents += Number(order.totalInCents || 0);
      current.totalSales += 1;
    });

    const topProducts = Array.from(productStats.values())
      .sort((left, right) => right.totalRevenueInCents - left.totalRevenueInCents)
      .slice(0, 4)
      .map((item, index) => ({
        ...item,
        isTop: index === 0,
      }));

    const averageResponseTimeSeconds = computeAverageResponseTimeSeconds(responseMessages);
    const revenueDeltaPct =
      previousRevenueInCents > 0
        ? Number(
            (
              ((currentRevenueInCents - previousRevenueInCents) / previousRevenueInCents) *
              100
            ).toFixed(1),
          )
        : null;

    const operationalHealth = computeOperationalHealth([
      currentRevenueInCents > 0,
      topProducts.length > 0,
      Number(wallet?.availableBalanceInCents || 0) > 0 ||
        Number(wallet?.pendingBalanceInCents || 0) > 0,
      recentConversations.length > 0,
    ]);

    return {
      generatedAt: new Date().toISOString(),
      range: {
        period: range.period,
        label: range.label,
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
      },
      hero: {
        totalRevenueInCents: currentRevenueInCents,
        previousRevenueInCents,
        revenueDeltaPct,
        monthRevenueInCents: Number(monthPaidAggregate._sum.totalInCents || 0),
        previousMonthRevenueInCents: Number(previousMonthPaidAggregate._sum.totalInCents || 0),
        todayRevenueInCents: Number(todayPaidAggregate._sum.totalInCents || 0),
        yesterdayRevenueInCents: Number(yesterdayPaidAggregate._sum.totalInCents || 0),
        availableBalanceInCents: Number(wallet?.availableBalanceInCents || 0),
        pendingBalanceInCents: Number(wallet?.pendingBalanceInCents || 0),
      },
      metrics: {
        paidOrders: paidOrderCount,
        totalOrders: orderCount,
        conversionRatePct: checkoutCompletionRatePct,
        averageTicketInCents,
        totalConversations: currentConversationCount,
        convertedOrders: paidOrderCount,
        waitingForHuman: waitingForHumanCount,
        averageResponseTimeSeconds,
      },
      series: {
        labels: range.buckets.map((bucket) => bucket.label),
        revenueInCents: revenueSeries,
        previousRevenueInCents: previousRevenueSeries,
        paidOrders: paidOrdersSeries,
        totalOrders: allOrdersSeries,
        conversionRatePct: conversionSeries,
        averageTicketInCents: averageTicketSeries,
      },
      products: topProducts,
      recentConversations: recentConversations.map((conversation) => {
        const lastMessage = conversation.messages?.[0];
        const status =
          conversation.status === 'CLOSED'
            ? 'done'
            : conversation.mode === 'AI' && conversation.unreadCount === 0
              ? 'ai'
              : 'waiting';

        return {
          id: conversation.id,
          contactName:
            conversation.contact?.name ||
            conversation.contact?.phone ||
            'Contato sem identificação',
          contactPhone: conversation.contact?.phone || null,
          avatarUrl: conversation.contact?.avatarUrl || null,
          preview: String(lastMessage?.content || '').trim(),
          lastMessageAt:
            (lastMessage?.createdAt || conversation.lastMessageAt)?.toISOString?.() || null,
          status,
          unreadCount: conversation.unreadCount,
        };
      }),
      health: {
        operationalScorePct: operationalHealth.operationalScorePct,
        checkoutCompletionRatePct,
        activeCheckpoints: operationalHealth.activeCheckpoints,
        totalCheckpoints: operationalHealth.totalCheckpoints,
        checkpoints: [
          {
            id: 'paid-revenue',
            label: 'Receita paga no período',
            description: 'O workspace precisa registrar ao menos uma venda paga dentro do recorte.',
            active: currentRevenueInCents > 0,
          },
          {
            id: 'selling-product',
            label: 'Produto com venda',
            description:
              'Ao menos um produto precisa aparecer com venda real no ranking do período.',
            active: topProducts.length > 0,
          },
          {
            id: 'wallet-balance',
            label: 'Saldo ou valor pendente',
            description:
              'A carteira precisa ter saldo disponível ou valor pendente vinculado às vendas.',
            active:
              Number(wallet?.availableBalanceInCents || 0) > 0 ||
              Number(wallet?.pendingBalanceInCents || 0) > 0,
          },
          {
            id: 'recent-conversations',
            label: 'Conversas recentes',
            description:
              'O Home considera a operação viva quando há conversas recentes carregadas no workspace.',
            active: recentConversations.length > 0,
          },
        ],
      },
    };
  }
}
