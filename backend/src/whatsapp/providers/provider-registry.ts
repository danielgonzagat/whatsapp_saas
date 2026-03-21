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

  private async getPersistedSessionSnapshot(workspaceId: string): Promise<{
    status?: string;
    phoneNumber?: string | null;
    pushName?: string | null;
    qrCode?: string | null;
  } | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = (workspace?.providerSettings as any) || {};
    const session = settings?.whatsappApiSession || {};

    if (!workspace) {
      return null;
    }

    return {
      status: typeof session?.status === 'string' ? session.status : undefined,
      phoneNumber: session?.phoneNumber || null,
      pushName: session?.pushName || null,
      qrCode: session?.qrCode || null,
    };
  }

  private isSessionMissingMessage(message?: string | null): boolean {
    const normalized = String(message || '').toLowerCase();
    return (
      normalized.includes('session') &&
      (normalized.includes('does not exist') ||
        normalized.includes('not found') ||
        normalized.includes('404'))
    );
  }

  private mapProviderStateToSnapshotStatus(state?: string | null): string {
    const normalized = String(state || '')
      .trim()
      .toUpperCase();

    switch (normalized) {
      case 'CONNECTED':
        return 'connected';
      case 'SCAN_QR_CODE':
        return 'qr_pending';
      case 'STARTING':
      case 'OPENING':
        return 'starting';
      case 'DISCONNECTED':
      case 'STOPPED':
      case 'LOGGED_OUT':
        return 'disconnected';
      case 'FAILED':
        return 'failed';
      default:
        return normalized ? normalized.toLowerCase() : 'unknown';
    }
  }

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
      rawStatus?: string | null;
      connectedAt?: string | null;
      lastCatchupError?: string | null;
      lastCatchupFailedAt?: string | null;
      recoveryBlockedReason?: string | null;
      recoveryBlockedAt?: string | null;
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
      phoneNumber: null,
      pushName: null,
      connectedAt: null,
      recoveryBlockedReason: null,
      recoveryBlockedAt: null,
    });

    const result = await this.whatsappApi.startSession(workspaceId);
    if (!result.success) {
      await this.persistSessionSnapshot(workspaceId, {
        status: 'error',
        qrCode: null,
        provider: 'whatsapp-api',
        disconnectReason: result.message || null,
        sessionName,
        phoneNumber: null,
        pushName: null,
        connectedAt: null,
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

    const persistedSnapshot =
      await this.getPersistedSessionSnapshot(workspaceId);

    try {
      const status = await this.whatsappApi.getSessionStatus(workspaceId);

      if (status.success && status.state) {
        await this.whatsappApi.syncSessionConfig(workspaceId);
      }

      if (!status.success || !status.state) {
        const sessionMissing = this.isSessionMissingMessage(status.message);
        await this.persistSessionSnapshot(workspaceId, {
          status: sessionMissing ? 'disconnected' : 'unknown',
          qrCode: null,
          provider: 'whatsapp-api',
          disconnectReason: status.message || 'unknown_status',
          phoneNumber: sessionMissing ? null : undefined,
          pushName: sessionMissing ? null : undefined,
          connectedAt: sessionMissing ? null : undefined,
          rawStatus: status.message || null,
          sessionName,
        });

        return {
          connected: false,
          status: sessionMissing ? 'DISCONNECTED' : 'UNKNOWN',
          phoneNumber: sessionMissing
            ? undefined
            : persistedSnapshot?.phoneNumber || undefined,
          pushName: sessionMissing
            ? undefined
            : persistedSnapshot?.pushName || undefined,
          qrCode: sessionMissing
            ? undefined
            : persistedSnapshot?.qrCode || undefined,
        };
      }

      const qr =
        status.state === 'SCAN_QR_CODE'
          ? await this.whatsappApi.getQrCode(workspaceId)
          : null;
      const connected = status.state === 'CONNECTED';
      const normalizedStatus = this.mapProviderStateToSnapshotStatus(
        status.state,
      );
      const resolvedPhoneNumber = connected
        ? status.phoneNumber || persistedSnapshot?.phoneNumber || null
        : null;
      const resolvedPushName = connected
        ? status.pushName || persistedSnapshot?.pushName || null
        : null;

      const snapshotUpdate: {
        status: string;
        qrCode?: string | null;
        provider?: string;
        disconnectReason?: string | null;
        phoneNumber?: string | null;
        pushName?: string | null;
        sessionName?: string | null;
        rawStatus?: string | null;
        connectedAt?: string | null;
        recoveryBlockedReason?: string | null;
        recoveryBlockedAt?: string | null;
      } = {
        status: normalizedStatus,
        qrCode: status.state === 'SCAN_QR_CODE' ? qr?.qr || null : null,
        provider: 'whatsapp-api',
        disconnectReason: connected ? null : status.message || status.state,
        phoneNumber: resolvedPhoneNumber,
        pushName: resolvedPushName,
        sessionName,
        rawStatus: status.message || status.state || null,
        connectedAt: connected ? undefined : null,
      };

      if (connected) {
        snapshotUpdate.recoveryBlockedReason = null;
        snapshotUpdate.recoveryBlockedAt = null;
      }

      await this.persistSessionSnapshot(workspaceId, snapshotUpdate);

      return {
        connected,
        status: status.state || 'UNKNOWN',
        phoneNumber: resolvedPhoneNumber || undefined,
        pushName: resolvedPushName || undefined,
        qrCode:
          status.state === 'SCAN_QR_CODE' ? qr?.qr || undefined : undefined,
      };
    } catch (err: any) {
      await this.persistSessionSnapshot(workspaceId, {
        status: 'unknown',
        qrCode: null,
        provider: 'whatsapp-api',
        disconnectReason: err?.message || 'unknown_error',
        rawStatus: err?.message || 'unknown_error',
        sessionName,
      });
      return {
        connected: false,
        status: 'UNKNOWN',
        phoneNumber: persistedSnapshot?.phoneNumber || undefined,
        pushName: persistedSnapshot?.pushName || undefined,
        qrCode: persistedSnapshot?.qrCode || undefined,
      };
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
      phoneNumber: null,
      pushName: null,
      connectedAt: null,
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
      phoneNumber: null,
      pushName: null,
      connectedAt: null,
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
