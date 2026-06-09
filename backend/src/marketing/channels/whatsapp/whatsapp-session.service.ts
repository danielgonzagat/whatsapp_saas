import { BadRequestException, GoneException, Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpsAlertService } from '../../../observability/ops-alert.service';
import { forEachSequential } from '../../../common/async-sequence';
import { WhatsAppProviderRegistry, type SessionStatus } from './providers/provider-registry';
import {
  WhatsAppApiProvider,
  type MetaWhatsAppRuntimeConfigDiagnostics,
} from './providers/whatsapp-api.provider';
import { normalizeJsonObjExt, normalizeNumber } from './whatsapp-service.helpers';
import { asProviderSettings, type ProviderSettings } from './provider-settings.types';
import { toPrismaJsonValue } from '../../../common/prisma/prisma-json.util';
import { WhatsAppEventEmitterService } from '../../../kloel/whatsapp-emitter/whatsapp-event-emitter.service';

import { UUID_DASH_RE } from '../../../common/regex';

@Injectable()
export class WhatsappSessionService {
  private readonly logger = StructuredLogger.from(WhatsappSessionService.name);

  constructor(
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly whatsappEmitter?: WhatsAppEventEmitterService,
  ) {}

  private readText(v: unknown): string {
    if (typeof v === 'string') {
      return v.trim();
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
      return String(v).trim();
    }
    return '';
  }

  private normalizeNumber(num: string): string {
    return normalizeNumber(num);
  }

  private normalizeChatId(chatId: string): string {
    return String(chatId || '').includes('@') ? chatId : `${this.normalizeNumber(chatId)}@c.us`;
  }

  private normalizeJsonObject(v: unknown): Record<string, unknown> {
    return normalizeJsonObjExt(v);
  }

  private get providerExtract() {
    return this.providerRegistry.extractPhoneFromChatId.bind(this.providerRegistry);
  }

  private throwMetaOnlyGone(feature: string): never {
    throw new GoneException({
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      feature,
      message: 'WhatsApp agora conecta somente pela API oficial da Meta.',
      use: '/meta/auth/url?channel=whatsapp&returnTo=/whatsapp',
    });
  }

  async createSession(ws: string) {
    const result = await this.providerRegistry.startSession(ws);
    this.logger.log(`Meta auth status resolved for ws=${ws}: success=${result.success}`);
    if (!result.success) {
      return { error: true, message: result.message || 'meta_connection_failed' };
    }
    const status = await this.providerRegistry.getSessionStatus(ws);
    if (status.connected && this.whatsappEmitter) {
      this.whatsappEmitter.emitSessionLifecycle({
        workspaceId: ws,
        event: 'connected',
        phoneNumber: status.phoneNumber ?? undefined,
        reason: 'meta_session_connected',
      });
    }
    return {
      status: status.connected ? 'already_connected' : status.status || 'meta_connection_required',
      authUrl: result.authUrl ?? status.authUrl,
      phoneNumber: status.phoneNumber,
      phoneNumberId: status.phoneNumberId,
      provider: 'meta-cloud',
      whatsappBusinessId: status.whatsappBusinessId,
    };
  }

  async recreateSessionIfInvalid(ws: string) {
    await this.providerRegistry.getProviderType(ws);
    const diagnostics = await this.providerRegistry.getSessionDiagnostics(ws);
    const status = await this.providerRegistry.getSessionStatus(ws).catch((e: unknown) => {
      this.logger.warn(
        `Meta session status check failed for ws=${ws}: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return null;
    });
    return {
      recreated: false,
      reason: status?.connected
        ? 'meta_session_connected'
        : 'meta_connection_managed_by_official_auth',
      diagnostics,
      status,
    };
  }

  getSession(ws: string) {
    return { workspaceId: ws, provider: 'meta-cloud' };
  }

  async getConnectionStatus(ws: string) {
    const s = await this.providerRegistry.getSessionStatus(ws);
    return {
      connected: s.connected,
      status: s.status,
      phoneNumber: s.phoneNumber,
      authUrl: s.authUrl,
      phoneNumberId: s.phoneNumberId,
      provider: 'meta-cloud',
      whatsappBusinessId: s.whatsappBusinessId,
    };
  }

  getQrCode(_ws: string) {
    return this.throwMetaOnlyGone('legacy_session_qr');
  }

  disconnect(_ws: string) {
    return this.throwMetaOnlyGone('legacy_session_disconnect');
  }

  async setPresence(
    ws: string,
    chatId: string,
    presence: 'typing' | 'paused' | 'seen' | 'available' | 'offline',
  ) {
    const n = this.normalizeChatId(chatId);
    switch (presence) {
      case 'available':
        await this.providerRegistry.setPresence(ws, 'available', n);
        break;
      case 'offline':
        await this.providerRegistry.setPresence(ws, 'offline', n);
        break;
      case 'typing':
        await this.providerRegistry.sendTyping(ws, n);
        break;
      case 'paused':
        await this.providerRegistry.stopTyping(ws, n);
        break;
      case 'seen':
        await this.markChatAsReadBestEffort(ws, n);
        break;
      default:
        throw new BadRequestException('presence inválida');
    }
    return { ok: true, chatId: n, presence };
  }

  validateWorkspaceProvider(w: ProviderSettings): string[] {
    const p = w?.whatsappProvider || 'meta-cloud';
    return p !== 'meta-cloud' ? ['whatsapp_provider'] : [];
  }

  async collectMessagingRuntimeIssues(
    ws: string,
    workspace: ProviderSettings,
    o?: { requireInboundWebhook?: boolean },
  ) {
    const issues = this.validateWorkspaceProvider(workspace);
    const pt = await this.providerRegistry.getProviderType(ws);
    const d: {
      webhook: MetaWhatsAppRuntimeConfigDiagnostics;
      session: (SessionStatus & { error?: string }) | null;
    } = {
      webhook: this.whatsappApi.getRuntimeConfigDiagnostics(),
      session: null,
    };
    if (o?.requireInboundWebhook) {
      if (!d.webhook.webhookConfigured) {
        issues.push('meta_webhook_missing');
      } else if (!d.webhook.inboundEventsConfigured) {
        issues.push('meta_webhook_events_missing_inbound');
      }
    }
    try {
      d.session = await this.providerRegistry.getSessionStatus(ws);
      if (!d.session.connected) {
        issues.push(
          `${pt.replace(UUID_DASH_RE, '_')}_session_${String(d.session.status || 'unknown').toLowerCase()}`,
        );
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'unknown_error';
      this.logger.error(`Session status check failed for ws=${ws}: ${errMsg}`);
      issues.push(`${pt.replace(UUID_DASH_RE, '_')}_session_status_unavailable`);
      d.session = {
        connected: false,
        status: 'UNKNOWN',
        error: errMsg,
      };
      void this.opsAlert?.alertOnCriticalError(e, 'WhatsappSessionService.runDiagnostics.session', {
        workspaceId: ws,
      });
    }
    return { issues, diagnostics: d };
  }

  private async resolveReadChatCandidates(ws: string, chatIdOrPhone: string): Promise<string[]> {
    const nChat = this.normalizeChatId(chatIdOrPhone);
    const nPhone = this.normalizeNumber(this.providerExtract(nChat));
    const c = nPhone
      ? await this.prisma.contact
          .findUnique({
            where: { workspaceId_phone: { workspaceId: ws, phone: nPhone } },
            select: { customFields: true },
          })
          .catch(() => null)
      : null;
    const cf = this.normalizeJsonObject(c?.customFields);
    return Array.from(
      new Set(
        [
          nChat,
          this.readText(cf.lastRemoteChatId),
          this.readText(cf.lastCatalogChatId),
          this.readText(cf.lastResolvedChatId),
          nPhone ? `${nPhone}@c.us` : '',
          nPhone ? `${nPhone}@s.whatsapp.net` : '',
        ].filter(Boolean),
      ),
    );
  }

  /**
   * Persist watchdog diagnostics timestamps into the session snapshot.
   * Updates both whatsappApiSession and whatsappWebSession so the
   * diagnostics are readable regardless of the active provider type.
   */
  async persistSessionDiagnostics(
    workspaceId: string,
    update: {
      lastHeartbeatAt?: string | null;
      lastSeenWorkingAt?: string | null;
      lastWatchdogDisconnectedAt?: string | null;
      watchdogReconnectBlockedReason?: string | null;
    },
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.findUnique({
          where: { id: workspaceId },
          select: { providerSettings: true },
        });
        if (!workspace) {
          return;
        }

        const settings = asProviderSettings(workspace.providerSettings);
        const sessionMeta = settings.whatsappWebSession || settings.whatsappApiSession || {};

        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            providerSettings: toPrismaJsonValue({
              ...settings,
              whatsappApiSession: {
                ...sessionMeta,
                ...update,
                lastUpdated: new Date().toISOString(),
              },
              whatsappWebSession: {
                ...sessionMeta,
                ...update,
                lastUpdated: new Date().toISOString(),
              },
            }),
          },
        });
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.warn(`Failed to persist watchdog diagnostics for ${workspaceId}: ${msg}`);
    }
  }

  async markChatAsReadBestEffort(ws: string, chatIdOrPhone: string): Promise<void> {
    const cs = await this.resolveReadChatCandidates(ws, chatIdOrPhone);
    await forEachSequential(cs, async (c) => {
      await this.providerRegistry.readChatMessages(ws, c).catch(() => {});
    });
    if (this.whatsappEmitter) {
      this.whatsappEmitter.emitMessageRead({
        workspaceId: ws,
        chatId: chatIdOrPhone,
      });
    }
  }
}
