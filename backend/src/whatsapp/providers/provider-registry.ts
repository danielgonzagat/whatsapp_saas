import { Injectable, Optional  } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { asProviderSettings } from '../provider-settings.types';
import type { ProviderSessionSnapshot } from '../provider-settings.types';
import { extractPhoneFromChatId as normalizePhoneFromChatId } from '../whatsapp-normalization.util';
import { resolveDefaultWhatsAppProvider } from './provider-env';
import { WahaProvider } from './waha.provider';
import { WhatsAppApiProvider } from './whatsapp-api.provider';
import type {
  WhatsAppProviderType,
  SendMessageOptions,
  SendResult,
  SessionStatus,
} from './provider-registry.types';
import {
  readRecord,
  persistSessionSnapshot,
  startSession as startSessionFn,
  getSessionStatus as getSessionStatusFn,
  getQrCode as getQrCodeFn,
} from './provider-registry-session';
import {
  sendMessage as sendMessageFn,
  sendMedia as sendMediaFn,
} from './provider-registry-messaging';
import {
  disconnect as disconnectFn,
  logout as logoutFn,
  restartSession as restartSessionFn,
  deleteSession as deleteSessionFn,
  syncSessionConfig as syncSessionConfigFn,
} from './provider-registry-op';
import {
  isRegistered as isRegisteredFn,
  getClientInfo as getClientInfoFn,
  getContacts as getContactsFn,
  upsertContactProfile as upsertContactProfileFn,
  getChats as getChatsFn,
  getChatMessages as getChatMessagesFn,
  readChatMessages as readChatMessagesFn,
  setPresence as setPresenceFn,
  sendTyping as sendTypingFn,
  stopTyping as stopTypingFn,
  sendSeen as sendSeenFn,
  healthCheck as healthCheckFn,
  getSessionDiagnostics as getSessionDiagnosticsFn,
  listLidMappings as listLidMappingsFn,
} from './provider-registry-contacts';

export { SessionStatus } from './provider-registry.types';

@Injectable()
export class WhatsAppProviderRegistry {
  private readonly logger = StructuredLogger.from(WhatsAppProviderRegistry.name);
  private readonly defaultProvider: WhatsAppProviderType;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaCloudProvider: WhatsAppApiProvider,
    @Optional() private readonly wahaProvider?: WahaProvider,
    @Optional() private readonly opsAlert?: OpsAlertService,
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

  async getProviderType(workspaceId: string): Promise<WhatsAppProviderType> {
    const provider = await this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      if (!workspace) {
        throw new Error('workspace_not_found');
      }

      const settings = asProviderSettings(workspace.providerSettings);
      const current = String(settings.whatsappProvider || '').trim();
      if (current !== this.defaultProvider) {
        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            providerSettings: JSON.parse(
              JSON.stringify({
                ...settings,
                whatsappProvider: this.defaultProvider,
              }),
            ) as Prisma.InputJsonObject,
          },
        });
      }
      return this.defaultProvider;
    });
    return provider;
  }

  private buildSessionDeps() {
    return {
      prisma: this.prisma,
      metaCloudProvider: this.metaCloudProvider,
      wahaProvider: this.wahaProvider,
      defaultProvider: this.defaultProvider,
      isWahaMode: () => this.isWahaMode(),
      getProviderType: (wsId: string) => this.getProviderType(wsId),
    };
  }

  private buildOpDeps() {
    return {
      isWahaMode: () => this.isWahaMode(),
      wahaProvider: this.wahaProvider,
      metaCloudProvider: this.metaCloudProvider,
      persistSessionSnapshot: (wsId: string, update: Partial<ProviderSessionSnapshot>) =>
        persistSessionSnapshot(this.prisma, this.defaultProvider, wsId, update),
    };
  }

  private buildContactsDeps() {
    return {
      isWahaMode: () => this.isWahaMode(),
      wahaProvider: this.wahaProvider,
      metaCloudProvider: this.metaCloudProvider,
      getSessionStatus: (wsId: string) => this.getSessionStatus(wsId),
    };
  }

  private buildMessagingDeps() {
    return {
      isWahaMode: () => this.isWahaMode(),
      wahaProvider: this.wahaProvider,
      metaCloudProvider: this.metaCloudProvider,
      opsAlert: this.opsAlert,
      logger: this.logger,
      readRecord,
    };
  }

  async startSession(workspaceId: string): Promise<{
    success: boolean;
    qrCode?: string;
    message?: string;
    authUrl?: string;
  }> {
    return startSessionFn(this.buildSessionDeps(), workspaceId);
  }

  async getSessionStatus(workspaceId: string): Promise<SessionStatus> {
    return getSessionStatusFn(this.buildSessionDeps(), workspaceId);
  }

  async getQrCode(
    workspaceId: string,
  ): Promise<{ success: boolean; qr?: string; message?: string }> {
    return getQrCodeFn(this.buildSessionDeps(), workspaceId);
  }

  async sendMessage(
    workspaceId: string,
    to: string,
    message: string,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    return sendMessageFn(this.buildMessagingDeps(), workspaceId, to, message, options);
  }

  async sendMedia(
    workspaceId: string,
    to: string,
    mediaUrl: string,
    options?: { caption?: string; mediaType?: 'image' | 'video' | 'audio' | 'document' },
  ): Promise<SendResult> {
    return sendMediaFn(this.buildMessagingDeps(), workspaceId, to, mediaUrl, options);
  }

  async disconnect(workspaceId: string): Promise<{ success: boolean; message?: string }> {
    return disconnectFn(this.buildOpDeps(), workspaceId);
  }

  async logout(workspaceId: string): Promise<{ success: boolean; message?: string }> {
    return logoutFn(this.buildOpDeps(), workspaceId);
  }

  async restartSession(
    workspaceId: string,
  ): Promise<{ success: boolean; message?: string; qrCode?: string; authUrl?: string }> {
    return restartSessionFn(this.buildOpDeps(), workspaceId);
  }

  async deleteSession(workspaceId: string): Promise<boolean> {
    return deleteSessionFn(this.buildOpDeps(), workspaceId);
  }

  async syncSessionConfig(workspaceId: string): Promise<void> {
    return syncSessionConfigFn(this.buildOpDeps(), workspaceId);
  }

  async isRegistered(workspaceId: string, phone: string): Promise<boolean> {
    return isRegisteredFn(this.buildContactsDeps(), workspaceId, phone);
  }

  async getClientInfo(workspaceId: string): Promise<unknown> {
    return getClientInfoFn(this.buildContactsDeps(), workspaceId);
  }

  async getContacts(workspaceId: string): Promise<unknown[]> {
    return getContactsFn(this.buildContactsDeps(), workspaceId);
  }

  async upsertContactProfile(
    workspaceId: string,
    contact: { phone: string; name?: string | null },
  ): Promise<boolean> {
    return upsertContactProfileFn(this.buildContactsDeps(), workspaceId, contact);
  }

  async getChats(workspaceId: string): Promise<unknown[]> {
    return getChatsFn(this.buildContactsDeps(), workspaceId);
  }

  async getChatMessages(
    workspaceId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<unknown[]> {
    return getChatMessagesFn(this.buildContactsDeps(), workspaceId, chatId, options);
  }

  async readChatMessages(workspaceId: string, chatId: string): Promise<void> {
    return readChatMessagesFn(this.buildContactsDeps(), workspaceId, chatId);
  }

  async setPresence(
    workspaceId: string,
    presence: 'available' | 'offline',
    chatId?: string,
  ): Promise<void> {
    return setPresenceFn(this.buildContactsDeps(), workspaceId, presence, chatId);
  }

  async sendTyping(workspaceId: string, chatId: string): Promise<void> {
    return sendTypingFn(this.buildContactsDeps(), workspaceId, chatId);
  }

  async stopTyping(workspaceId: string, chatId: string): Promise<void> {
    return stopTypingFn(this.buildContactsDeps(), workspaceId, chatId);
  }

  async sendSeen(workspaceId: string, chatId: string): Promise<void> {
    return sendSeenFn(this.buildContactsDeps(), workspaceId, chatId);
  }

  async healthCheck(): Promise<{ whatsappApi: boolean; whatsappWebAgent: boolean }> {
    return healthCheckFn(this.buildContactsDeps());
  }

  async getSessionDiagnostics(workspaceId: string): Promise<Record<string, unknown>> {
    return getSessionDiagnosticsFn(this.buildContactsDeps(), workspaceId);
  }

  async listLidMappings(workspaceId: string): Promise<Array<{ lid: string; pn: string }>> {
    return listLidMappingsFn(this.buildContactsDeps(), workspaceId);
  }
}
