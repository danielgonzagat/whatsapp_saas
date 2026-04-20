// PULSE:OK — provider registry does not enforce daily send limits itself.
// WhatsAppService.sendMessage() calls PlanLimitsService.trackMessageSend() before delegating here.
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { asProviderSettings, type ProviderSessionSnapshot } from '../provider-settings.types';
import { extractPhoneFromChatId as normalizePhoneFromChatId } from '../whatsapp-normalization.util';
import { type ResolvedWhatsAppProvider, resolveDefaultWhatsAppProvider } from './provider-env';
import { WahaProvider } from './waha.provider';
import { WhatsAppApiProvider } from './whatsapp-api.provider';

/** Whats app provider type type. */
export type WhatsAppProviderType = ResolvedWhatsAppProvider;

/** Send message options shape. */
export interface SendMessageOptions {
  /** Media url property. */
  mediaUrl?: string;
  /** Media type property. */
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  /** Caption property. */
  caption?: string;
  /** Quoted message id property. */
  quotedMessageId?: string;
}

/** Send result shape. */
export interface SendResult {
  /** Success property. */
  success: boolean;
  /** Message id property. */
  messageId?: string;
  /** Error property. */
  error?: string;
}

/** Session status shape. */
export interface SessionStatus {
  /** Connected property. */
  connected: boolean;
  /** Status property. */
  status: string;
  /** Phone number property. */
  phoneNumber?: string;
  /** Push name property. */
  pushName?: string;
  /** Self ids property. */
  selfIds?: string[];
  /** Qr code property. */
  qrCode?: string;
  /** Auth url property. */
  authUrl?: string;
  /** Phone number id property. */
  phoneNumberId?: string;
  /** Whatsapp business id property. */
  whatsappBusinessId?: string | null;
  /** Degraded reason property. */
  degradedReason?: string | null;
}

/** Whats app provider registry. */
@Injectable()
export class WhatsAppProviderRegistry {
  private readonly logger = new Logger(WhatsAppProviderRegistry.name);
  private readonly defaultProvider: WhatsAppProviderType;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaCloudProvider: WhatsAppApiProvider,
    @Optional() private readonly wahaProvider?: WahaProvider,
  ) {
    this.defaultProvider = resolveDefaultWhatsAppProvider();
    this.logger.log(`WhatsApp provider default: ${this.defaultProvider}`);
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const items = value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
    return items.length > 0 ? items : [];
  }

  private readSessionSnapshot(value: unknown): ProviderSessionSnapshot {
    const snapshot = this.readRecord(value);

    return {
      status: this.readString(snapshot.status),
      rawStatus: this.readString(snapshot.rawStatus) ?? null,
      phoneNumber: this.readString(snapshot.phoneNumber) ?? null,
      pushName: this.readString(snapshot.pushName) ?? null,
      selfIds: this.readStringArray(snapshot.selfIds) ?? [],
      qrCode: this.readString(snapshot.qrCode) ?? null,
      authUrl: this.readString(snapshot.authUrl) ?? null,
      phoneNumberId: this.readString(snapshot.phoneNumberId) ?? null,
      whatsappBusinessId: this.readString(snapshot.whatsappBusinessId) ?? null,
      sessionName: this.readString(snapshot.sessionName) ?? null,
      disconnectReason: this.readString(snapshot.disconnectReason) ?? null,
      provider: this.readString(snapshot.provider),
      lastUpdated: this.readString(snapshot.lastUpdated),
    };
  }

  private isWahaMode(): boolean {
    return this.defaultProvider === 'whatsapp-api' && !!this.wahaProvider;
  }

  /** Extract phone from chat id. */
  extractPhoneFromChatId(chatId: string): string {
    return normalizePhoneFromChatId(chatId);
  }

  private normalizeWahaSnapshotStatus(
    rawStatus: string | null | undefined,
  ): 'connected' | 'connecting' | 'failed' | 'disconnected' {
    const normalized = String(rawStatus || '')
      .trim()
      .toUpperCase();

    if (normalized === 'CONNECTED' || normalized === 'WORKING') {
      return 'connected';
    }

    if (
      normalized === 'SCAN_QR_CODE' ||
      normalized === 'QR_PENDING' ||
      normalized === 'STARTING' ||
      normalized === 'OPENING'
    ) {
      return 'connecting';
    }

    if (normalized === 'FAILED') {
      return 'failed';
    }

    return 'disconnected';
  }

  private async persistSessionSnapshot(
    workspaceId: string,
    update: Partial<ProviderSessionSnapshot>,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!workspace) {
      return;
    }

    const settings = asProviderSettings(workspace.providerSettings);
    const currentSession = settings.whatsappApiSession || {};

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          whatsappProvider: this.defaultProvider,
          connectionStatus: update.status || currentSession.status || 'unknown',
          whatsappApiSession: {
            ...currentSession,
            ...update,
            provider: this.defaultProvider,
            lastUpdated: new Date().toISOString(),
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Get provider type. */
  async getProviderType(workspaceId: string): Promise<WhatsAppProviderType> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!workspace) {
      throw new Error('workspace_not_found');
    }

    const settings = asProviderSettings(workspace.providerSettings);
    const current = String(settings.whatsappProvider || '').trim();
    if (current !== this.defaultProvider) {
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: {
            ...settings,
            whatsappProvider: this.defaultProvider,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return this.defaultProvider;
  }

  // ═══════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════

  async startSession(workspaceId: string): Promise<{
    success: boolean;
    qrCode?: string;
    message?: string;
    authUrl?: string;
  }> {
    await this.getProviderType(workspaceId);

    if (this.isWahaMode()) {
      const result = await this.wahaProvider.startSession(workspaceId);
      await this.persistSessionSnapshot(workspaceId, {
        status: result.message === 'already_connected' ? 'connected' : 'connecting',
        rawStatus: result.message === 'already_connected' ? 'CONNECTED' : 'STARTING',
        disconnectReason: null,
        ...(result.message === 'already_connected' ? { qrCode: null } : {}),
        sessionName: workspaceId,
      });
      return { success: result.success, message: result.message };
    }

    const result = await this.metaCloudProvider.startSession(workspaceId);
    await this.persistSessionSnapshot(workspaceId, {
      status: result.message === 'already_connected' ? 'connected' : 'connection_required',
      qrCode: null,
      authUrl: result.authUrl || null,
      sessionName: workspaceId,
    });
    return result;
  }

  /** Get session status. */
  async getSessionStatus(workspaceId: string): Promise<SessionStatus> {
    await this.getProviderType(workspaceId);

    if (this.isWahaMode()) {
      const wahaStatus = await this.wahaProvider.getSessionStatus(workspaceId);
      const connected = wahaStatus.state === 'CONNECTED';
      const snapshotStatus = this.normalizeWahaSnapshotStatus(wahaStatus.state);
      const status: SessionStatus = {
        connected,
        status: wahaStatus.state || 'DISCONNECTED',
        phoneNumber: wahaStatus.phoneNumber || undefined,
        pushName: wahaStatus.pushName || undefined,
        selfIds: wahaStatus.selfIds || [],
      };
      await this.persistSessionSnapshot(workspaceId, {
        status: snapshotStatus,
        rawStatus: status.status,
        phoneNumber: status.phoneNumber || null,
        pushName: status.pushName || null,
        selfIds: status.selfIds || [],
        disconnectReason: connected ? null : wahaStatus.message || null,
        ...(connected ? { qrCode: null } : {}),
        sessionName: workspaceId,
      });
      return status;
    }

    // Meta Cloud path (unchanged)
    const [workspace, details] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      }),
      this.metaCloudProvider.getSessionConfigDiagnostics(workspaceId),
    ]);
    const settings = asProviderSettings(workspace?.providerSettings);
    const snapshot = this.readSessionSnapshot(settings.whatsappApiSession);
    const snapshotStatus = String(snapshot.status || snapshot.rawStatus || '')
      .trim()
      .toUpperCase();
    const snapshotConnected = snapshotStatus === 'CONNECTED' || snapshotStatus === 'WORKING';
    const liveConnected = details.state === 'CONNECTED';
    const fallbackToSnapshot = !liveConnected && details.state === 'DEGRADED' && snapshotConnected;

    const status: SessionStatus = {
      connected: liveConnected || fallbackToSnapshot,
      status: fallbackToSnapshot ? 'CONNECTED' : details.state || 'DISCONNECTED',
      phoneNumber: details.phoneNumber || snapshot.phoneNumber || undefined,
      pushName: details.pushName || snapshot.pushName || undefined,
      selfIds: [],
      authUrl: details.authUrl || snapshot.authUrl || undefined,
      phoneNumberId: details.phoneNumberId || snapshot.phoneNumberId || undefined,
      whatsappBusinessId: details.whatsappBusinessId || snapshot.whatsappBusinessId || undefined,
      degradedReason: fallbackToSnapshot ? null : details.error || null,
    };

    await this.persistSessionSnapshot(workspaceId, {
      status: status.connected ? 'connected' : 'disconnected',
      phoneNumber: status.phoneNumber || null,
      pushName: status.pushName || null,
      selfIds: status.selfIds || [],
      sessionName: workspaceId,
      authUrl: status.authUrl || null,
      phoneNumberId: status.phoneNumberId || null,
      whatsappBusinessId: status.whatsappBusinessId || null,
    });
    return status;
  }

  /** Get qr code. */
  async getQrCode(
    workspaceId: string,
  ): Promise<{ success: boolean; qr?: string; message?: string }> {
    await this.getProviderType(workspaceId);

    if (this.isWahaMode()) {
      return this.wahaProvider.getQrCode(workspaceId);
    }
    return this.metaCloudProvider.getQrCode(workspaceId);
  }

  // ═══════════════════════════════════════════════════
  // MESSAGING
  // ═══════════════════════════════════════════════════

  async sendMessage(
    workspaceId: string,
    to: string,
    message: string,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    try {
      if (this.isWahaMode()) {
        const result = options?.mediaUrl
          ? await this.wahaProvider.sendMediaFromUrl(
              workspaceId,
              to,
              options.mediaUrl,
              options.caption || message,
              options.mediaType || 'image',
            )
          : await this.wahaProvider.sendMessage(workspaceId, to, message);
        const messageRecord = this.readRecord(this.readRecord(result).message);
        return {
          success: Boolean(this.readRecord(result).success),
          messageId: typeof messageRecord.id === 'string' ? messageRecord.id : undefined,
        };
      }

      const result = options?.mediaUrl
        ? await this.metaCloudProvider.sendMediaFromUrl(
            workspaceId,
            to,
            options.mediaUrl,
            options.caption || message,
            options.mediaType || 'image',
            { quotedMessageId: options.quotedMessageId },
          )
        : await this.metaCloudProvider.sendMessage(workspaceId, to, message, {
            quotedMessageId: options?.quotedMessageId,
          });
      return {
        success: Boolean(result?.success),
        messageId: result?.message?.id || undefined,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Send failed: ${msg}`);
      return { success: false, error: msg || 'send_failed' };
    }
  }

  /** Send media. */
  async sendMedia(
    workspaceId: string,
    to: string,
    mediaUrl: string,
    options?: { caption?: string; mediaType?: 'image' | 'video' | 'audio' | 'document' },
  ): Promise<SendResult> {
    return this.sendMessage(workspaceId, to, options?.caption || '', {
      mediaUrl,
      caption: options?.caption,
      mediaType: options?.mediaType,
    });
  }

  // ═══════════════════════════════════════════════════
  // SESSION OPERATIONS
  // ═══════════════════════════════════════════════════

  async disconnect(workspaceId: string): Promise<{ success: boolean; message?: string }> {
    if (this.isWahaMode()) {
      const result = await this.wahaProvider.logoutSession(workspaceId);
      await this.persistSessionSnapshot(workspaceId, { status: 'disconnected', qrCode: null });
      return { success: Boolean(result?.success), message: 'disconnected' };
    }
    await this.persistSessionSnapshot(workspaceId, { status: 'disconnected', qrCode: null });
    return { success: true, message: 'disconnected' };
  }

  /** Logout. */
  async logout(workspaceId: string): Promise<{ success: boolean; message?: string }> {
    return this.disconnect(workspaceId);
  }

  /** Restart session. */
  async restartSession(
    workspaceId: string,
  ): Promise<{ success: boolean; message?: string; qrCode?: string; authUrl?: string }> {
    if (this.isWahaMode()) {
      return this.wahaProvider.restartSession(workspaceId);
    }
    return this.metaCloudProvider.restartSession(workspaceId);
  }

  /** Delete session. */
  async deleteSession(workspaceId: string): Promise<boolean> {
    if (this.isWahaMode()) {
      return this.wahaProvider.deleteSession(workspaceId);
    }
    return this.metaCloudProvider.deleteSession(workspaceId);
  }

  /** Sync session config. */
  async syncSessionConfig(workspaceId: string): Promise<void> {
    if (this.isWahaMode()) {
      return this.wahaProvider.syncSessionConfig(workspaceId);
    }
    return this.metaCloudProvider.syncSessionConfig(workspaceId);
  }

  // ═══════════════════════════════════════════════════
  // CONTACTS & CHATS
  // ═══════════════════════════════════════════════════

  async isRegistered(workspaceId: string, phone: string): Promise<boolean> {
    if (this.isWahaMode()) {
      return this.wahaProvider.isRegisteredUser(workspaceId, phone);
    }
    return this.metaCloudProvider.isRegisteredUser(workspaceId, phone);
  }

  /** Get client info. */
  async getClientInfo(workspaceId: string): Promise<unknown> {
    if (this.isWahaMode()) {
      return this.wahaProvider.getClientInfo(workspaceId);
    }
    return this.metaCloudProvider.getClientInfo(workspaceId);
  }

  /** Get contacts. */
  async getContacts(workspaceId: string): Promise<unknown[]> {
    if (this.isWahaMode()) {
      const contacts = await this.wahaProvider.getContacts(workspaceId);
      return Array.isArray(contacts) ? contacts : [];
    }
    const contacts = await this.metaCloudProvider.getContacts(workspaceId);
    return Array.isArray(contacts) ? contacts : [];
  }

  /** Upsert contact profile. */
  async upsertContactProfile(
    workspaceId: string,
    contact: { phone: string; name?: string | null },
  ): Promise<boolean> {
    if (this.isWahaMode()) {
      return this.wahaProvider.upsertContactProfile(workspaceId, contact);
    }
    return this.metaCloudProvider.upsertContactProfile(workspaceId, contact);
  }

  /** Get chats. */
  async getChats(workspaceId: string): Promise<unknown[]> {
    if (this.isWahaMode()) {
      const chats = await this.wahaProvider.getChats(workspaceId);
      return Array.isArray(chats) ? chats : [];
    }
    const chats = await this.metaCloudProvider.getChats(workspaceId);
    return Array.isArray(chats) ? chats : [];
  }

  /** Get chat messages. */
  async getChatMessages(
    workspaceId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<unknown[]> {
    if (this.isWahaMode()) {
      const msgs = await this.wahaProvider.getChatMessages(workspaceId, chatId, options);
      return Array.isArray(msgs) ? msgs : [];
    }
    const msgs = await this.metaCloudProvider.getChatMessages(workspaceId, chatId, options);
    return Array.isArray(msgs) ? msgs : [];
  }

  /** Read chat messages. */
  async readChatMessages(workspaceId: string, chatId: string): Promise<void> {
    if (this.isWahaMode()) {
      return this.wahaProvider.sendSeen(workspaceId, chatId);
    }
    return this.metaCloudProvider.readChatMessages(workspaceId, chatId);
  }

  /** Set presence. */
  async setPresence(
    workspaceId: string,
    presence: 'available' | 'offline',
    chatId?: string,
  ): Promise<void> {
    if (this.isWahaMode()) {
      return;
    } // WAHA does not support presence API
    return this.metaCloudProvider.setPresence(workspaceId, presence, chatId);
  }

  /** Send typing. */
  async sendTyping(workspaceId: string, chatId: string): Promise<void> {
    if (this.isWahaMode()) {
      return;
    }
    return this.metaCloudProvider.sendTyping(workspaceId, chatId);
  }

  /** Stop typing. */
  async stopTyping(workspaceId: string, chatId: string): Promise<void> {
    if (this.isWahaMode()) {
      return;
    }
    return this.metaCloudProvider.stopTyping(workspaceId, chatId);
  }

  /** Send seen. */
  async sendSeen(workspaceId: string, chatId: string): Promise<void> {
    if (this.isWahaMode()) {
      return this.wahaProvider.sendSeen(workspaceId, chatId);
    }
    return this.metaCloudProvider.sendSeen(workspaceId, chatId);
  }

  /** Health check. */
  async healthCheck(): Promise<{ whatsappApi: boolean; whatsappWebAgent: boolean }> {
    if (this.isWahaMode()) {
      const wahaHealthy = await this.wahaProvider.ping().catch(() => false);
      return { whatsappApi: wahaHealthy, whatsappWebAgent: false };
    }
    return {
      whatsappApi: await this.metaCloudProvider.ping(),
      whatsappWebAgent: false,
    };
  }

  /** Get session diagnostics. */
  async getSessionDiagnostics(workspaceId: string): Promise<Record<string, unknown>> {
    if (this.isWahaMode()) {
      const diag = await this.wahaProvider.getSessionConfigDiagnostics(workspaceId);
      return {
        ...diag,
        providerType: 'whatsapp-api',
        status: await this.getSessionStatus(workspaceId),
      };
    }
    const diagnostics = await this.metaCloudProvider.getSessionConfigDiagnostics(workspaceId);
    return {
      ...diagnostics,
      providerType: 'meta-cloud',
      status: await this.getSessionStatus(workspaceId),
    };
  }

  /** List lid mappings. */
  async listLidMappings(workspaceId: string): Promise<Array<{ lid: string; pn: string }>> {
    if (this.isWahaMode()) {
      return this.wahaProvider.listLidMappings(workspaceId);
    }
    return this.metaCloudProvider.listLidMappings(workspaceId);
  }
}
