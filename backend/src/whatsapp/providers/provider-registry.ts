import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppApiProvider } from './whatsapp-api.provider';
import { asProviderSettings } from '../provider-settings.types';

export type WhatsAppProviderType = 'meta-cloud';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappApi: WhatsAppApiProvider,
  ) {}

  extractPhoneFromChatId(chatId: string): string {
    return String(chatId || '')
      .replace(/@.+$/, '')
      .replace(/\D/g, '');
  }

  private async persistSessionSnapshot(
    workspaceId: string,
    update: Record<string, any>,
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
          whatsappProvider: 'meta-cloud',
          connectionStatus: update.status || currentSession.status || 'unknown',
          whatsappApiSession: {
            ...currentSession,
            ...update,
            provider: 'meta-cloud',
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

    if (!workspace) {
      throw new Error('workspace_not_found');
    }

    const settings = asProviderSettings(workspace.providerSettings);
    if (String(settings.whatsappProvider || '').trim() !== 'meta-cloud') {
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: {
            ...settings,
            whatsappProvider: 'meta-cloud',
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return 'meta-cloud';
  }

  async startSession(workspaceId: string): Promise<{
    success: boolean;
    qrCode?: string;
    message?: string;
    authUrl?: string;
  }> {
    await this.getProviderType(workspaceId);
    const result = await this.whatsappApi.startSession(workspaceId);
    await this.persistSessionSnapshot(workspaceId, {
      status:
        result.message === 'already_connected'
          ? 'connected'
          : 'connection_required',
      qrCode: null,
      authUrl: result.authUrl || null,
      sessionName: workspaceId,
    });
    return result;
  }

  async getSessionStatus(workspaceId: string): Promise<SessionStatus> {
    await this.getProviderType(workspaceId);
    const details =
      await this.whatsappApi.getSessionConfigDiagnostics(workspaceId);

    const status: SessionStatus = {
      connected: details.state === 'CONNECTED',
      status: details.state || 'DISCONNECTED',
      phoneNumber: details.phoneNumber || undefined,
      pushName: details.pushName || undefined,
      selfIds: [],
      authUrl: details.authUrl,
      phoneNumberId: details.phoneNumberId,
      whatsappBusinessId: details.whatsappBusinessId,
      degradedReason: details.error || null,
    };

    await this.persistSessionSnapshot(workspaceId, {
      status: status.connected
        ? 'connected'
        : status.status === 'CONNECTION_INCOMPLETE'
          ? 'connection_incomplete'
          : status.status === 'DEGRADED'
            ? 'degraded'
            : 'disconnected',
      phoneNumber: status.phoneNumber || null,
      pushName: status.pushName || null,
      selfIds: status.selfIds || [],
      sessionName: workspaceId,
      authUrl: status.authUrl || null,
      phoneNumberId: status.phoneNumberId || null,
      whatsappBusinessId: status.whatsappBusinessId || null,
      disconnectReason: status.connected ? null : status.degradedReason || null,
      qrCode: null,
    });

    return status;
  }

  async sendMessage(
    workspaceId: string,
    to: string,
    message: string,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    try {
      const result = options?.mediaUrl
        ? await this.whatsappApi.sendMediaFromUrl(
            workspaceId,
            to,
            options.mediaUrl,
            options.caption || message,
            options.mediaType || 'image',
            {
              quotedMessageId: options.quotedMessageId,
            },
          )
        : await this.whatsappApi.sendMessage(workspaceId, to, message, {
            quotedMessageId: options?.quotedMessageId,
          });

      return {
        success: Boolean(result?.success),
        messageId: result?.message?.id || undefined,
      };
    } catch (error: any) {
      this.logger.error(`Meta send failed: ${error?.message || error}`);
      return {
        success: false,
        error: error?.message || 'meta_send_failed',
      };
    }
  }

  async sendMedia(
    workspaceId: string,
    to: string,
    mediaUrl: string,
    options?: {
      caption?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
    },
  ): Promise<SendResult> {
    return this.sendMessage(workspaceId, to, options?.caption || '', {
      mediaUrl,
      caption: options?.caption,
      mediaType: options?.mediaType,
    });
  }

  async disconnect(
    workspaceId: string,
  ): Promise<{ success: boolean; message?: string }> {
    await this.persistSessionSnapshot(workspaceId, {
      status: 'disconnected',
      qrCode: null,
      disconnectReason: 'disconnected_by_user',
    });
    return {
      success: true,
      message: 'Meta WhatsApp channel marked as disconnected locally',
    };
  }

  async logout(
    workspaceId: string,
  ): Promise<{ success: boolean; message?: string }> {
    return this.disconnect(workspaceId);
  }

  async isRegistered(workspaceId: string, phone: string): Promise<boolean> {
    await this.getProviderType(workspaceId);
    return this.whatsappApi.isRegisteredUser(workspaceId, phone);
  }

  async healthCheck(): Promise<{
    whatsappApi: boolean;
    whatsappWebAgent: boolean;
  }> {
    return {
      whatsappApi: await this.whatsappApi.ping(),
      whatsappWebAgent: false,
    };
  }

  async getQrCode(
    workspaceId: string,
  ): Promise<{ success: boolean; qr?: string; message?: string }> {
    await this.getProviderType(workspaceId);
    return this.whatsappApi.getQrCode(workspaceId);
  }

  async getClientInfo(workspaceId: string): Promise<unknown> {
    return this.whatsappApi.getClientInfo(workspaceId);
  }

  async getContacts(workspaceId: string): Promise<unknown[]> {
    const contacts = await this.whatsappApi.getContacts(workspaceId);
    return Array.isArray(contacts) ? contacts : [];
  }

  async upsertContactProfile(
    workspaceId: string,
    contact: { phone: string; name?: string | null },
  ): Promise<boolean> {
    return this.whatsappApi.upsertContactProfile(workspaceId, contact);
  }

  async getChats(workspaceId: string): Promise<unknown[]> {
    const chats = await this.whatsappApi.getChats(workspaceId);
    return Array.isArray(chats) ? chats : [];
  }

  async getChatMessages(
    workspaceId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<unknown[]> {
    const messages = await this.whatsappApi.getChatMessages(
      workspaceId,
      chatId,
      options,
    );
    return Array.isArray(messages) ? messages : [];
  }

  async readChatMessages(workspaceId: string, chatId: string): Promise<void> {
    await this.whatsappApi.readChatMessages(workspaceId, chatId);
  }

  async setPresence(
    workspaceId: string,
    presence: 'available' | 'offline',
    chatId?: string,
  ): Promise<void> {
    await this.whatsappApi.setPresence(workspaceId, presence, chatId);
  }

  async sendTyping(workspaceId: string, chatId: string): Promise<void> {
    await this.whatsappApi.sendTyping(workspaceId, chatId);
  }

  async stopTyping(workspaceId: string, chatId: string): Promise<void> {
    await this.whatsappApi.stopTyping(workspaceId, chatId);
  }

  async sendSeen(workspaceId: string, chatId: string): Promise<void> {
    await this.whatsappApi.sendSeen(workspaceId, chatId);
  }

  async getSessionDiagnostics(workspaceId: string): Promise<
    Record<string, any> & {
      available?: boolean;
      providerType?: WhatsAppProviderType;
      status?: SessionStatus | string;
      configMismatch?: boolean;
      webhookConfigured?: boolean;
      inboundEventsConfigured?: boolean;
      storeEnabled?: boolean;
    }
  > {
    const diagnostics =
      await this.whatsappApi.getSessionConfigDiagnostics(workspaceId);
    return {
      ...diagnostics,
      providerType: 'meta-cloud',
      status: await this.getSessionStatus(workspaceId),
    };
  }

  async restartSession(workspaceId: string): Promise<{
    success: boolean;
    message?: string;
    qrCode?: string;
    authUrl?: string;
  }> {
    return this.whatsappApi.restartSession(workspaceId);
  }

  async syncSessionConfig(workspaceId: string): Promise<void> {
    await this.whatsappApi.syncSessionConfig(workspaceId);
  }

  async deleteSession(workspaceId: string): Promise<boolean> {
    return this.whatsappApi.deleteSession(workspaceId);
  }

  async listLidMappings(
    workspaceId: string,
  ): Promise<Array<{ lid: string; pn: string }>> {
    return this.whatsappApi.listLidMappings(workspaceId);
  }
}
