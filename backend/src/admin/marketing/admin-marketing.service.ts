import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDashboardService } from '../dashboard/admin-dashboard.service';
import { resolveAdminHomeRange, type AdminHomePeriod } from '../dashboard/range.util';

const PAID_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  FACEBOOK: 'Facebook',
  EMAIL: 'Email',
};

function channelLabel(channel: string) {
  return CHANNEL_LABELS[channel.toUpperCase()] ?? channel;
}

/** Admin marketing service. */
@Injectable()
export class AdminMarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: AdminDashboardService,
  ) {}

  async overview(period: AdminHomePeriod, from?: Date, to?: Date) {
    const range = resolveAdminHomeRange({ period, compare: 'NONE', from, to });

    const [home, conversations, messageRows, socialLeads, recentConversations, orders] =
      await Promise.all([
        this.dashboard.getHome(period, 'NONE', from, to),
        this.prisma.conversation.findMany({
          where: { lastMessageAt: { gte: range.from, lte: range.to } },
          orderBy: { lastMessageAt: 'desc' },
          take: 120,
          select: {
            id: true,
            channel: true,
            workspaceId: true,
            lastMessageAt: true,
            workspace: { select: { name: true } },
            contact: { select: { name: true, email: true, phone: true } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { content: true, createdAt: true },
            },
          },
        }),
        this.prisma.$queryRaw<Array<{ channel: string | null; count: bigint }>>(Prisma.sql`
          SELECT c."channel" AS "channel", COUNT(m."id")::bigint AS "count"
          FROM "Message" m
          JOIN "Conversation" c ON c."id" = m."conversationId"
          WHERE m."createdAt" >= ${range.from}
            AND m."createdAt" <= ${range.to}
          GROUP BY c."channel"
        `),
        this.prisma.checkoutSocialLead.count({
          where: { createdAt: { gte: range.from, lte: range.to } },
        }),
        this.prisma.conversation.findMany({
          where: { lastMessageAt: { gte: range.from, lte: range.to } },
          orderBy: { lastMessageAt: 'desc' },
          take: 8,
          select: {
            id: true,
            lastMessageAt: true,
            workspace: { select: { name: true } },
            contact: { select: { name: true, email: true, phone: true } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { content: true },
            },
          },
        }),
        this.prisma.checkoutOrder.findMany({
          where: {
            status: { in: PAID_STATUSES },
            paidAt: { gte: range.from, lte: range.to },
          },
          select: {
            id: true,
            totalInCents: true,
            plan: {
              select: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                    workspaceId: true,
                  },
                },
              },
            },
          },
        }),
      ]);

    const messagesByChannel = new Map(
      messageRows.map((row) => [(row.channel ?? 'UNKNOWN').toUpperCase(), Number(row.count)]),
    );

    const conversationsByChannel = new Map<
      string,
      {
        label: string;
        conversations: number;
        messages: number;
      }
    >();
    for (const conversation of conversations) {
      const key = (conversation.channel || 'UNKNOWN').toUpperCase();
      const current = conversationsByChannel.get(key) ?? {
        label: channelLabel(key),
        conversations: 0,
        messages: messagesByChannel.get(key) ?? 0,
      };
      current.conversations += 1;
      conversationsByChannel.set(key, current);
    }

    const productMap = new Map<
      string,
      {
        id: string;
        name: string;
        imageUrl: string | null;
        workspaceId: string;
        gmvInCents: number;
        approvedOrders: number;
      }
    >();
    for (const order of orders) {
      const product = order.plan.product;
      const current = productMap.get(product.id) ?? {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl ?? null,
        workspaceId: product.workspaceId,
        gmvInCents: 0,
        approvedOrders: 0,
      };
      current.gmvInCents += order.totalInCents;
      current.approvedOrders += 1;
      productMap.set(product.id, current);
    }

    const workspaceIds = Array.from(
      new Set([
        ...conversations.map((row) => row.workspaceId),
        ...Array.from(productMap.values()).map((row) => row.workspaceId),
      ]),
    );
    const workspaces = await this.prisma.workspace.findMany({
      where: { id: { in: workspaceIds } },
      select: { id: true, name: true },
    });
    const workspaceNameMap = new Map(workspaces.map((row) => [row.id, row.name]));

    const topProducts = Array.from(productMap.values())
      .sort((left, right) => right.gmvInCents - left.gmvInCents)
      .slice(0, 6)
      .map((row) => ({
        ...row,
        workspaceName: workspaceNameMap.get(row.workspaceId) ?? null,
      }));

    const topWorkspaceByConversations =
      Array.from(
        conversations.reduce((acc, row) => {
          const current = acc.get(row.workspaceId) ?? 0;
          acc.set(row.workspaceId, current + 1);
          return acc;
        }, new Map<string, number>()),
      )
        .sort((left, right) => right[1] - left[1])
        .map(([workspaceId, count]) => ({
          workspaceId,
          workspaceName: workspaceNameMap.get(workspaceId) ?? workspaceId,
          count,
        }))[0] ?? null;

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        label: range.label,
        period: range.period,
      },
      hero: {
        revenueKloelInCents: home.kpis.revenueKloel.value,
        messages: Array.from(messagesByChannel.values()).reduce((sum, value) => sum + value, 0),
        leads: socialLeads,
        approvedOrders: home.kpis.approvedCount.value,
      },
      channels: Array.from(conversationsByChannel.entries())
        .map(([key, value]) => ({
          key,
          label: value.label,
          status: value.conversations > 0 ? 'Conectado' : 'Sem atividade',
          conversations: value.conversations,
          messages: value.messages,
        }))
        .sort((left, right) => right.conversations - left.conversations),
      topProducts,
      ai: {
        activeConversations: conversations.length,
        trackedProducts: topProducts.length,
        approvedOrders: home.kpis.approvedCount.value,
      },
      rankings: [
        {
          label: 'Top produtores por conversas',
          value: topWorkspaceByConversations?.count ?? 0,
          detail: topWorkspaceByConversations
            ? topWorkspaceByConversations.workspaceName
            : 'Sem conversas no período',
        },
        {
          label: 'Top produtos atendidos',
          value: topProducts.length,
          detail: topProducts[0]?.name ?? 'Sem produto com GMV observado',
        },
        {
          label: 'Revenue Kloel',
          value: home.kpis.revenueKloel.value,
          detail: 'Receita própria da plataforma',
        },
      ],
      feed: recentConversations.map((conversation) => ({
        id: conversation.id,
        title:
          conversation.contact.name ||
          conversation.contact.email ||
          conversation.contact.phone ||
          'Contato',
        body: conversation.messages[0]?.content ?? 'Sem mensagem recente',
        meta: `${conversation.workspace.name} · ${conversation.lastMessageAt.toLocaleString('pt-BR')}`,
      })),
    };
  }
}
