import {
  Controller,
  Get,
  Post,
  Body,
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

    // Vendas reais via KloelSale (status = 'paid')
    let totalSales = 0;
    let totalRevenue = 0;
    try {
      const [salesCount, salesSum] = await Promise.all([
        (this.prisma as any).kloelSale.count({
          where: { workspaceId, status: 'paid' },
        }),
        (this.prisma as any).kloelSale.aggregate({
          where: { workspaceId, status: 'paid' },
          _sum: { amount: true },
        }),
      ]);
      totalSales = salesCount || 0;
      totalRevenue = salesSum?._sum?.amount || 0;
    } catch {
      // KloelSale table unavailable — keep defaults (0, 0)
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

    const [
      totalMessages,
      totalConversations,
      openConversations,
      outboundMessages,
      inboundMessages,
      convertedConversations,
    ] = await Promise.all([
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
        where: {
          workspaceId,
          direction: 'OUTBOUND',
          conversation: { channel: channelUpper },
        },
      }),
      this.prisma.message.count({
        where: {
          workspaceId,
          direction: 'INBOUND',
          conversation: { channel: channelUpper },
        },
      }),
      this.prisma.conversation.count({
        where: { workspaceId, channel: channelUpper, status: 'CONVERTED' },
      }),
    ]);

    // responseRate: percentage of outbound messages that got an inbound reply
    const responseRate =
      outboundMessages > 0
        ? Math.round((inboundMessages / outboundMessages) * 100)
        : 0;

    // conversionRate: percentage of conversations that reached CONVERTED status
    const conversionRate =
      totalConversations > 0
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

    const [productsLoaded, activeConversations, objectionsMapped] =
      await Promise.all([
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
      where: {
        workspaceId,
        direction: 'INBOUND',
        createdAt: { gte: periodStart },
      },
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
      ? avgMs < 60000
        ? `${(avgMs / 1000).toFixed(1)}s`
        : `${Math.round(avgMs / 60000)}m`
      : '--';

    return {
      productsLoaded,
      activeConversations,
      objectionsMapped,
      avgResponseTime,
      status: productsLoaded > 0 ? 'active' : 'setup',
    };
  }

  /**
   * Send email campaign to a list of recipients
   */
  @Post('email/send')
  async sendEmailCampaign(
    @Request() req: any,
    @Body()
    body: {
      subject: string;
      html: string;
      recipients: { email: string; name?: string }[];
      campaignName?: string;
    },
  ) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    // Lazy import to avoid circular dependency
    const { EmailCampaignService } =
      await import('../kloel/email-campaign.service');
    // Since this controller doesn't inject EmailCampaignService, we use a simpler approach
    // Just validate and forward - the actual sending uses the same Resend/SendGrid infra
    const fromEmail = process.env.EMAIL_FROM || 'noreply@kloel.com';
    const provider = process.env.RESEND_API_KEY
      ? 'resend'
      : process.env.SENDGRID_API_KEY
        ? 'sendgrid'
        : 'log';

    if (!body.subject || !body.html || !body.recipients?.length) {
      return { error: 'Missing required fields: subject, html, recipients' };
    }

    if (body.recipients.length > 500) {
      return { error: 'Maximum 500 recipients per campaign' };
    }

    this.logger.log(
      `Email campaign "${body.campaignName || body.subject}" to ${body.recipients.length} recipients via ${provider}`,
    );

    let sent = 0;
    let failed = 0;

    for (const recipient of body.recipients) {
      try {
        if (provider === 'resend') {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromEmail,
              to: recipient.email,
              subject: body.subject,
              html: body.html.replace(
                /\{\{name\}\}/g,
                recipient.name || 'Cliente',
              ),
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (res.ok) sent++;
          else failed++;
        } else if (provider === 'sendgrid') {
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: recipient.email }] }],
              from: { email: fromEmail },
              subject: body.subject,
              content: [{ type: 'text/html', value: body.html }],
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (res.ok || res.status === 202) sent++;
          else failed++;
        } else {
          this.logger.log(
            `[DEV] Would send to ${recipient.email}: ${body.subject}`,
          );
          sent++;
        }
        // Rate limit: 100ms between sends
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        failed++;
      }
    }

    return { sent, failed, total: body.recipients.length, provider };
  }
}
