import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { forEachSequential } from '../common/async-sequence';
import { WhatsAppProviderRegistry, type SessionStatus } from './providers/provider-registry';
import {
  WhatsAppApiProvider,
  type WahaRuntimeConfigDiagnostics,
} from './providers/whatsapp-api.provider';
import { normalizeJsonObjExt } from './whatsapp-service.helpers';
import type { ProviderSettings } from './provider-settings.types';

const D_RE = /\D/g;
const PATTERN_RE = /-/g;

@Injectable()
export class WhatsappSessionService {
  private readonly logger = new Logger(WhatsappSessionService.name);

  constructor(
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private readText(v: unknown): string {
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
    return '';
  }

  private normalizeNumber(num: string): string {
    return num.replace(D_RE, '');
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

  async createSession(ws: string) {
    const result = await this.providerRegistry.startSession(ws);
    this.logger.log(`Session start attempted for ws=${ws}: success=${result.success}`);
    if (!result.success)
      return { error: true, message: result.message || 'failed_to_start_session' };
    const qr = await this.providerRegistry.getQrCode(ws);
    if (qr.success && qr.qr) return { status: 'qr_pending', code: qr.qr, qrCode: qr.qr };
    const status = await this.providerRegistry.getSessionStatus(ws);
    return {
      status: status.connected ? 'already_connected' : status.status,
      qrCode: status.qrCode,
    };
  }

  async recreateSessionIfInvalid(ws: string) {
    await this.providerRegistry.getProviderType(ws);
    const d = await this.providerRegistry.getSessionDiagnostics(ws);
    await this.providerRegistry.getSessionStatus(ws).catch((e: unknown) => {
      this.logger.warn(
        `Session status check failed for ws=${ws}: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return null;
    });
    const invalid =
      !d?.available ||
      d?.configMismatch ||
      d?.webhookConfigured !== true ||
      d?.inboundEventsConfigured !== true ||
      d?.storeEnabled !== true;
    if (!invalid) return { recreated: false, reason: 'session_config_healthy', diagnostics: d };
    this.logger.warn(`Session invalid for ws=${ws}, recreating`);
    await this.providerRegistry.deleteSession(ws).catch((e: unknown) => {
      this.logger.warn(
        `Session delete failed for ws=${ws}: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return undefined;
    });
    const start = await this.providerRegistry.startSession(ws);
    return { recreated: start.success === true, reason: start.message, diagnostics: d };
  }

  getSession(ws: string) {
    return { workspaceId: ws, provider: 'dynamic' };
  }

  async getConnectionStatus(ws: string) {
    const s = await this.providerRegistry.getSessionStatus(ws);
    return { status: s.status, phoneNumber: s.phoneNumber, qrCode: s.qrCode };
  }

  async getQrCode(ws: string) {
    const q = await this.providerRegistry.getQrCode(ws);
    return q.success ? q.qr || null : null;
  }

  async disconnect(ws: string) {
    await this.providerRegistry.disconnect(ws);
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
      webhook: WahaRuntimeConfigDiagnostics;
      session: (SessionStatus & { error?: string }) | null;
    } = {
      webhook: this.whatsappApi.getRuntimeConfigDiagnostics(),
      session: null,
    };
    if (o?.requireInboundWebhook) {
      if (!d.webhook.webhookConfigured) issues.push('meta_webhook_missing');
      else if (!d.webhook.inboundEventsConfigured)
        issues.push('meta_webhook_events_missing_inbound');
    }
    try {
      d.session = await this.providerRegistry.getSessionStatus(ws);
      if (!d.session.connected)
        issues.push(
          `${pt.replace(PATTERN_RE, '_')}_session_${String(d.session.status || 'unknown').toLowerCase()}`,
        );
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'unknown_error';
      this.logger.error(`Session status check failed for ws=${ws}: ${errMsg}`);
      issues.push(`${pt.replace(PATTERN_RE, '_')}_session_status_unavailable`);
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

  async markChatAsReadBestEffort(ws: string, chatIdOrPhone: string): Promise<void> {
    const cs = await this.resolveReadChatCandidates(ws, chatIdOrPhone);
    await forEachSequential(cs, async (c) => {
      await this.providerRegistry.readChatMessages(ws, c).catch(() => {});
    });
  }
}
