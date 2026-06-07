import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Request,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { EmailCampaignService } from '../kloel/email-campaign.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildChannelMetrics,
  buildSendBodyFromApproval,
  computeAverageFirstReplyMs,
  computeResponseStats,
  distinctConversationIds,
  formatAvgResponseTime,
  mapLiveFeedMessage,
  MARKETING_CHANNELS,
  minInboundCreatedAt,
  normalizeApprovalRequestId,
  validateDirectEmailSendBody,
  type DirectEmailSendBody,
} from './marketing.controller.helpers';
import { MindMemoryItemService } from '../kloel/mind/aliases/mind-memory-item.service';

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
@RouteClass('read')
export class MarketingController {
  private readonly logger = new Logger(MarketingController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mindMemory?: MindMemoryItemService,
  ) {}

  /** Canonical Brain → Mind memory delegate (raw-Prisma fallback). */
  private get mindMemoryItems(): PrismaService['kloelMemory'] {
    return this.mindMemory?.items ?? this.prisma.kloelMemory;
  }

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
  @InternalEndpoint('marketing channels listing')
  @Get('channels')
  async getChannels(@Request() req: { user: { workspaceId: string; email?: string } }) {
    const workspaceId = req.user.workspaceId;

    // Batch: count conversations (leads) per channel
    const conversationGroups = await this.prisma.conversation.groupBy({
      by: ['channel'],
      where: { workspaceId, channel: { in: [...MARKETING_CHANNELS] } },
      _count: { id: true },
    });

    // Batch: count messages per channel via conversation join
    const messageGroups = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        workspaceId,
        conversation: { channel: { in: [...MARKETING_CHANNELS] } },
      },
      _count: { id: true },
    });

    // Resolve conversationId → channel for message counts
    const convIds = messageGroups
      .map((g) => g.conversationId)
      .filter((v): v is string => Boolean(v));
    const conversationRows =
      convIds.length > 0
        ? await this.prisma.conversation.findMany({
            where: { workspaceId, id: { in: convIds } },
            select: { id: true, channel: true },
          })
        : [];

    return buildChannelMetrics({
      conversationGroups,
      messageGroups,
      conversationRows,
    });
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
      messages: messages.map((m) => mapLiveFeedMessage(m)),
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

    const { responseRate, conversionRate } = computeResponseStats({
      outboundMessages,
      inboundMessages,
      totalConversations,
      convertedConversations,
    });

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
      this.mindMemoryItems.count({
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

    let avgMs: number | null = null;
    const minCreatedAt = minInboundCreatedAt(recentInbound);
    if (minCreatedAt !== null) {
      const convIds = distinctConversationIds(recentInbound);
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
      avgMs = computeAverageFirstReplyMs({
        inbound: recentInbound,
        outbound: outboundReplies,
      });
    }
    const avgResponseTime = formatAvgResponseTime(avgMs);

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
  @InternalEndpoint('marketing email send')
  @Post('email/send')
  async sendEmailCampaign(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: DirectEmailSendBody,
  ) {
    const workspaceId = req.user?.workspaceId;
    const approvalRequestId = normalizeApprovalRequestId(body.approvalRequestId);
    let sendBody: DirectEmailSendBody = body;

    if (approvalRequestId) {
      const approval = await this.prisma.approvalRequest.findFirst({
        where: {
          id: approvalRequestId,
          workspaceId,
          kind: 'marketing_email:direct_send',
          entityType: 'MarketingEmailDirectSend',
          state: 'APPROVED',
        },
        select: { id: true, payload: true },
      });
      if (!approval || !approval.payload || typeof approval.payload !== 'object') {
        throw new BadRequestException('Approved direct email send request not found');
      }
      sendBody = buildSendBodyFromApproval(approval.payload as Record<string, unknown>);
    }

    const missing = validateDirectEmailSendBody(sendBody);
    if (missing.length > 0) {
      throw new BadRequestException('Missing required fields: subject, html, recipients');
    }
    const subject = sendBody.subject;
    const htmlTemplate = sendBody.html;
    const recipients = sendBody.recipients;

    if (!approvalRequestId) {
      const payload = {
        subject,
        html: htmlTemplate,
        recipients: recipients.map((recipient) => ({
          email: recipient.email,
          name: recipient.name ?? null,
        })),
        campaignName: sendBody.campaignName || null,
        requestedByEmail: req.user.email || null,
        risk: 'high',
        requiresApproval: true,
      };
      const approval = await this.prisma.approvalRequest.create({
        data: {
          workspaceId,
          kind: 'marketing_email:direct_send',
          scope: 'workspace',
          entityType: 'MarketingEmailDirectSend',
          entityId: `direct-email:${Date.now()}`,
          state: 'OPEN',
          title: `Aprovar envio direto de email: ${sendBody.campaignName || subject}`,
          prompt: `Envio direto de email para ${recipients.length} destinatario(s). Revise assunto, HTML e destinatarios antes de autorizar.`,
          payload,
        },
        select: { id: true, state: true, title: true, createdAt: true },
      });
      return {
        approvalRequired: true,
        approvalRequestId: approval.id,
        approvalState: approval.state,
        approval,
        message: 'Envio direto de email enviado para aprovacao humana antes do disparo.',
      };
    }

    const emailCampaign = new EmailCampaignService();
    const provider = emailCampaign.resolveDelivery().provider;

    this.logger.log(
      `Email campaign "${sendBody.campaignName || subject}" to ${recipients.length} recipients via ${provider}`,
    );

    const campaignResult = await emailCampaign.sendCampaign({
      workspaceId,
      subject,
      html: htmlTemplate,
      recipients,
      ...(sendBody.campaignName ? { campaignName: sendBody.campaignName } : {}),
    });
    const sent = campaignResult.sent;
    const failed = campaignResult.failed;

    await this.prisma.approvalRequest.updateMany({
      where: { id: approvalRequestId, workspaceId, state: 'APPROVED' },
      data: {
        state: 'COMPLETED',
        respondedAt: new Date(),
        response: {
          action: 'approved_direct_email_send_executed',
          executedAt: new Date().toISOString(),
          sent,
          failed,
          total: recipients.length,
          provider,
        },
      },
    });

    return { sent, failed, total: recipients.length, provider, approvalExecuted: true };
  }
}
