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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { forEachSequential } from '../common/async-sequence';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
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

  private getEmailProviderSnapshot() {
    const provider = process.env.RESEND_API_KEY
      ? 'resend'
      : process.env.SENDGRID_API_KEY
        ? 'sendgrid'
        : process.env.SMTP_HOST
          ? 'smtp'
          : 'log';

    return {
      provider,
      available: provider !== 'log',
      fromEmail: process.env.EMAIL_FROM || 'noreply@kloel.com',
      fromName: process.env.EMAIL_FROM_NAME || 'KLOEL',
    };
  }

  private async sendSingleEmail(recipientEmail: string, subject: string, html: string) {
    const providerConfig = this.getEmailProviderSnapshot();
    if (!providerConfig.available) {
      throw new BadRequestException('email_provider_not_configured');
    }

    const { EmailService } = await import('../auth/email.service');
    const emailService = new EmailService();
    const success = await emailService.sendEmail({
      to: recipientEmail,
      subject,
      html,
    });
    if (!success) {
      throw new BadRequestException('email_provider_rejected_request');
    }

    return { provider: providerConfig.provider };
  }

  private getWhatsAppSessionSnapshot(providerSettings: Record<string, unknown>) {
    const snapshot =
      providerSettings?.whatsappApiSession &&
      typeof providerSettings.whatsappApiSession === 'object'
        ? (providerSettings.whatsappApiSession as Record<string, unknown>)
        : {};
    const rawSnapshotStatus =
      typeof snapshot.rawStatus === 'string'
        ? snapshot.rawStatus
        : typeof snapshot.status === 'string'
          ? snapshot.status
          : '';
    const snapshotStatus = rawSnapshotStatus.trim().toLowerCase();
    const snapshotConnected = snapshotStatus === 'connected' || snapshotStatus === 'working';

    return {
      snapshot,
      snapshotStatus,
      snapshotConnected,
    };
  }

  private pickStringOr(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  private pickOptionalTrimmedString(value: unknown, fallbackValue?: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof fallbackValue === 'string' && fallbackValue.trim()) {
      return fallbackValue.trim();
    }
    return null;
  }

  private serializeWhatsAppSelectedProduct(product: Record<string, unknown>) {
    const id = this.pickStringOr(
      product.id ?? (typeof product.productId === 'string' ? product.productId : ''),
      '',
    );
    const name = this.pickStringOr(product.name, 'Produto');
    return {
      id,
      name,
      price: Number(product.price || 0) || 0,
      type: product.type === 'affiliate' ? 'affiliate' : 'own',
      affiliateComm: product.affiliateComm == null ? null : Number(product.affiliateComm || 0) || 0,
      imageUrl: this.pickOptionalTrimmedString(product.imageUrl, product.image),
      producer: this.pickOptionalTrimmedString(product.producer),
    };
  }

  private normalizeWhatsAppSelectedProducts(raw: unknown) {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => this.serializeWhatsAppSelectedProduct(item))
      .filter((product) => product.id);
  }

  private async getConnectionStatus(workspaceId: string) {
    const [workspace, metaConnection, providerType, whatsappStatus] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true, name: true },
      }),
      this.prisma.metaConnection.findUnique({
        where: { workspaceId },
        select: {
          status: true,
          pageId: true,
          pageName: true,
          instagramAccountId: true,
          instagramUsername: true,
          whatsappPhoneNumberId: true,
          whatsappBusinessId: true,
          adAccountId: true,
          tokenExpiresAt: true,
          updatedAt: true,
        },
      }),
      this.whatsappProviders.getProviderType(workspaceId).catch(() => 'meta-cloud' as const),
      this.whatsappProviders.getSessionStatus(workspaceId).catch(() => null),
    ]);

    const providerSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const emailSettings = ((providerSettings.email || {}) as Record<string, unknown>) || {
      enabled: false,
    };
    const emailProvider = this.getEmailProviderSnapshot();
    const safeWhatsApp = (whatsappStatus || {}) as Record<string, unknown>;
    const { snapshot, snapshotStatus, snapshotConnected } =
      this.getWhatsAppSessionSnapshot(providerSettings);
    const rawLiveStatus =
      typeof safeWhatsApp.status === 'string'
        ? safeWhatsApp.status
        : snapshotStatus || 'DISCONNECTED';
    const liveStatus = rawLiveStatus.trim().toLowerCase();
    const whatsappConnected = Boolean(safeWhatsApp.connected) || snapshotConnected;
    const whatsappStatusValue =
      providerType === 'whatsapp-api'
        ? whatsappConnected
          ? 'connected'
          : liveStatus === 'scan_qr_code' || liveStatus === 'starting' || liveStatus === 'opening'
            ? 'connecting'
            : liveStatus === 'failed'
              ? 'failed'
              : liveStatus || snapshotStatus || 'disconnected'
        : whatsappConnected
          ? 'connected'
          : liveStatus === 'connection_incomplete'
            ? 'connection_incomplete'
            : liveStatus || snapshotStatus || 'disconnected';

    return {
      meta: {
        connected: Boolean(metaConnection),
        tokenExpired: Boolean(
          metaConnection?.tokenExpiresAt &&
          new Date(metaConnection.tokenExpiresAt).getTime() < Date.now(),
        ),
        pageId: metaConnection?.pageId || null,
        pageName: metaConnection?.pageName || null,
        instagramUsername: metaConnection?.instagramUsername || null,
        updatedAt: metaConnection?.updatedAt || null,
      },
      channels: {
        whatsapp: {
          provider: providerType,
          connected: whatsappConnected,
          status: whatsappStatusValue,
          authUrl:
            providerType === 'meta-cloud'
              ? safeWhatsApp.authUrl ||
                snapshot.authUrl ||
                this.metaWhatsApp.buildEmbeddedSignupUrl(workspaceId, {
                  channel: 'whatsapp',
                  returnTo: '/marketing/whatsapp',
                })
              : null,
          phoneNumberId:
            providerType === 'meta-cloud'
              ? safeWhatsApp.phoneNumberId || snapshot.phoneNumberId || null
              : null,
          whatsappBusinessId:
            providerType === 'meta-cloud'
              ? safeWhatsApp.whatsappBusinessId || snapshot.whatsappBusinessId || null
              : null,
          phoneNumber:
            safeWhatsApp.phoneNumber || safeWhatsApp.phone || snapshot.phoneNumber || null,
          pushName: safeWhatsApp.pushName || snapshot.pushName || null,
          degradedReason:
            whatsappConnected || whatsappStatusValue === 'connecting'
              ? null
              : safeWhatsApp.degradedReason ||
                (typeof safeWhatsApp.message === 'string' ? safeWhatsApp.message : null) ||
                snapshot.disconnectReason ||
                null,
        },
        instagram: {
          connected: Boolean(metaConnection?.instagramAccountId),
          status: metaConnection?.instagramAccountId ? 'connected' : 'disconnected',
          authUrl: this.metaWhatsApp.buildEmbeddedSignupUrl(workspaceId, {
            channel: 'instagram',
            returnTo: '/marketing/instagram',
          }),
          instagramAccountId: metaConnection?.instagramAccountId || null,
          username: metaConnection?.instagramUsername || null,
          pageName: metaConnection?.pageName || null,
        },
        facebook: {
          connected: Boolean(metaConnection?.pageId),
          status: metaConnection?.pageId ? 'connected' : 'disconnected',
          authUrl: this.metaWhatsApp.buildEmbeddedSignupUrl(workspaceId, {
            channel: 'facebook',
            returnTo: '/marketing/facebook',
          }),
          pageId: metaConnection?.pageId || null,
          pageName: metaConnection?.pageName || null,
        },
        email: {
          connected: Boolean(emailProvider.available && emailSettings.enabled),
          status: emailProvider.available
            ? emailSettings.enabled
              ? 'connected'
              : 'disconnected'
            : 'unavailable',
          enabled: Boolean(emailSettings.enabled),
          provider: emailProvider.provider,
          providerAvailable: emailProvider.available,
          fromEmail: emailProvider.fromEmail,
          fromName: emailProvider.fromName,
          workspaceName: workspace?.name || null,
        },
      },
    };
  }

  /** Get connect status. */
  @Get('connect/status')
  async getConnectStatus(@Request() req: { user: { workspaceId: string; email?: string } }) {
    const workspaceId = req.user.workspaceId;
    return this.getConnectionStatus(workspaceId);
  }

  /** Get whats app summary. */
  @Get('whatsapp/summary')
  async getWhatsAppSummary(@Request() req: { user: { workspaceId: string; email?: string } }) {
    const workspaceId = req.user.workspaceId;
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const providerSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const setup =
      providerSettings?.whatsappSetup && typeof providerSettings.whatsappSetup === 'object'
        ? (providerSettings.whatsappSetup as Record<string, unknown>)
        : {};
    const selectedProducts = this.normalizeWhatsAppSelectedProducts(setup.selectedProducts);
    const productNames = [
      ...new Set(selectedProducts.map((product) => product.name).filter(Boolean)),
    ];

    const salesByProduct =
      productNames.length > 0
        ? await this.prisma.kloelSale.groupBy({
            by: ['productName'],
            where: {
              workspaceId,
              status: 'paid',
              productName: { in: productNames },
            },
            _count: { id: true },
            _sum: { amount: true },
          })
        : [];
    const salesMap = new Map(
      salesByProduct.map((item) => [
        String(item.productName || ''),
        {
          salesCount: item._count.id || 0,
          revenue: item._sum.amount || 0,
        },
      ]),
    );

    return {
      configured: selectedProducts.length > 0,
      sessionName: typeof setup.sessionName === 'string' ? setup.sessionName : workspaceId,
      configuredAt: setup.configuredAt || null,
      activatedAt: setup.activatedAt || null,
      arsenalCount: Array.isArray(setup.arsenal) ? setup.arsenal.length : 0,
      tone: (() => {
        const cfg =
          setup?.config && typeof setup.config === 'object'
            ? (setup.config as Record<string, unknown>)
            : null;
        return cfg && typeof cfg.tone === 'string' ? cfg.tone : null;
      })(),
      maxDiscount: (() => {
        const cfg =
          setup?.config && typeof setup.config === 'object'
            ? (setup.config as Record<string, unknown>)
            : null;
        return cfg ? Number(cfg.maxDiscount || 0) || 0 : 0;
      })(),
      followUpEnabled: (() => {
        const cfg =
          setup?.config && typeof setup.config === 'object'
            ? (setup.config as Record<string, unknown>)
            : null;
        return cfg ? Boolean(cfg.followUpEnabled) : false;
      })(),
      selectedProducts: selectedProducts.map((product) => {
        const performance = salesMap.get(product.name) || { salesCount: 0, revenue: 0 };
        return {
          ...product,
          salesCount: performance.salesCount,
          revenue: performance.revenue,
        };
      }),
    };
  }

  /** Connect email. */
  @Post('connect/email')
  async connectEmail(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: { enabled?: boolean } = {},
  ) {
    const workspaceId = req.user.workspaceId;
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const nextEnabled = body.enabled !== false;

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...currentSettings,
          email: {
            ...((currentSettings.email || {}) as Record<string, unknown>),
            enabled: nextEnabled,
          },
        },
      },
    });

    return this.getConnectionStatus(workspaceId);
  }

  /** Send email test. */
  @Post('connect/email/test')
  async sendEmailTest(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: { toEmail?: string } = {},
  ) {
    const workspaceId = req.user.workspaceId;
    const toEmail = String(body.toEmail || req.user?.email || '').trim();
    if (!toEmail) {
      throw new BadRequestException('email_test_recipient_required');
    }

    const result = await this.sendSingleEmail(
      toEmail,
      'KLOEL - conexao de email validada',
      '<h1>Conexao validada</h1><p>Seu canal de email esta ativo dentro do Marketing do KLOEL.</p>',
    );

    return {
      success: true,
      workspaceId,
      toEmail,
      provider: result.provider,
    };
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
