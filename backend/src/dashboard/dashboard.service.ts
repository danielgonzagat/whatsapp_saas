import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
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
import { computeProductRanking } from './dashboard.product-rank.helpers';
type SetupChecklistItem = {
  key: string;
  completed: boolean;
};
const SETUP_CHECKPOINT_COPY: Record<string, { label: string; description: string }> = {
  profile: {
    label: 'Perfil comercial configurado',
    description:
      'O onboarding precisa salvar o tipo de usuário, canal principal e uso inicial da IA.',
  },
  product: {
    label: 'Produto informado',
    description:
      'O workspace precisa ter produto próprio ou intenção clara de cadastrar um produto.',
  },
  checkout: {
    label: 'Checkout informado',
    description: 'O produtor precisa confirmar se já possui checkout ou criar um checkout Kloel.',
  },
  payment: {
    label: 'Pagamentos conectados',
    description: 'O workspace precisa ter provider de pagamento pronto para receber vendas reais.',
  },
  channel: {
    label: 'Canal principal definido',
    description: 'WhatsApp, Instagram, Messenger ou e-mail precisa estar definido no setup.',
  },
  ai: {
    label: 'Uso da IA definido',
    description: 'A IA precisa saber se começa em atendimento, venda ou recuperação.',
  },
};
function readSetupChecklist(value: unknown): SetupChecklistItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (typeof record.key !== 'string' || typeof record.completed !== 'boolean') {
      return [];
    }
    return [{ key: record.key, completed: record.completed }];
  });
}
/** Dashboard service. */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  constructor(
    private prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}
  async getStats(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const billingSuspended =
      asProviderSettings(workspace?.providerSettings).billingSuspended === true;
    const [totalContacts, totalCampaigns, totalFlows] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId } }),
      this.prisma.campaign.count({ where: { workspaceId } }),
      this.prisma.flow.count({ where: { workspaceId } }),
    ]);
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
    const deliveryRate = totalOutbound > 0 ? ((delivered + read) / totalOutbound) * 100 : 0;
    const deliveredOrRead = delivered + read;
    const readRate = deliveredOrRead > 0 ? (read / deliveredOrRead) * 100 : 0;
    const activeConversations = await this.prisma.conversation.count({
      where: { workspaceId, status: 'OPEN' },
    });
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
    const key = `metrics:${workspaceId}`;
    this.logger.log('Fetching Redis operational metrics', {
      context: 'DashboardService.getStats',
      workspaceId,
    });
    const events = await this.redis.lrange(key, 0, -1);
    let healthScore = 100;
    let avgLatency = 0;
    if (events.length > 0) {
      let success = 0;
      let totalLatency = 0;
      events.forEach((e) => {
        const [ok, lat] = e.split(':');
        if (ok === '1') {
          success += 1;
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
      setupChecklistMemory,
    ] = await Promise.all([
      this.prisma.kloelWallet.findUnique({
        where: { workspaceId },
      }),
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
      this.prisma.kloelMemory.findUnique({
        where: { workspaceId_key: { workspaceId, key: 'onboarding_setup_checklist' } },
        select: { value: true },
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
    const topProducts = computeProductRanking(currentPaidOrders);
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
    const setupChecklist = readSetupChecklist(setupChecklistMemory?.value);
    const setupCheckpoints = setupChecklist.map((item) => {
      const copy = SETUP_CHECKPOINT_COPY[item.key] ?? {
        label: `Setup: ${item.key}`,
        description: 'Item de setup persistido pelo onboarding inicial.',
      };
      return {
        id: `setup-${item.key}`,
        label: copy.label,
        description: copy.description,
        active: item.completed,
      };
    });
    const setupActiveCheckpoints = setupCheckpoints.filter(
      (checkpoint) => checkpoint.active,
    ).length;
    const totalHealthCheckpoints = operationalHealth.totalCheckpoints + setupCheckpoints.length;
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
        activeCheckpoints: operationalHealth.activeCheckpoints + setupActiveCheckpoints,
        totalCheckpoints: totalHealthCheckpoints,
        checkpoints: [
          ...setupCheckpoints,
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
