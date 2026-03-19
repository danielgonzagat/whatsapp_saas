import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppApiProvider } from './whatsapp-api.provider';

/**
 * =====================================================================
 * WhatsApp Provider Registry
 *
 * Runtime consolidado em WAHA. Qualquer provider legado encontrado no
 * workspace é normalizado automaticamente para `whatsapp-api`.
 * =====================================================================
 */

export type WhatsAppProviderType = 'whatsapp-api';

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
  qrCode?: string;
}

@Injectable()
export class WhatsAppProviderRegistry {
  private readonly logger = new Logger(WhatsAppProviderRegistry.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappApi: WhatsAppApiProvider,
  ) {}

  async getProviderType(workspaceId: string): Promise<WhatsAppProviderType> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) {
      this.logger.warn(
        `Workspace ${workspaceId} not found while resolving provider`,
      );
      throw new Error('workspace_not_found');
    }

    const settings = (workspace.providerSettings as any) || {};
    const currentProvider = settings?.whatsappProvider;

    if (currentProvider !== 'whatsapp-api') {
      this.logger.warn(
        `Workspace ${workspaceId} estava com provider legado (${currentProvider || 'none'}). Migrando runtime para WAHA.`,
      );
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: {
            ...settings,
            whatsappProvider: 'whatsapp-api',
          },
        },
      });
    }

    return 'whatsapp-api';
  }

  private async persistSessionSnapshot(
    workspaceId: string,
    update: {
      status: string;
      qrCode?: string | null;
      provider?: string;
      disconnectReason?: string | null;
      phoneNumber?: string | null;
      pushName?: string | null;
      sessionName?: string | null;
    },
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) return;

    const settings = (workspace.providerSettings as any) || {};
    const currentSession = settings.whatsappApiSession || {};

    await this.prisma.workspace.update({
      where: { id: workspaceId },
        data: {
          providerSettings: {
            ...settings,
            whatsappProvider: 'whatsapp-api',
            connectionStatus: update.status,
            whatsappApiSession: {
              ...currentSession,
              ...update,
            lastUpdated: new Date().toISOString(),
          },
        },
      },
    });
  }

  async startSession(
    workspaceId: string,
  ): Promise<{ success: boolean; qrCode?: string; message?: string }> {
    const sessionName = this.whatsappApi.getResolvedSessionId(workspaceId);
    try {
      await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, message: err?.message || 'workspace_not_found' };
    }

    await this.persistSessionSnapshot(workspaceId, {
      status: 'starting',
      qrCode: null,
      provider: 'whatsapp-api',
      disconnectReason: null,
      sessionName,
    });

    const result = await this.whatsappApi.startSession(workspaceId);
    if (!result.success) {
      await this.persistSessionSnapshot(workspaceId, {
        status: 'error',
        qrCode: null,
        provider: 'whatsapp-api',
        disconnectReason: result.message || null,
        sessionName,
      });
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const status = await this.getSessionStatus(workspaceId);

    return {
      success: true,
      qrCode: status.qrCode,
      message: status.connected ? 'already_connected' : result.message,
    };
  }

  async getSessionStatus(workspaceId: string): Promise<SessionStatus> {
    const sessionName = this.whatsappApi.getResolvedSessionId(workspaceId);
    try {
      await this.getProviderType(workspaceId);
    } catch {
      return {
        connected: false,
        status: 'workspace_not_found',
        qrCode: undefined,
      };
    }

    try {
      const status = await this.whatsappApi.getSessionStatus(workspaceId);

      const qr =
        status.state === 'SCAN_QR_CODE'
          ? await this.whatsappApi.getQrCode(workspaceId)
          : null;

      const normalizedStatus =
        status.state === 'CONNECTED'
          ? 'connected'
          : status.state === 'SCAN_QR_CODE'
            ? 'qr_pending'
            : status.state?.toLowerCase() || 'disconnected';

      await this.persistSessionSnapshot(workspaceId, {
        status: normalizedStatus,
        qrCode: qr?.qr || null,
        provider: 'whatsapp-api',
        disconnectReason:
          normalizedStatus === 'connected' ? null : status.message || null,
        phoneNumber: status.phoneNumber || null,
        pushName: status.pushName || null,
        sessionName,
      });

      return {
        connected: status.state === 'CONNECTED',
        status: status.state || 'unknown',
        phoneNumber: status.phoneNumber || undefined,
        pushName: status.pushName || undefined,
        qrCode: qr?.qr,
      };
    } catch (err: any) {
      await this.persistSessionSnapshot(workspaceId, {
        status: 'error',
        qrCode: null,
        provider: 'whatsapp-api',
        disconnectReason: err?.message || 'unknown_error',
        sessionName,
      });
      return { connected: false, status: 'error', qrCode: undefined };
    }
  }

  async sendMessage(
    workspaceId: string,
    to: string,
    message: string,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    try {
      await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, error: err?.message || 'workspace_not_found' };
    }

    this.logger.log(`Sending message via whatsapp-api to ${to}`);

    try {
      if (options?.mediaUrl) {
        const mediaResult = await this.whatsappApi.sendMediaFromUrl(
          workspaceId,
          to,
          options.mediaUrl,
          options.caption || message,
          options.mediaType || 'image',
        );
        return {
          success: mediaResult.success,
          messageId: mediaResult.message?.id?._serialized,
        };
      }

      const textResult = await this.whatsappApi.sendMessage(
        workspaceId,
        to,
        message,
        {
          quotedMessageId: options?.quotedMessageId,
        },
      );
      return {
        success: textResult.success,
        messageId: textResult.message?.id?._serialized,
      };
    } catch (err: any) {
      this.logger.error(`Send message failed: ${err.message}`);
      return { success: false, error: err.message };
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
    const sessionName = this.whatsappApi.getResolvedSessionId(workspaceId);
    try {
      await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, message: err?.message || 'workspace_not_found' };
    }

    const result = await this.whatsappApi.terminateSession(workspaceId);
    await this.persistSessionSnapshot(workspaceId, {
      status: 'disconnected',
      qrCode: null,
      provider: 'whatsapp-api',
      disconnectReason: null,
      sessionName,
    });
    return result;
  }

  async logout(
    workspaceId: string,
  ): Promise<{ success: boolean; message?: string }> {
    const sessionName = this.whatsappApi.getResolvedSessionId(workspaceId);
    try {
      await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, message: err?.message || 'workspace_not_found' };
    }

    const result = await this.whatsappApi.logoutSession(workspaceId);
    await this.persistSessionSnapshot(workspaceId, {
      status: 'disconnected',
      qrCode: null,
      provider: 'whatsapp-api',
      disconnectReason: null,
      sessionName,
    });
    return result;
  }

  async isRegistered(workspaceId: string, phone: string): Promise<boolean> {
    try {
      await this.getProviderType(workspaceId);
    } catch {
      return false;
    }

    return this.whatsappApi.isRegisteredUser(workspaceId, phone);
  }

  async healthCheck(): Promise<{ whatsappApi: boolean }> {
    const whatsappApiOk = await this.whatsappApi.ping();
    return { whatsappApi: whatsappApiOk };
  }
}
