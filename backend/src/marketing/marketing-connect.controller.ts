import { RouteClass } from '../common/throttler/route-class.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { buildUnsubscribeFooterHtml } from '../common/utils/unsubscribe-footer.util';
import {
  isWorkspaceDeliveryReady,
  readWorkspaceEmailDelivery,
} from '../kloel/email-workspace-delivery';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { EmailCampaignService } from '../kloel/email-campaign.service';
import { TikTokMarketingService } from './tiktok-marketing.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { asProviderSettings, type ProviderSettings } from '../whatsapp/provider-settings.types';
import {
  EMAIL_VALIDATION_HTML_BODY,
  extractSetupConfigField,
  normalizeWhatsAppSelectedProducts,
} from './marketing-connect.helpers';
import { MailboxGmailOAuthService } from './mailbox-gmail-oauth.service';
import { MailboxImapSmtpService } from './mailbox-imap-smtp.service';
import { MailboxMicrosoftOAuthService } from './mailbox-microsoft-oauth.service';

type EmailSubSettings = Record<string, unknown> & { enabled?: boolean };
type WhatsAppStatusValue = Record<string, unknown>;
type MarketingChannelKey = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok' | 'email';

const MARKETING_CHANNEL_KEYS = new Set<MarketingChannelKey>([
  'whatsapp',
  'instagram',
  'facebook',
  'tiktok',
  'email',
]);

interface MarketingChannelSetupPayload {
  channel?: string;
  currentStep?: unknown;
  selectedProductIds?: unknown;
  arsenal?: unknown;
  config?: unknown;
}

interface GmailOAuthCompletePayload {
  code?: string;
  state?: string;
}

interface GmailSyncPayload {
  limit?: unknown;
}

interface GmailSendTestPayload {
  toEmail?: string;
  subject?: string;
  html?: string;
}

interface ImapSmtpConnectPayload {
  email?: unknown;
  imapHost?: unknown;
  imapPort?: unknown;
  imapSecure?: unknown;
  imapUsername?: unknown;
  imapPassword?: unknown;
  smtpHost?: unknown;
  smtpPort?: unknown;
  smtpSecure?: unknown;
  smtpUsername?: unknown;
  smtpPassword?: unknown;
}

interface ConnectEmailBody {
  enabled?: boolean;
}

function readOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function assertMarketingChannel(value: unknown): MarketingChannelKey {
  if (typeof value === 'string' && MARKETING_CHANNEL_KEYS.has(value as MarketingChannelKey)) {
    return value as MarketingChannelKey;
  }
  throw new BadRequestException('invalid_marketing_channel');
}

function readMarketingChannelSetup(
  providerSettings: ProviderSettings,
  channel: MarketingChannelKey,
): Record<string, unknown> {
  const allSetups =
    providerSettings.marketingChannelSetup &&
    typeof providerSettings.marketingChannelSetup === 'object' &&
    !Array.isArray(providerSettings.marketingChannelSetup)
      ? (providerSettings.marketingChannelSetup as Record<string, unknown>)
      : {};
  const setup = allSetups[channel];
  return setup && typeof setup === 'object' && !Array.isArray(setup)
    ? (setup as Record<string, unknown>)
    : {};
}

function normalizeStep(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(3, Math.max(0, parsed));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 100);
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeArsenal(value: unknown): string[] {
  return normalizeStringArray(value).slice(0, 50);
}

interface EmailProviderSnapshot {
  provider: string;
  available: boolean;
  fromEmail: string;
  fromName: string;
  workspaceConfigured: boolean;
}

/**
 * Marketing Connect Controller
 *
 * Manages channel connection status (WhatsApp, Instagram, Facebook, Email),
 * WhatsApp summary, and email connectivity for the Marketing Command Center.
 */
@Controller('marketing')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class MarketingConnectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaWhatsApp: MetaWhatsAppService,
    private readonly whatsappProviders: WhatsAppProviderRegistry,
    private readonly gmailMailbox: MailboxGmailOAuthService,
    private readonly microsoftMailbox: MailboxMicrosoftOAuthService,
    private readonly imapSmtpMailbox: MailboxImapSmtpService,
    private readonly emailCampaign: EmailCampaignService,
    private readonly tiktokMarketing: TikTokMarketingService,
  ) {}

  private getGlobalEmailProviderSnapshot(): EmailProviderSnapshot {
    const provider = process.env.RESEND_API_KEY
      ? 'resend'
      : process.env.SENDGRID_API_KEY
        ? 'sendgrid'
        : process.env.EMAIL_OUTBOUND_SMTP_HOST || process.env.SMTP_HOST
          ? 'smtp'
          : 'log';

    return {
      provider,
      available: provider !== 'log',
      fromEmail: process.env.EMAIL_FROM || 'noreply@kloel.com',
      fromName: process.env.EMAIL_FROM_NAME || 'KLOEL',
      workspaceConfigured: false,
    };
  }

  private async getEmailProviderSnapshot(workspaceId: string): Promise<EmailProviderSnapshot> {
    const config = await this.prisma.channelConfig.findUnique({
      where: { workspaceId_channel: { workspaceId, channel: 'email' } },
      select: { transferCriteria: true },
    });
    const delivery = readWorkspaceEmailDelivery(config?.transferCriteria);
    if (isWorkspaceDeliveryReady(delivery)) {
      return {
        provider: delivery?.provider ?? 'email',
        available: true,
        fromEmail: delivery?.fromEmail || process.env.EMAIL_FROM || 'noreply@kloel.com',
        fromName: delivery?.fromName || process.env.EMAIL_FROM_NAME || 'KLOEL',
        workspaceConfigured: true,
      };
    }
    return this.getGlobalEmailProviderSnapshot();
  }

  private async sendSingleEmail(
    workspaceId: string,
    recipientEmail: string,
    subject: string,
    html: string,
  ) {
    const providerConfig = await this.getEmailProviderSnapshot(workspaceId);
    if (!providerConfig.available) {
      throw new BadRequestException('email_provider_not_configured');
    }

    const safeHtml = html + buildUnsubscribeFooterHtml({ email: recipientEmail });
    const config = await this.prisma.channelConfig.findUnique({
      where: { workspaceId_channel: { workspaceId, channel: 'email' } },
      select: { transferCriteria: true },
    });
    const delivery = readWorkspaceEmailDelivery(config?.transferCriteria);
    const success = await this.emailCampaign.sendSingleEmail(
      recipientEmail,
      subject,
      safeHtml,
      isWorkspaceDeliveryReady(delivery) ? (delivery ?? undefined) : undefined,
    );
    if (!success) {
      throw new BadRequestException('email_provider_rejected_request');
    }

    return { provider: providerConfig.provider };
  }

  private getWhatsAppSessionSnapshot(providerSettings: ProviderSettings) {
    const snapshot = providerSettings.whatsappApiSession ?? {};
    const rawSnapshotStatus =
      typeof snapshot.rawStatus === 'string'
        ? snapshot.rawStatus
        : typeof snapshot.status === 'string'
          ? snapshot.status
          : '';
    const snapshotStatus = rawSnapshotStatus.trim().toLowerCase();
    const snapshotConnected = snapshotStatus === 'connected' || snapshotStatus === 'working';

    return { snapshot, snapshotStatus, snapshotConnected };
  }

  private async getConnectionStatus(workspaceId: string) {
    const [
      workspace,
      metaConnection,
      providerType,
      whatsappStatus,
      gmailMailbox,
      microsoftMailbox,
      imapSmtpMailbox,
    ] = await Promise.all([
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
      this.gmailMailbox.getPrimaryGmailStatus(workspaceId).catch(() => null),
      this.microsoftMailbox.getPrimaryMicrosoftStatus(workspaceId).catch(() => null),
      this.imapSmtpMailbox.getPrimaryImapSmtpStatus(workspaceId).catch(() => null),
    ]);
    const connectedMailbox = gmailMailbox || microsoftMailbox || imapSmtpMailbox;

    const providerSettings = asProviderSettings(workspace?.providerSettings);
    const emailSettings = (providerSettings.email ?? { enabled: false }) as EmailSubSettings;
    const emailProvider = await this.getEmailProviderSnapshot(workspaceId);
    const safeWhatsApp = whatsappStatus ?? ({} as WhatsAppStatusValue);
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
            readOptionalText(safeWhatsApp.phoneNumber) ||
            readOptionalText((safeWhatsApp as Record<string, unknown>).phone) ||
            readOptionalText(snapshot.phoneNumber),
          pushName: readOptionalText(safeWhatsApp.pushName) || readOptionalText(snapshot.pushName),
          degradedReason:
            whatsappConnected || whatsappStatusValue === 'connecting'
              ? null
              : readOptionalText(safeWhatsApp.degradedReason) ||
                readOptionalText((safeWhatsApp as Record<string, unknown>).message) ||
                readOptionalText(snapshot.disconnectReason),
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
        tiktok: await this.tiktokMarketing.getStatus(workspaceId),
        email: {
          connected: Boolean(
            connectedMailbox || (emailProvider.available && emailSettings.enabled),
          ),
          status: connectedMailbox
            ? 'connected'
            : emailProvider.available
              ? emailSettings.enabled
                ? 'connected'
                : 'disconnected'
              : 'unavailable',
          enabled: Boolean(emailSettings.enabled),
          provider: gmailMailbox
            ? 'gmail'
            : microsoftMailbox
              ? 'microsoft'
              : imapSmtpMailbox
                ? 'imap_smtp'
                : emailProvider.provider,
          providerAvailable: emailProvider.available,
          fromEmail:
            gmailMailbox?.email ||
            microsoftMailbox?.email ||
            imapSmtpMailbox?.email ||
            emailProvider.fromEmail,
          fromName: emailProvider.fromName,
          mailboxConnectionId: connectedMailbox?.id || null,
          mailboxProvider: connectedMailbox?.provider || null,
          mailboxStatus: connectedMailbox?.status || null,
          lastSyncAt: connectedMailbox?.lastSyncAt || null,
          lastErrorAt: connectedMailbox?.lastErrorAt || null,
          lastError: connectedMailbox?.lastError || null,
          workspaceName: workspace?.name || null,
        },
      },
    };
  }

  /** Get connect status. */
  @Get('connect/status')
  async getConnectStatus(@Request() req: { user: { workspaceId: string; email?: string } }) {
    return this.getConnectionStatus(req.user.workspaceId);
  }

  /** Get persistent four-step setup for one official marketing channel. */
  @Get('connect/channel-setup')
  async getChannelSetup(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Query('channel') rawChannel?: string,
  ) {
    const channel = assertMarketingChannel(rawChannel);
    const [workspace, setupRecord] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: req.user.workspaceId },
        select: { providerSettings: true },
      }),
      this.prisma.channelSetup.findUnique({
        where: { workspaceId_channel: { workspaceId: req.user.workspaceId, channel } },
        select: { completedAt: true, currentStep: true },
      }),
    ]);
    const providerSettings = asProviderSettings(workspace?.providerSettings);
    return {
      channel,
      setup: {
        currentStep: setupRecord?.currentStep ?? 0,
        selectedProductIds: [],
        arsenal: [],
        config: {},
        ...readMarketingChannelSetup(providerSettings, channel),
      },
      completedAt: setupRecord?.completedAt?.toISOString() ?? null,
    };
  }

  /** Persist four-step setup progress for one official marketing channel. */
  @Post('connect/channel-setup')
  async saveChannelSetup(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: MarketingChannelSetupPayload = {},
  ) {
    const channel = assertMarketingChannel(body.channel);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: req.user.workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = asProviderSettings(workspace?.providerSettings);
    const existingSetup = readMarketingChannelSetup(currentSettings, channel);
    const allSetups =
      currentSettings.marketingChannelSetup &&
      typeof currentSettings.marketingChannelSetup === 'object' &&
      !Array.isArray(currentSettings.marketingChannelSetup)
        ? (currentSettings.marketingChannelSetup as Record<string, unknown>)
        : {};
    const nextSetup = {
      ...existingSetup,
      currentStep: normalizeStep(body.currentStep, normalizeStep(existingSetup.currentStep)),
      selectedProductIds: normalizeStringArray(body.selectedProductIds),
      arsenal: normalizeArsenal(body.arsenal),
      config: {
        ...normalizeRecord(existingSetup.config),
        ...normalizeRecord(body.config),
      },
      updatedAt: new Date().toISOString(),
    };

    await Promise.all([
      this.prisma.workspace.update({
        where: { id: req.user.workspaceId },
        data: {
          providerSettings: {
            ...currentSettings,
            marketingChannelSetup: {
              ...allSetups,
              [channel]: nextSetup,
            },
          } as Prisma.InputJsonObject,
        },
      }),
      this.prisma.channelSetup.upsert({
        where: { workspaceId_channel: { workspaceId: req.user.workspaceId, channel } },
        create: { workspaceId: req.user.workspaceId, channel, currentStep: nextSetup.currentStep },
        update: { currentStep: nextSetup.currentStep },
      }),
    ]);

    return { channel, setup: nextSetup };
  }

  /** Complete the four-step channel setup, setting completedAt. */
  @Post('connect/channel-setup/complete')
  async completeChannelSetup(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: MarketingChannelSetupPayload = {},
  ) {
    const channel = assertMarketingChannel(body.channel);
    const [workspace, existingSetup] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: req.user.workspaceId },
        select: { providerSettings: true },
      }),
      this.prisma.channelSetup.findUnique({
        where: { workspaceId_channel: { workspaceId: req.user.workspaceId, channel } },
        select: { currentStep: true },
      }),
    ]);
    const providerSettings = asProviderSettings(workspace?.providerSettings);
    const jsonSetup = readMarketingChannelSetup(providerSettings, channel);
    const step = existingSetup?.currentStep ?? normalizeStep(jsonSetup.currentStep);
    if (step < 3) {
      throw new BadRequestException(
        `setup_not_complete: step ${step} of 3, complete all four steps before concluding`,
      );
    }
    if (!Array.isArray(jsonSetup.selectedProductIds) || jsonSetup.selectedProductIds.length === 0) {
      throw new BadRequestException('setup_not_complete: no products selected');
    }
    const hasConfig =
      jsonSetup.config &&
      typeof jsonSetup.config === 'object' &&
      !Array.isArray(jsonSetup.config) &&
      typeof (jsonSetup.config as Record<string, unknown>).tone === 'string';
    if (!hasConfig) {
      throw new BadRequestException('setup_not_complete: missing channel configuration');
    }

    const nextSetup = await this.prisma.channelSetup.upsert({
      where: { workspaceId_channel: { workspaceId: req.user.workspaceId, channel } },
      create: {
        workspaceId: req.user.workspaceId,
        channel,
        currentStep: 3,
        completedAt: new Date(),
      },
      update: { currentStep: 3, completedAt: new Date() },
    });

    return {
      channel,
      currentStep: nextSetup.currentStep,
      completedAt: nextSetup.completedAt?.toISOString() ?? null,
    };
  }

  /** Get whats app summary. */
  @Get('whatsapp/summary')
  async getWhatsAppSummary(@Request() req: { user: { workspaceId: string; email?: string } }) {
    const workspaceId = req.user.workspaceId;
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const providerSettings = asProviderSettings(workspace?.providerSettings);
    const setup = providerSettings.whatsappLifecycle ?? {};

    const selectedProducts = normalizeWhatsAppSelectedProducts(setup.selectedProducts);
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
      tone: extractSetupConfigField(setup, 'tone', null),
      maxDiscount: Number(extractSetupConfigField(setup, 'maxDiscount', 0)) || 0,
      followUpEnabled: Boolean(extractSetupConfigField(setup, 'followUpEnabled', false)),
      selectedProducts: selectedProducts.map((product) => {
        const performance = salesMap.get(product.name) || { salesCount: 0, revenue: 0 };
        return { ...product, salesCount: performance.salesCount, revenue: performance.revenue };
      }),
    };
  }

  /** Connect email. */
  @Post('connect/email')
  async connectEmail(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: ConnectEmailBody = {},
  ) {
    const workspaceId = req.user.workspaceId;
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = asProviderSettings(workspace?.providerSettings);
    const nextEnabled = body.enabled !== false;

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...currentSettings,
          email: {
            ...(typeof currentSettings.email === 'object' && currentSettings.email !== null
              ? currentSettings.email
              : {}),
            enabled: nextEnabled,
          },
        } as Prisma.InputJsonObject,
      },
    });

    return this.getConnectionStatus(workspaceId);
  }

  /** Start Gmail mailbox OAuth for the workspace owner. */
  @Get('connect/email/gmail/auth-url')
  getGmailAuthUrl(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Query('returnTo') returnTo?: string,
  ) {
    return this.gmailMailbox.buildAuthUrl(req.user.workspaceId, returnTo);
  }

  /** Complete Gmail mailbox OAuth and persist encrypted tokens. */
  @Post('connect/email/gmail/complete')
  async completeGmailOAuth(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: GmailOAuthCompletePayload = {},
  ) {
    return this.gmailMailbox.completeOAuth(
      req.user.workspaceId,
      String(body.code || ''),
      String(body.state || ''),
    );
  }

  /** Start Microsoft mailbox OAuth for the workspace owner. */
  @Get('connect/email/microsoft/auth-url')
  getMicrosoftAuthUrl(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Query('returnTo') returnTo?: string,
  ) {
    return this.microsoftMailbox.buildAuthUrl(req.user.workspaceId, returnTo);
  }

  /** Complete Microsoft mailbox OAuth and persist encrypted tokens. */
  @Post('connect/email/microsoft/complete')
  async completeMicrosoftOAuth(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: GmailOAuthCompletePayload = {},
  ) {
    return this.microsoftMailbox.completeOAuth(
      req.user.workspaceId,
      String(body.code || ''),
      String(body.state || ''),
    );
  }

  /** Connect a generic customer mailbox through IMAP + SMTP credentials. */
  @Post('connect/email/imap-smtp/connect')
  async connectImapSmtpMailbox(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: ImapSmtpConnectPayload = {},
  ) {
    return this.imapSmtpMailbox.connectMailbox(req.user.workspaceId, body);
  }

  /** Pull latest Gmail messages into the unified inbox for the connected mailbox. */
  @Post('connect/email/gmail/sync')
  async syncGmailMailbox(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: GmailSyncPayload = {},
  ) {
    return this.gmailMailbox.syncLatestInbox(req.user.workspaceId, Number(body.limit || 10));
  }

  /** Send a test message through the connected Gmail mailbox, not Kloel's sender. */
  @Post('connect/email/gmail/send-test')
  async sendGmailMailboxTest(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() body: GmailSendTestPayload = {},
  ) {
    return this.gmailMailbox.sendMessageFromMailbox(req.user.workspaceId, {
      toEmail: String(body.toEmail || req.user.email || ''),
      subject: body.subject || 'Kloel CIA - Gmail conectado',
      html: body.html || '<p>Esta mensagem saiu da caixa Gmail conectada ao workspace Kloel.</p>',
      proactive: true,
    });
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
      workspaceId,
      toEmail,
      'KLOEL - conexao de email validada',
      EMAIL_VALIDATION_HTML_BODY,
    );

    return { success: true, workspaceId, toEmail, provider: result.provider };
  }

  /** Get email connect status. */
  @Get('connect/email/status')
  async getEmailStatus(@Request() req: { user: { workspaceId: string } }) {
    const workspaceId = req.user.workspaceId;
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true, name: true },
    });
    const providerSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const emailSettings = ((providerSettings.email || {}) as Record<string, unknown>) || {
      enabled: false,
    };
    const emailProvider = await this.getEmailProviderSnapshot(workspaceId);

    return {
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
      workspaceConfigured: emailProvider.workspaceConfigured,
      workspaceName: workspace?.name || null,
    };
  }

  /** Disconnect email. */
  @Post('connect/email/disconnect')
  async disconnectEmail(@Request() req: { user: { workspaceId: string } }) {
    const workspaceId = req.user.workspaceId;
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...currentSettings,
          email: { enabled: false },
        },
      },
    });

    return this.getEmailStatus({ user: { workspaceId } });
  }
}
