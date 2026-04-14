// PULSE:OK — provider registry does not enforce daily send limits itself.
// WhatsAppService.sendMessage() calls PlanLimitsService.trackMessageSend() before delegating here.
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { asProviderSettings } from '../provider-settings.types';
import { extractPhoneFromChatId as normalizePhoneFromChatId } from '../whatsapp-normalization.util';
import { type ResolvedWhatsAppProvider, resolveDefaultWhatsAppProvider } from './provider-env';
import { WahaProvider } from './waha.provider';
import { WhatsAppApiProvider } from './whatsapp-api.provider';

export type WhatsAppProviderType = ResolvedWhatsAppProvider;

export interface SendMessageOptions {
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  quotedMessageId?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SessionStatus {
  connected: boolean;
  status: string;
  phoneNumber?: string;
  pushName?: string;
  selfIds?: string[];
  qrCode?: string;
  authUrl?: string;
  phoneNumberId?: string;
  whatsappBusinessId?: string | null;
  degradedReason?: string | null;
}

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

  private isWahaMode(): boolean {
    return this.defaultProvider === 'whatsapp-api' && !!this.wahaProvider;
  }

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

  private async persistSessionSnapshot(workspaceId: string, update: Record<string, any>) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!workspace) return;

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

  async getProviderType(workspaceId: string): Promise<WhatsAppProviderType> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!workspace) throw new Error('workspace_not_found');

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
    const snapshot = (settings.whatsappApiSession || {}) as Record<string, any>;
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
      authUrl: details.authUrl || snapshot.authUrl,
      phoneNumberId: details.phoneNumberId || snapshot.phoneNumberId,
      whatsappBusinessId: details.whatsappBusinessId || snapshot.whatsappBusinessId,
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
        return {
          success: Boolean(result?.success),
          messageId: result?.message?.id || undefined,
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
    } catch (error: any) {
      this.logger.error(`Send failed: ${error?.message || error}`);
      return { success: false, error: error?.message || 'send_failed' };
    }
  }

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

  async logout(workspaceId: string): Promise<{ success: boolean; message?: string }> {
    return this.disconnect(workspaceId);
  }

  async restartSession(
    workspaceId: string,
  ): Promise<{ success: boolean; message?: string; qrCode?: string; authUrl?: string }> {
    if (this.isWahaMode()) {
      return this.wahaProvider.restartSession(workspaceId);
    }
    return this.metaCloudProvider.restartSession(workspaceId);
  }

  async deleteSession(workspaceId: string): Promise<boolean> {
    if (this.isWahaMode()) {
      return this.wahaProvider.deleteSession(workspaceId);
    }
    return this.metaCloudProvider.deleteSession(workspaceId);
  }

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

  async getClientInfo(workspaceId: string): Promise<unknown> {
    if (this.isWahaMode()) {
      return this.wahaProvider.getClientInfo(workspaceId);
    }
    return this.metaCloudProvider.getClientInfo(workspaceId);
  }

  async getContacts(workspaceId: string): Promise<unknown[]> {
    if (this.isWahaMode()) {
      const contacts = await this.wahaProvider.getContacts(workspaceId);
      return Array.isArray(contacts) ? contacts : [];
    }
    const contacts = await this.metaCloudProvider.getContacts(workspaceId);
    return Array.isArray(contacts) ? contacts : [];
  }

  async upsertContactProfile(
    workspaceId: string,
    contact: { phone: string; name?: string | null },
  ): Promise<boolean> {
    if (this.isWahaMode()) {
      return this.wahaProvider.upsertContactProfile(workspaceId, contact);
    }
    return this.metaCloudProvider.upsertContactProfile(workspaceId, contact);
  }

  async getChats(workspaceId: string): Promise<unknown[]> {
    if (this.isWahaMode()) {
      const chats = await this.wahaProvider.getChats(workspaceId);
      return Array.isArray(chats) ? chats : [];
    }
    const chats = await this.metaCloudProvider.getChats(workspaceId);
    return Array.isArray(chats) ? chats : [];
  }

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

  async readChatMessages(workspaceId: string, chatId: string): Promise<void> {
    if (this.isWahaMode()) {
      return this.wahaProvider.sendSeen(workspaceId, chatId);
    }
    return this.metaCloudProvider.readChatMessages(workspaceId, chatId);
  }

  async setPresence(
    workspaceId: string,
    presence: 'available' | 'offline',
    chatId?: string,
  ): Promise<void> {
    if (this.isWahaMode()) return; // WAHA does not support presence API
    return this.metaCloudProvider.setPresence(workspaceId, presence, chatId);
  }

  async sendTyping(workspaceId: string, chatId: string): Promise<void> {
    if (this.isWahaMode()) return;
    return this.metaCloudProvider.sendTyping(workspaceId, chatId);
  }

  async stopTyping(workspaceId: string, chatId: string): Promise<void> {
    if (this.isWahaMode()) return;
    return this.metaCloudProvider.stopTyping(workspaceId, chatId);
  }

  async sendSeen(workspaceId: string, chatId: string): Promise<void> {
    if (this.isWahaMode()) {
      return this.wahaProvider.sendSeen(workspaceId, chatId);
    }
    return this.metaCloudProvider.sendSeen(workspaceId, chatId);
  }

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

  async getSessionDiagnostics(workspaceId: string): Promise<Record<string, any>> {
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

  async listLidMappings(workspaceId: string): Promise<Array<{ lid: string; pn: string }>> {
    if (this.isWahaMode()) {
      return this.wahaProvider.listLidMappings(workspaceId);
    }
    return this.metaCloudProvider.listLidMappings(workspaceId);
  }
}
