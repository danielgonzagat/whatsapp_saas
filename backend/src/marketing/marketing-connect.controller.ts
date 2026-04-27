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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';

/**
 * Server-rendered HTML body sent to validate email connectivity for the
 * Marketing module. Kept as a module-level constant (instead of an inline
 * literal at the call site) to make intent explicit: this is a transactional
 * email payload, not user-facing JSX text.
 */
const EMAIL_VALIDATION_HTML_BODY =
  '<h1>Conexao validada</h1><p>Seu canal de email esta ativo dentro do Marketing do KLOEL.</p>';

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
      tone: this.extractSetupConfigField(setup, 'tone', null),
      maxDiscount: Number(this.extractSetupConfigField(setup, 'maxDiscount', 0)) || 0,
      followUpEnabled: Boolean(this.extractSetupConfigField(setup, 'followUpEnabled', false)),
      selectedProducts: selectedProducts.map((product) => {
        const performance = salesMap.get(product.name) || { salesCount: 0, revenue: 0 };
        return { ...product, salesCount: performance.salesCount, revenue: performance.revenue };
      }),
    };
  }

  private extractSetupConfigField(
    setup: Record<string, unknown>,
    field: string,
    fallback: unknown,
  ) {
    const cfg =
      setup?.config && typeof setup.config === 'object'
        ? (setup.config as Record<string, unknown>)
        : null;
    return cfg ? (cfg[field] ?? fallback) : fallback;
  }

  private serializeWhatsAppSelectedProduct(product: Record<string, unknown>) {
    const pickString = (v: unknown, fb: string) =>
      typeof v === 'string' && v.trim() ? v.trim() : fb;
    const pickOptional = (v: unknown, v2?: unknown): string | null => {
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v2 === 'string' && v2.trim()) return v2.trim();
      return null;
    };
    const id = pickString(
      product.id ?? (typeof product.productId === 'string' ? product.productId : ''),
      '',
    );
    return {
      id,
      name: pickString(product.name, 'Produto'),
      price: Number(product.price || 0) || 0,
      type: product.type === 'affiliate' ? 'affiliate' : 'own',
      affiliateComm: product.affiliateComm == null ? null : Number(product.affiliateComm || 0) || 0,
      imageUrl: pickOptional(product.imageUrl, product.image),
      producer: pickOptional(product.producer),
    };
  }

  private normalizeWhatsAppSelectedProducts(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => this.serializeWhatsAppSelectedProduct(item))
      .filter((product) => product.id);
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
      EMAIL_VALIDATION_HTML_BODY,
    );

    return { success: true, workspaceId, toEmail, provider: result.provider };
  }
}
