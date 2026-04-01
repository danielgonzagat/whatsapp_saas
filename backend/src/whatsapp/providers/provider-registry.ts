import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WhatsAppApiProvider,
  type WahaSessionOverview,
} from './whatsapp-api.provider';
import { WhatsAppWebAgentProvider } from './web-agent.provider';
import { asProviderSettings } from '../provider-settings.types';

/**
 * =====================================================================
 * WhatsApp Provider Registry
 *
 * Runtime principal em browser session. WAHA permanece apenas como legado
 * controlado até a remoção definitiva do código.
 * =====================================================================
 */

export type WhatsAppProviderType = 'whatsapp-api' | 'whatsapp-web-agent';

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
}

/** Message payload shape varies across providers; narrow via property checks. */
interface MessagePayload {
  message?: { id?: { _serialized?: string; id?: string } | string };
  messages?: Array<{ id?: { _serialized?: string; id?: string } | string }>;
  id?: { _serialized?: string; id?: string } | string;
  messageId?: string;
  key?: { id?: string };
}

type ProviderInstance = WhatsAppApiProvider | WhatsAppWebAgentProvider;

@Injectable()
export class WhatsAppProviderRegistry {
  private readonly logger = new Logger(WhatsAppProviderRegistry.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly whatsappWebAgent: WhatsAppWebAgentProvider,
  ) {}

  private isBrowserOnlyMode(): boolean {
    const explicit = String(process.env.WHATSAPP_BROWSER_ONLY || '')
      .trim()
      .toLowerCase();
    if (explicit) {
      return explicit !== 'false';
    }

    return (
      String(process.env.WHATSAPP_PROVIDER_DEFAULT || '').trim() ===
      'whatsapp-web-agent'
    );
  }

  private extractMessageId(
    payload: MessagePayload | undefined,
  ): string | undefined {
    if (!payload) return undefined;
    const msgId = payload.message?.id;
    const firstMsgId = payload.messages?.[0]?.id;
    const topId = payload.id;
    const candidates = [
      typeof msgId === 'object' ? msgId?._serialized : undefined,
      typeof msgId === 'object' ? msgId?.id : undefined,
      typeof msgId === 'string' ? msgId : undefined,
      typeof firstMsgId === 'object' ? firstMsgId?._serialized : undefined,
      typeof firstMsgId === 'object' ? firstMsgId?.id : undefined,
      typeof firstMsgId === 'string' ? firstMsgId : undefined,
      typeof topId === 'object' ? topId?._serialized : undefined,
      typeof topId === 'object' ? topId?.id : undefined,
      typeof topId === 'string' ? topId : undefined,
      payload.messageId,
      payload.key?.id,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const normalized = candidate.trim();
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private async resolveProvider(workspaceId: string): Promise<{
    providerType: WhatsAppProviderType;
    provider: ProviderInstance;
  }> {
    const providerType = await this.getProviderType(workspaceId);
    return {
      providerType,
      provider:
        providerType === 'whatsapp-web-agent'
          ? this.whatsappWebAgent
          : this.whatsappApi,
    };
  }

  extractPhoneFromChatId(chatId: string): string {
    const raw = String(chatId || '').trim();
    if (!raw) return '';

    const withoutSuffix = raw.replace(/@.+$/, '');
    const normalized = withoutSuffix.replace(/\D/g, '');
    return normalized || withoutSuffix.replace(/[^\d]+/g, '');
  }

  private normalizeSessionStatusShape(
    status: Partial<SessionStatus>,
  ): SessionStatus {
    return {
      connected: Boolean(status?.connected),
      status: String(status?.status || 'UNKNOWN'),
      phoneNumber: status?.phoneNumber || undefined,
      pushName: status?.pushName || undefined,
      selfIds: Array.isArray(status?.selfIds) ? status.selfIds : [],
      qrCode: status?.qrCode || undefined,
    };
  }

  private async getPersistedSessionSnapshot(workspaceId: string): Promise<{
    status?: string;
    phoneNumber?: string | null;
    pushName?: string | null;
    qrCode?: string | null;
    sessionName?: string | null;
  } | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = asProviderSettings(workspace?.providerSettings);
    const session =
      settings?.whatsappWebSession || settings?.whatsappApiSession || {};

    if (!workspace) {
      return null;
    }

    return {
      status: typeof session?.status === 'string' ? session.status : undefined,
      phoneNumber: session?.phoneNumber || null,
      pushName: session?.pushName || null,
      qrCode: session?.qrCode || null,
      sessionName: session?.sessionName || null,
    };
  }

  private resolveSessionNameForWorkspace(
    workspaceId: string,
    persistedSnapshot?: { sessionName?: string | null } | null,
  ): string {
    const persistedSessionName = String(
      persistedSnapshot?.sessionName || '',
    ).trim();

    if (persistedSessionName) {
      return persistedSessionName;
    }

    return this.whatsappApi.getResolvedSessionId(workspaceId);
  }

  private normalizePhone(value?: string | null): string {
    return String(value || '').replace(/\D/g, '');
  }

  private normalizeName(value?: string | null): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private matchSessionIdentity(
    session: WahaSessionOverview,
    identity: { phoneNumber?: string | null; pushName?: string | null },
  ): boolean {
    const targetPhone = this.normalizePhone(identity.phoneNumber);
    const targetName = this.normalizeName(identity.pushName);
    const sessionPhone = this.normalizePhone(session.phoneNumber);
    const sessionName = this.normalizeName(session.pushName);

    if (targetPhone && sessionPhone && targetPhone === sessionPhone) {
      return true;
    }

    if (targetName && sessionName && targetName === sessionName) {
      return true;
    }

    return false;
  }

  private async tryRecoverSessionAlias(
    workspaceId: string,
    persistedSnapshot: {
      status?: string;
      phoneNumber?: string | null;
      pushName?: string | null;
      qrCode?: string | null;
      sessionName?: string | null;
    } | null,
    currentSessionName: string,
  ): Promise<SessionStatus | null> {
    if (!persistedSnapshot?.phoneNumber && !persistedSnapshot?.pushName) {
      return null;
    }

    let sessions: WahaSessionOverview[] = [];
    try {
      sessions = await this.whatsappApi.listSessions();
    } catch (error: any) {
      this.logger.warn(
        `Failed to inspect WAHA sessions while recovering alias for ${workspaceId}: ${String(
          error?.message || 'unknown_error',
        )}`,
      );
      return null;
    }

    const matching = sessions
      .filter(
        (session) => String(session.state || '').toUpperCase() === 'CONNECTED',
      )
      .filter((session) => session.name !== currentSessionName)
      .filter((session) =>
        this.matchSessionIdentity(session, {
          phoneNumber: persistedSnapshot.phoneNumber,
          pushName: persistedSnapshot.pushName,
        }),
      )
      .sort((left, right) => {
        const leftScore =
          (left.state === 'CONNECTED' ? 4 : 0) +
          (left.phoneNumber ? 2 : 0) +
          (left.pushName ? 1 : 0);
        const rightScore =
          (right.state === 'CONNECTED' ? 4 : 0) +
          (right.phoneNumber ? 2 : 0) +
          (right.pushName ? 1 : 0);
        return rightScore - leftScore;
      });

    const recovered = matching[0];
    if (!recovered) {
      return null;
    }

    const normalizedStatus = this.mapProviderStateToSnapshotStatus(
      recovered.state,
    );
    await this.persistSessionSnapshot(workspaceId, {
      status: normalizedStatus,
      qrCode: null,
      provider: 'whatsapp-api',
      disconnectReason:
        recovered.state === 'CONNECTED' ? null : recovered.rawStatus,
      phoneNumber:
        recovered.state === 'CONNECTED'
          ? recovered.phoneNumber || persistedSnapshot.phoneNumber || null
          : null,
      pushName:
        recovered.state === 'CONNECTED'
          ? recovered.pushName || persistedSnapshot.pushName || null
          : null,
      connectedAt:
        recovered.state === 'CONNECTED' ? new Date().toISOString() : null,
      sessionName: recovered.name,
      rawStatus: recovered.rawStatus,
      recoveryBlockedReason: null,
      recoveryBlockedAt: null,
    });

    return {
      connected: recovered.state === 'CONNECTED',
      status: recovered.state || 'UNKNOWN',
      phoneNumber:
        recovered.state === 'CONNECTED'
          ? recovered.phoneNumber || persistedSnapshot.phoneNumber || undefined
          : undefined,
      pushName:
        recovered.state === 'CONNECTED'
          ? recovered.pushName || persistedSnapshot.pushName || undefined
          : undefined,
      qrCode: undefined,
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

    const settings = asProviderSettings(workspace.providerSettings);
    const configuredDefault = String(
      process.env.WHATSAPP_PROVIDER_DEFAULT || 'whatsapp-web-agent',
    )
      .trim()
      .toLowerCase();
    const currentProvider = String(settings?.whatsappProvider || '').trim();
    const browserOnly = this.isBrowserOnlyMode();

    if (currentProvider === 'whatsapp-web-agent') {
      return currentProvider;
    }

    if (!browserOnly && currentProvider === 'whatsapp-api') {
      return currentProvider;
    }

    const nextProvider: WhatsAppProviderType =
      browserOnly || configuredDefault === 'whatsapp-web-agent'
        ? 'whatsapp-web-agent'
        : 'whatsapp-api';

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          whatsappProvider: nextProvider,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return nextProvider;
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
      selfIds?: string[] | null;
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

    const settings = asProviderSettings(workspace.providerSettings);
    const currentSession = settings.whatsappApiSession || {};
    const currentWebSession = settings.whatsappWebSession || {};
    const provider = String(
      update.provider ||
        settings?.whatsappProvider ||
        (this.isBrowserOnlyMode() ? 'whatsapp-web-agent' : 'whatsapp-api'),
    );

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...settings,
          whatsappProvider: provider,
          connectionStatus: update.status,
          whatsappApiSession: {
            ...currentSession,
            ...update,
            lastUpdated: new Date().toISOString(),
          },
          whatsappWebSession: {
            ...currentWebSession,
            ...update,
            lastUpdated: new Date().toISOString(),
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async startSession(
    workspaceId: string,
  ): Promise<{ success: boolean; qrCode?: string; message?: string }> {
    const persistedSnapshot =
      await this.getPersistedSessionSnapshot(workspaceId);
    const sessionName = this.resolveSessionNameForWorkspace(
      workspaceId,
      persistedSnapshot,
    );
    let providerType: WhatsAppProviderType;
    try {
      providerType = await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, message: err?.message || 'workspace_not_found' };
    }

    const currentStatus = await this.getSessionStatus(workspaceId).catch(
      () => null,
    );
    if (currentStatus?.connected) {
      return {
        success: true,
        qrCode: currentStatus.qrCode,
        message: 'already_connected',
      };
    }

    await this.persistSessionSnapshot(workspaceId, {
      status: 'starting',
      qrCode: null,
      provider: providerType,
      disconnectReason: null,
      sessionName,
      phoneNumber: null,
      pushName: null,
      connectedAt: null,
      recoveryBlockedReason: null,
      recoveryBlockedAt: null,
    });

    let result;
    try {
      result =
        providerType === 'whatsapp-web-agent'
          ? await this.whatsappWebAgent.startSession(sessionName)
          : await this.whatsappApi.startSession(sessionName);
    } catch (err: any) {
      const message = err?.message || 'failed_to_start_session';
      await this.persistSessionSnapshot(workspaceId, {
        status: 'error',
        qrCode: null,
        provider: providerType,
        disconnectReason: message,
        sessionName,
        phoneNumber: null,
        pushName: null,
        connectedAt: null,
      });
      return { success: false, message };
    }

    if (!result.success) {
      await this.persistSessionSnapshot(workspaceId, {
        status: 'error',
        qrCode: null,
        provider: providerType,
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
    const persistedSnapshot =
      await this.getPersistedSessionSnapshot(workspaceId);
    const sessionName = this.resolveSessionNameForWorkspace(
      workspaceId,
      persistedSnapshot,
    );
    let providerType: WhatsAppProviderType;
    try {
      providerType = await this.getProviderType(workspaceId);
    } catch {
      return {
        connected: false,
        status: 'workspace_not_found',
        qrCode: undefined,
      };
    }

    if (providerType === 'whatsapp-web-agent') {
      try {
        const status =
          await this.whatsappWebAgent.getSessionStatus(sessionName);
        const qr = await this.whatsappWebAgent
          .getQrCode(sessionName)
          .catch(() => null);
        const connected = status.state === 'CONNECTED';
        const normalizedStatus = this.mapProviderStateToSnapshotStatus(
          status.state,
        );

        await this.persistSessionSnapshot(workspaceId, {
          status: normalizedStatus,
          qrCode: connected ? null : qr?.qr || null,
          provider: 'whatsapp-web-agent',
          disconnectReason: connected ? null : status.message || status.state,
          phoneNumber: status.phoneNumber || null,
          pushName: status.pushName || null,
          selfIds: Array.isArray(status.selfIds) ? status.selfIds : [],
          sessionName,
          rawStatus: status.message || status.state || null,
          connectedAt: connected ? new Date().toISOString() : null,
        });

        return {
          connected,
          status: status.state || 'UNKNOWN',
          phoneNumber: status.phoneNumber || undefined,
          pushName: status.pushName || undefined,
          selfIds: Array.isArray(status.selfIds) ? status.selfIds : [],
          qrCode: connected ? undefined : qr?.qr || undefined,
        };
      } catch (err: any) {
        await this.persistSessionSnapshot(workspaceId, {
          status: 'unknown',
          qrCode: null,
          provider: 'whatsapp-web-agent',
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

    try {
      const status = await this.whatsappApi.getSessionStatus(sessionName);

      if (!status.success || !status.state) {
        const recoveredAlias = await this.tryRecoverSessionAlias(
          workspaceId,
          persistedSnapshot,
          sessionName,
        );
        if (recoveredAlias) {
          return recoveredAlias;
        }

        const sessionMissing = this.isSessionMissingMessage(status.message);
        await this.persistSessionSnapshot(workspaceId, {
          status: sessionMissing ? 'disconnected' : 'unknown',
          qrCode: null,
          provider: providerType,
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
          ? await this.whatsappApi.getQrCode(sessionName)
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
        selfIds?: string[] | null;
        sessionName?: string | null;
        rawStatus?: string | null;
        connectedAt?: string | null;
        recoveryBlockedReason?: string | null;
        recoveryBlockedAt?: string | null;
      } = {
        status: normalizedStatus,
        qrCode: status.state === 'SCAN_QR_CODE' ? qr?.qr || null : null,
        provider: providerType,
        disconnectReason: connected ? null : status.message || status.state,
        phoneNumber: resolvedPhoneNumber,
        pushName: resolvedPushName,
        selfIds:
          connected &&
          Array.isArray(status.selfIds) &&
          status.selfIds.length > 0
            ? status.selfIds
            : undefined,
        sessionName,
        rawStatus: status.message || status.state || null,
        connectedAt: connected ? undefined : null,
      };

      if (connected) {
        snapshotUpdate.recoveryBlockedReason = null;
        snapshotUpdate.recoveryBlockedAt = null;
      }

      await this.persistSessionSnapshot(workspaceId, snapshotUpdate);

      if (!connected) {
        const recoveredAlias = await this.tryRecoverSessionAlias(
          workspaceId,
          {
            ...persistedSnapshot,
            phoneNumber: resolvedPhoneNumber,
            pushName: resolvedPushName,
          },
          sessionName,
        );
        if (recoveredAlias?.connected) {
          return recoveredAlias;
        }
      }

      return {
        connected,
        status: status.state || 'UNKNOWN',
        phoneNumber: resolvedPhoneNumber || undefined,
        pushName: resolvedPushName || undefined,
        selfIds:
          connected &&
          Array.isArray(status.selfIds) &&
          status.selfIds.length > 0
            ? status.selfIds
            : undefined,
        qrCode:
          status.state === 'SCAN_QR_CODE' ? qr?.qr || undefined : undefined,
      };
    } catch (err: any) {
      await this.persistSessionSnapshot(workspaceId, {
        status: 'unknown',
        qrCode: null,
        provider: providerType,
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
    let providerType: WhatsAppProviderType;
    try {
      providerType = await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, error: err?.message || 'workspace_not_found' };
    }

    this.logger.log(`Sending message via ${providerType} to ${to}`);

    try {
      if (options?.mediaUrl) {
        const mediaResult =
          providerType === 'whatsapp-web-agent'
            ? await this.whatsappWebAgent.sendMediaFromUrl(
                workspaceId,
                to,
                options.mediaUrl,
                options.caption || message,
                options.mediaType || 'image',
                {
                  quotedMessageId: options?.quotedMessageId,
                },
              )
            : await this.whatsappApi.sendMediaFromUrl(
                workspaceId,
                to,
                options.mediaUrl,
                options.caption || message,
                options.mediaType || 'image',
                {
                  quotedMessageId: options?.quotedMessageId,
                },
              );
        return {
          success: mediaResult.success,
          messageId: this.extractMessageId(mediaResult.message),
        };
      }

      const textResult =
        providerType === 'whatsapp-web-agent'
          ? await this.whatsappWebAgent.sendMessage(workspaceId, to, message, {
              quotedMessageId: options?.quotedMessageId,
            })
          : await this.whatsappApi.sendMessage(workspaceId, to, message, {
              quotedMessageId: options?.quotedMessageId,
            });
      return {
        success: textResult.success,
        messageId: this.extractMessageId(textResult.message),
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
    let providerType: WhatsAppProviderType;
    try {
      providerType = await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, message: err?.message || 'workspace_not_found' };
    }
    const persistedSnapshot =
      await this.getPersistedSessionSnapshot(workspaceId);
    const sessionName = this.resolveSessionNameForWorkspace(
      workspaceId,
      persistedSnapshot,
    );

    const result =
      providerType === 'whatsapp-web-agent'
        ? await this.whatsappWebAgent.terminateSession(sessionName)
        : await this.whatsappApi.terminateSession(sessionName);
    await this.persistSessionSnapshot(workspaceId, {
      status: 'disconnected',
      qrCode: null,
      provider: providerType,
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
    let providerType: WhatsAppProviderType;
    try {
      providerType = await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, message: err?.message || 'workspace_not_found' };
    }
    const persistedSnapshot =
      await this.getPersistedSessionSnapshot(workspaceId);
    const sessionName = this.resolveSessionNameForWorkspace(
      workspaceId,
      persistedSnapshot,
    );

    const result =
      providerType === 'whatsapp-web-agent'
        ? await this.whatsappWebAgent.logoutSession(sessionName)
        : await this.whatsappApi.logoutSession(sessionName);
    await this.persistSessionSnapshot(workspaceId, {
      status: 'disconnected',
      qrCode: null,
      provider: providerType,
      disconnectReason: null,
      phoneNumber: null,
      pushName: null,
      connectedAt: null,
      sessionName,
    });
    return result;
  }

  async isRegistered(workspaceId: string, phone: string): Promise<boolean> {
    let providerType: WhatsAppProviderType;
    try {
      providerType = await this.getProviderType(workspaceId);
    } catch {
      return false;
    }

    return providerType === 'whatsapp-web-agent'
      ? this.whatsappWebAgent.isRegisteredUser(workspaceId, phone)
      : this.whatsappApi.isRegisteredUser(workspaceId, phone);
  }

  async healthCheck(): Promise<{
    whatsappApi: boolean;
    whatsappWebAgent: boolean;
  }> {
    const whatsappApiOk = await this.whatsappApi.ping();
    const whatsappWebAgentOk = await this.whatsappWebAgent.ping();
    return { whatsappApi: whatsappApiOk, whatsappWebAgent: whatsappWebAgentOk };
  }

  async getQrCode(
    workspaceId: string,
  ): Promise<{ success: boolean; qr?: string; message?: string }> {
    const { provider } = await this.resolveProvider(workspaceId);
    return provider.getQrCode(workspaceId);
  }

  async getClientInfo(workspaceId: string): Promise<unknown> {
    const { provider } = await this.resolveProvider(workspaceId);
    return provider.getClientInfo(workspaceId);
  }

  async getContacts(workspaceId: string): Promise<unknown[]> {
    const { provider } = await this.resolveProvider(workspaceId);
    const contacts = await provider.getContacts(workspaceId);
    return Array.isArray(contacts) ? contacts : [];
  }

  async upsertContactProfile(
    workspaceId: string,
    contact: { phone: string; name?: string | null },
  ): Promise<boolean> {
    const { providerType } = await this.resolveProvider(workspaceId);
    if (providerType === 'whatsapp-web-agent') {
      return Boolean(
        await this.whatsappWebAgent.upsertContactProfile(
          workspaceId,
          contact.phone,
          contact.name,
        ),
      );
    }
    return Boolean(
      await this.whatsappApi.upsertContactProfile(workspaceId, contact),
    );
  }

  async getChats(workspaceId: string): Promise<unknown[]> {
    const { provider } = await this.resolveProvider(workspaceId);
    const chats = await provider.getChats(workspaceId);
    return Array.isArray(chats) ? chats : [];
  }

  async getChatMessages(
    workspaceId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<unknown[]> {
    const { provider } = await this.resolveProvider(workspaceId);
    const messages = await provider.getChatMessages(
      workspaceId,
      chatId,
      options,
    );
    return Array.isArray(messages) ? messages : [];
  }

  async readChatMessages(workspaceId: string, chatId: string): Promise<void> {
    const { provider } = await this.resolveProvider(workspaceId);
    await provider.readChatMessages(workspaceId, chatId);
  }

  async setPresence(
    workspaceId: string,
    presence: 'available' | 'offline',
    chatId?: string,
  ): Promise<void> {
    const { provider } = await this.resolveProvider(workspaceId);
    await provider.setPresence(workspaceId, presence, chatId);
  }

  async sendTyping(workspaceId: string, chatId: string): Promise<void> {
    const { provider } = await this.resolveProvider(workspaceId);
    await provider.sendTyping(workspaceId, chatId);
  }

  async stopTyping(workspaceId: string, chatId: string): Promise<void> {
    const { provider } = await this.resolveProvider(workspaceId);
    await provider.stopTyping(workspaceId, chatId);
  }

  async sendSeen(workspaceId: string, chatId: string): Promise<void> {
    const { provider } = await this.resolveProvider(workspaceId);
    await provider.sendSeen(workspaceId, chatId);
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
    const { providerType } = await this.resolveProvider(workspaceId);
    if (providerType === 'whatsapp-web-agent') {
      const status = await this.whatsappWebAgent.getSessionStatus(workspaceId);
      const qr = await this.whatsappWebAgent
        .getQrCode(workspaceId)
        .catch(() => null);
      return {
        available: true,
        providerType,
        status: this.normalizeSessionStatusShape({
          connected: status.state === 'CONNECTED',
          status: status.state,
          phoneNumber: status.phoneNumber,
          pushName: status.pushName,
          selfIds: status.selfIds,
          qrCode: qr?.qr,
        }),
      };
    }

    return this.whatsappApi.getSessionConfigDiagnostics(workspaceId);
  }

  async restartSession(
    workspaceId: string,
  ): Promise<{ success: boolean; message?: string; qrCode?: string }> {
    const { providerType } = await this.resolveProvider(workspaceId);
    if (providerType === 'whatsapp-web-agent') {
      await this.disconnect(workspaceId).catch(() => undefined);
      return this.startSession(workspaceId);
    }
    return this.whatsappApi.restartSession(workspaceId);
  }

  async syncSessionConfig(workspaceId: string): Promise<void> {
    const { providerType } = await this.resolveProvider(workspaceId);
    if (providerType === 'whatsapp-web-agent') {
      return;
    }
    await this.whatsappApi.syncSessionConfig(workspaceId);
  }

  async deleteSession(workspaceId: string): Promise<boolean> {
    const { providerType } = await this.resolveProvider(workspaceId);
    if (providerType === 'whatsapp-web-agent') {
      await this.logout(workspaceId);
      return true;
    }
    return this.whatsappApi.deleteSession(workspaceId);
  }

  async listLidMappings(
    workspaceId: string,
  ): Promise<Array<{ lid: string; pn: string }>> {
    const { providerType } = await this.resolveProvider(workspaceId);
    if (providerType === 'whatsapp-web-agent') {
      return [];
    }
    const mappings = await this.whatsappApi.listLidMappings(workspaceId);
    return Array.isArray(mappings) ? mappings : [];
  }
}
