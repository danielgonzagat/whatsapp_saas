import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { encryptString } from '../lib/crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { buildUnsubscribeFooterHtml } from '../common/utils/unsubscribe-footer.util';
import { EmailCampaignService } from '../kloel/email-campaign.service';
import {
  isWorkspaceDeliveryReady,
  readWorkspaceEmailDelivery,
} from '../kloel/email-workspace-delivery';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import {
  EMAIL_VALIDATION_HTML_BODY,
  extractSetupConfigField,
  normalizeWhatsAppSelectedProducts,
} from './__companions__/marketing-connect.controller.companion';
import { TikTokMarketingService } from './tiktok-marketing.service';

type EmailDeliveryProvider = 'resend' | 'sendgrid' | 'smtp';

interface ConnectEmailBody {
  enabled?: boolean;
  provider?: EmailDeliveryProvider;
  fromEmail?: string;
  fromName?: string;
  apiKey?: string;
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
  };
}

interface EmailProviderSnapshot {
  provider: string;
  available: boolean;
  fromEmail: string;
  fromName: string;
  workspaceConfigured: boolean;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requireEncryptionKey(): string {
  const key = readText(process.env.ENCRYPTION_KEY);
  if (!key) {
    throw new BadRequestException('chave_de_criptografia_nao_configurada');
  }
  return key;
}

function buildEmailDeliveryCriteria(body: ConnectEmailBody): Prisma.InputJsonValue | null {
  if (!body.provider) {
    return null;
  }
  if (body.provider !== 'resend' && body.provider !== 'sendgrid' && body.provider !== 'smtp') {
    throw new BadRequestException('provedor_de_email_invalido');
  }

  const key = requireEncryptionKey();
  const fromEmail = readText(body.fromEmail);
  const fromName = readText(body.fromName);

  if (body.provider === 'smtp') {
    const host = readText(body.smtp?.host);
    const user = readText(body.smtp?.user);
    const pass = readText(body.smtp?.pass);
    if (!host || !user || !pass) {
      throw new BadRequestException('credenciais_smtp_obrigatorias');
    }
    return {
      emailDelivery: {
        provider: 'smtp',
        fromEmail,
        fromName,
        smtp: {
          host,
          port: body.smtp?.port,
          secure: body.smtp?.secure === true,
          user,
          passwordEncrypted: encryptString(pass, key),
        },
      },
    };
  }

  const apiKey = readText(body.apiKey);
  if (!apiKey) {
    throw new BadRequestException('chave_do_provedor_de_email_obrigatoria');
  }
  return {
    emailDelivery: {
      provider: body.provider,
      fromEmail,
      fromName,
      apiKeyEncrypted: encryptString(apiKey, key),
    },
  };
}

function isJsonObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toInputJsonObject(value: Prisma.JsonObject): Prisma.InputJsonObject {
  const entries: [string, Prisma.InputJsonValue][] = [];
  for (const [key, item] of Object.entries(value)) {
    if (item !== null && item !== undefined) {
      entries.push([key, item]);
    }
  }
  return Object.fromEntries(entries);
}

/**
 * Marketing Connect Controller
 *
 * Manages channel connection status (WhatsApp, Instagram, Facebook, Email),
 * WhatsApp summary, and email connectivity for the Marketing Command Center.
 */
@Controller('marketing')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MarketingConnectController {
  private readonly logger = new Logger(MarketingConnectController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaWhatsApp: MetaWhatsAppService,
    private readonly whatsappProviders: WhatsAppProviderRegistry,
    private readonly tiktokMarketing: TikTokMarketingService,
    private readonly emailCampaign: EmailCampaignService,
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

    return { snapshot, snapshotStatus, snapshotConnected };
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
      this.tiktokMarketing.getStatus(workspaceId).catch(() => ({
        connected: false,
        status: 'disconnected',
        kind: null,
        openId: null,
        advertiserIds: [],
        expiresAt: null,
        expired: false,
        clientConfigured: false,
        secretConfigured: false,
        configReady: false,
      })),
    ]);

    const providerSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const emailSettings = ((providerSettings.email || {}) as Record<string, unknown>) || {
      enabled: false,
    };
    const emailProvider = await this.getEmailProviderSnapshot(workspaceId);
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
        tiktok: await this.tiktokMarketing.getStatus(workspaceId),
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
    return this.getConnectionStatus(req.user.workspaceId);
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
    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const nextEnabled = body.enabled !== false;
    const deliveryCriteria = buildEmailDeliveryCriteria(body);
    const currentConfig = await this.prisma.channelConfig.findUnique({
      where: { workspaceId_channel: { workspaceId, channel: 'email' } },
      select: { transferCriteria: true },
    });
    const currentCriteria: Prisma.InputJsonObject = isJsonObject(currentConfig?.transferCriteria)
      ? toInputJsonObject(currentConfig.transferCriteria)
      : {};
    const nextCriteria: Prisma.InputJsonObject = deliveryCriteria
      ? {
          ...currentCriteria,
          ...(deliveryCriteria as Prisma.InputJsonObject),
        }
      : currentCriteria;

    await this.prisma.$transaction([
      this.prisma.workspace.update({
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
      }),
      ...(deliveryCriteria
        ? [
            this.prisma.channelConfig.upsert({
              where: { workspaceId_channel: { workspaceId, channel: 'email' } },
              create: {
                workspaceId,
                channel: 'email',
                transferCriteria: deliveryCriteria,
              },
              update: {
                transferCriteria: nextCriteria,
              },
            }),
          ]
        : []),
    ]);

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
