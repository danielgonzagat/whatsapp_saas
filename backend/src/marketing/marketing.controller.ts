import {
  Controller,
  Get,
  Param,
  Request,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PrismaService } from '../prisma/prisma.service';

const CHANNELS = ['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'EMAIL', 'TIKTOK'];

/**
 * Marketing Command Center Controller
 *
 * Provides aggregated marketing stats, channel status,
 * live message feed, and AI brain status.
 */
@Controller('marketing')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MarketingController {
  private readonly logger = new Logger(MarketingController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate stats: totalMessages, totalLeads, totalSales, totalRevenue
   */
  @Get('stats')
  async getStats(@Request() req: any) {
    const workspaceId = req.user.workspaceId;

    const [totalMessages, totalLeads] = await Promise.all([
      this.prisma.message.count({ where: { workspaceId } }),
      this.prisma.contact.count({ where: { workspaceId } }),
    ]);

    // Attempt to get sales/revenue from orders if table exists, otherwise 0
    let totalSales = 0;
    let totalRevenue = 0;
    try {
      const products = await this.prisma.product.findMany({
        where: { workspaceId },
        select: { price: true },
      });
      // Use product count as a proxy for sales if no orders table
      totalSales = products.length;
      totalRevenue = products.reduce((sum, p) => sum + (p.price || 0), 0);
    } catch {
      // no orders/sales table — keep defaults
    }

    return { totalMessages, totalLeads, totalSales, totalRevenue };
  }

  /**
   * Channel status — for each channel, count messages and derive status
   */
  @Get('channels')
  async getChannels(@Request() req: any) {
    const workspaceId = req.user.workspaceId;

    const channelResults: Record<
      string,
      { status: string; messages: number; leads: number; sales: number }
    > = {};

    await Promise.all(
      CHANNELS.map(async (channel) => {
        const msgCount = await this.prisma.message.count({
          where: {
            workspaceId,
            conversation: { channel },
          },
        });

        const leadCount = await this.prisma.conversation.count({
          where: { workspaceId, channel },
        });

        channelResults[channel] = {
          status: msgCount > 0 ? 'live' : 'setup',
          messages: msgCount,
          leads: leadCount,
          sales: 0,
        };
      }),
    );

    return channelResults;
  }

  /**
   * Live feed — last 30 messages ordered by createdAt desc
   */
  @Get('live-feed')
  async getLiveFeed(@Request() req: any) {
    const workspaceId = req.user.workspaceId;

    const messages = await this.prisma.message.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        contact: { select: { name: true, phone: true } },
        conversation: { select: { channel: true } },
      },
    });

    return {
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        direction: m.direction,
        type: m.type,
        channel: m.conversation?.channel || 'WHATSAPP',
        contactName: m.contact?.name || m.contact?.phone || 'Unknown',
        createdAt: m.createdAt,
        status: m.status,
      })),
    };
  }

  /**
   * Stats for a specific channel
   */
  @Get('channel/:channel/stats')
  async getChannelStats(
    @Request() req: any,
    @Param('channel') channel: string,
  ) {
    const workspaceId = req.user.workspaceId;
    const channelUpper = channel.toUpperCase();

    const [totalMessages, totalConversations, openConversations, outboundMessages, inboundMessages, convertedConversations] =
      await Promise.all([
        this.prisma.message.count({
          where: { workspaceId, conversation: { channel: channelUpper } },
        }),
        this.prisma.conversation.count({
          where: { workspaceId, channel: channelUpper },
        }),
        this.prisma.conversation.count({
          where: { workspaceId, channel: channelUpper, status: 'OPEN' },
        }),
        this.prisma.message.count({
          where: { workspaceId, direction: 'OUTBOUND', conversation: { channel: channelUpper } },
        }),
        this.prisma.message.count({
          where: { workspaceId, direction: 'INBOUND', conversation: { channel: channelUpper } },
        }),
        this.prisma.conversation.count({
          where: { workspaceId, channel: channelUpper, status: 'CONVERTED' },
        }),
      ]);

    // responseRate: percentage of outbound messages that got an inbound reply
    const responseRate = outboundMessages > 0
      ? Math.round((inboundMessages / outboundMessages) * 100)
      : 0;

    // conversionRate: percentage of conversations that reached CONVERTED status
    const conversionRate = totalConversations > 0
      ? Math.round((convertedConversations / totalConversations) * 100)
      : 0;

    return {
      channel: channelUpper,
      status: totalMessages > 0 ? 'live' : 'setup',
      totalMessages,
      totalConversations,
      openConversations,
      responseRate,
      conversionRate,
    };
  }

  /**
   * AI Brain status — products loaded, active conversations, response time
   */
  @Get('ai-brain')
  async getAiBrain(@Request() req: any) {
    const workspaceId = req.user.workspaceId;
    const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

    const [productsLoaded, activeConversations, objectionsMapped] = await Promise.all([
      this.prisma.product.count({ where: { workspaceId, active: true } }),
      this.prisma.conversation.count({
        where: { workspaceId, status: 'OPEN' },
      }),
      this.prisma.kloelMemory.count({
        where: { workspaceId, category: 'objections' },
      }),
    ]);

    // Calculate real average response time from recent messages
    const recentInbound = await this.prisma.message.findMany({
      where: { workspaceId, direction: 'INBOUND', createdAt: { gte: periodStart } },
      select: { conversationId: true, createdAt: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    let totalResponseMs = 0;
    let responseCount = 0;
    for (const msg of recentInbound) {
      const reply = await this.prisma.message.findFirst({
        where: {
          conversationId: msg.conversationId,
          direction: 'OUTBOUND',
          createdAt: { gt: msg.createdAt },
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      if (reply) {
        totalResponseMs += reply.createdAt.getTime() - msg.createdAt.getTime();
        responseCount++;
      }
    }
    const avgMs = responseCount > 0 ? totalResponseMs / responseCount : null;
    const avgResponseTime = avgMs
      ? (avgMs < 60000 ? `${(avgMs / 1000).toFixed(1)}s` : `${Math.round(avgMs / 60000)}m`)
      : '--';

    return {
      productsLoaded,
      activeConversations,
      objectionsMapped,
      avgResponseTime,
      status: productsLoaded > 0 ? 'active' : 'setup',
    };
  }
}
