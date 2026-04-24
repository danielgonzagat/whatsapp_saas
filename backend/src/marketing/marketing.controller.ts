import { Body, Controller, Get, Logger, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { forEachSequential } from '../common/async-sequence';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { getTraceHeaders } from '../common/trace-headers';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';

const NAME_RE = /\{\{name\}\}/g;

const CHANNELS = ['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'EMAIL', 'TIKTOK'];

/**
 * Marketing Command Center Controller
 *
 * Provides aggregated marketing stats, channel status,
 * live message feed, and AI brain status.
 * Channel connect/email/WhatsApp summary endpoints live in
 * MarketingConnectController.
 */
@Controller('marketing')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MarketingController {
  private readonly logger = new Logger(MarketingController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaWhatsApp: MetaWhatsAppService,
    private readonly whatsappProviders: WhatsAppProviderRegistry,
  ) {}

  /**
   * Aggregate stats: totalMessages, totalLeads, totalSales, totalRevenue
   */
  @Get('stats')
  async getStats(@Request() req: { user: { workspaceId: string; email?: string } }) {
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
        this.prisma.kloelSale.count({
          where: { workspaceId, status: 'paid' },
        }),
        this.prisma.kloelSale.aggregate({
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
  async getChannels(@Request() req: { user: { workspaceId: string; email?: string } }) {
    const workspaceId = req.user.workspaceId;

    // Batch: count conversations (leads) per channel
    const convGroups = await this.prisma.conversation.groupBy({
      by: ['channel'],
      where: { workspaceId, channel: { in: CHANNELS } },
      _count: { id: true },
    });
    const leadsByChannel = new Map(convGroups.map((g) => [g.channel, g._count.id]));

    // Batch: count messages per channel via conversation join
    const msgGroups = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        workspaceId,
        conversation: { channel: { in: CHANNELS } },
      },
      _count: { id: true },
    });

    // Resolve conversationId → channel for message counts
    const convIds = msgGroups.map((g) => g.conversationId).filter(Boolean);
    const convs =
      convIds.length > 0
        ? await this.prisma.conversation.findMany({
            where: { workspaceId, id: { in: convIds } },
            select: { id: true, channel: true },
          })
        : [];
    const channelByConvId = new Map(convs.map((c) => [c.id, c.channel]));

    const msgsByChannel = new Map<string, number>();
    for (const g of msgGroups) {
      const ch = channelByConvId.get(g.conversationId);
      if (ch) {
        msgsByChannel.set(ch, (msgsByChannel.get(ch) || 0) + g._count.id);
      }
    }

    const channelResults: Record<
      string,
      { status: string; messages: number; leads: number; sales: number }
    > = {};

    for (const channel of CHANNELS) {
      const messages = msgsByChannel.get(channel) || 0;
      channelResults[channel] = {
        status: messages > 0 ? 'live' : 'setup',
        messages,
        leads: leadsByChannel.get(channel) || 0,
        sales: 0,
      };
    }

    return channelResults;
  }

  /**
   * Live feed — last 30 messages ordered by createdAt desc
   */
  @Get('live-feed')
  async getLiveFeed(@Request() req: { user: { workspaceId: string; email?: string } }) {
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
    @Request() req: { user: { workspaceId: string; email?: string } },
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
      outboundMessages > 0 ? Math.round((inboundMessages / outboundMessages) * 100) : 0;

    // conversionRate: percentage of conversations that reached CONVERTED status
    const conversionRate =
      totalConversations > 0 ? Math.round((convertedConversations / totalConversations) * 100) : 0;

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
  async getAiBrain(@Request() req: { user: { workspaceId: string; email?: string } }) {
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
      take: 50,
      where: {
        workspaceId,
        direction: 'INBOUND',
        createdAt: { gte: periodStart },
      },
      select: { conversationId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    let totalResponseMs = 0;
    let responseCount = 0;
    if (recentInbound.length > 0) {
      const convIds = [...new Set(recentInbound.map((m) => m.conversationId).filter(Boolean))];
      const minCreatedAt = recentInbound.reduce(
        (min, m) => (m.createdAt < min ? m.createdAt : min),
        recentInbound[0].createdAt,
      );
      const outboundReplies = await this.prisma.message.findMany({
        take: 500,
        where: {
          workspaceId,
          conversationId: { in: convIds },
          direction: 'OUTBOUND',
          createdAt: { gt: minCreatedAt },
        },
        select: { conversationId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      // Build map of first reply per conversation
      const firstReplyByConv = new Map<string, Date>();
      for (const r of outboundReplies) {
        if (!firstReplyByConv.has(r.conversationId)) {
          firstReplyByConv.set(r.conversationId, r.createdAt);
        }
      }
      for (const msg of recentInbound) {
        const reply = firstReplyByConv.get(msg.conversationId);
        if (reply && reply > msg.createdAt) {
          totalResponseMs += reply.getTime() - msg.createdAt.getTime();
          responseCount++;
        }
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
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body()
    body: {
      subject: string;
      html: string;
      recipients: { email: string; name?: string }[];
      campaignName?: string;
    },
  ) {
    void req.user?.workspaceId;
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

    await forEachSequential(body.recipients, async (recipient) => {
      // unsubscribe: link included in email footer
      const unsubscribeUrl = `${process.env.FRONTEND_URL || 'https://kloel.com'}/unsubscribe?email=${encodeURIComponent(recipient.email)}`;
      const personalizedBody = body.html.replace(NAME_RE, recipient.name || 'Cliente');
      const htmlWithUnsub = `${personalizedBody}<br/><hr style="margin:24px 0;border:none;border-top:1px solid #ddd"/><p style="font-size:11px;color:#888;text-align:center"><a href="${unsubscribeUrl}" style="color:#888">Cancelar inscricao</a></p>`;
      try {
        if (provider === 'resend') {
          // Not SSRF: hardcoded Resend API endpoint
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              ...getTraceHeaders(),
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromEmail,
              to: recipient.email,
              subject: body.subject,
              html: htmlWithUnsub,
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (res.ok) {
            sent++;
          } else {
            failed++;
          }
        } else if (provider === 'sendgrid') {
          // Not SSRF: hardcoded SendGrid API endpoint
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              ...getTraceHeaders(),
              Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: recipient.email }] }],
              from: { email: fromEmail },
              subject: body.subject,
              content: [{ type: 'text/html', value: htmlWithUnsub }],
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (res.ok || res.status === 202) {
            sent++;
          } else {
            failed++;
          }
        } else {
          this.logger.log(`[DEV] Would send to ${recipient.email}: ${body.subject}`);
          sent++;
        }
        // Rate limit: 100ms between sends
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        failed++;
      }
    });

    return { sent, failed, total: body.recipients.length, provider };
  }
}
