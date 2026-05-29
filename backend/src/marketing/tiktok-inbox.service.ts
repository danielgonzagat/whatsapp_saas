import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { asProviderSettings } from './channels/whatsapp/provider-settings.types';
import {
  TIKTOK_CLIENT_KEY_ENV_KEYS,
  TIKTOK_SECRET_ENV_KEYS,
  resolveStatus,
  tryReadEnv,
  type ResolveStatusResult,
  type TikTokProviderSubsettings,
} from './tiktok-marketing.helpers';

/**
 * Pending-channel response for TikTok DM operations.
 *
 * TikTok does not yet expose first-class direct-message APIs to third-party
 * platforms (creator messaging is an invite-only beta). Until the integration
 * is wired, the inbox-style endpoints exist to keep parity with WhatsApp,
 * Facebook Messenger, and Instagram, but they MUST return an honest
 * pending-state instead of fabricated data.
 *
 * Shape mirrors `{ ok: false, reason: 'channel_pending' }` requested by the
 * KLOEL CLAUDE.md "estados honestos" rule.
 */
export interface TikTokInboxPendingResponse {
  ok: false;
  reason: 'channel_pending';
  channel: 'tiktok';
  detail: string;
  connection: {
    connected: boolean;
    status: string;
    kind: string | null;
    configReady: boolean;
  };
}

export interface TikTokInboxStatusResponse {
  channel: 'tiktok';
  connection: ResolveStatusResult;
  capabilities: {
    inbox: false;
    messages: false;
    send: false;
  };
  pending: {
    reason: 'channel_pending';
    detail: string;
  };
}

const PENDING_DETAIL =
  'TikTok direct-message API is not yet wired. Connection metadata is honest; ' +
  'messaging endpoints return channel_pending until provider access is granted.';

@Injectable()
export class TikTokInboxService {
  private readonly logger = new Logger(TikTokInboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Honest combined status: real OAuth connection state +
   * explicit capability flags showing the inbox is pending.
   */
  async getStatus(workspaceId: string): Promise<TikTokInboxStatusResponse> {
    const connection = await this.readConnection(workspaceId);
    return {
      channel: 'tiktok',
      connection,
      capabilities: { inbox: false, messages: false, send: false },
      pending: { reason: 'channel_pending', detail: PENDING_DETAIL },
    };
  }

  /**
   * Inbox listing. Returns honest pending state — never fabricates messages.
   * Logs at debug so operators can see attempts without polluting WARN/ERROR.
   */
  async listMessages(workspaceId: string): Promise<TikTokInboxPendingResponse> {
    this.logger.debug(`TikTok inbox messages requested for workspace=${workspaceId}`);
    return this.pendingResponse(workspaceId);
  }

  /**
   * Conversation listing. Same honest pending state as listMessages.
   */
  async listConversations(workspaceId: string): Promise<TikTokInboxPendingResponse> {
    this.logger.debug(`TikTok inbox conversations requested for workspace=${workspaceId}`);
    return this.pendingResponse(workspaceId);
  }

  /**
   * Send DM. Returns honest pending state — never enqueues a fake send.
   * `recipientId` and `text` are accepted only to validate DTO shape so the
   * frontend integration can be exercised end-to-end without producing fakes.
   */
  async sendMessage(
    workspaceId: string,
    _recipientId: string,
    _text: string,
  ): Promise<TikTokInboxPendingResponse> {
    this.logger.debug(`TikTok inbox send requested for workspace=${workspaceId}`);
    return this.pendingResponse(workspaceId);
  }

  private async pendingResponse(workspaceId: string): Promise<TikTokInboxPendingResponse> {
    const connection = await this.readConnection(workspaceId);
    return {
      ok: false,
      reason: 'channel_pending',
      channel: 'tiktok',
      detail: PENDING_DETAIL,
      connection: {
        connected: connection.connected,
        status: connection.status,
        kind: connection.kind,
        configReady: connection.configReady,
      },
    };
  }

  private async readConnection(workspaceId: string): Promise<ResolveStatusResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = asProviderSettings(workspace?.providerSettings);
    const tiktok = (settings.tiktok || {}) as TikTokProviderSubsettings;

    return resolveStatus({
      tiktok,
      clientConfigured: Boolean(tryReadEnv(TIKTOK_CLIENT_KEY_ENV_KEYS)),
      secretConfigured: Boolean(tryReadEnv(TIKTOK_SECRET_ENV_KEYS)),
    });
  }
}
