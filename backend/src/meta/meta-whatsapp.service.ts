import { Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { MetaSdkService } from './meta-sdk.service';
import {
  resolveOAuthRedirect,
  resolvePublicBackendBaseUrl,
  type ResolvedOAuthRedirect,
} from './oauth/meta-oauth-url.helpers';
import { runMetaStartupCheck } from './startup/meta-startup-check';
import {
  getRequestedScopesForChannel,
  type MetaMarketingChannel,
} from './oauth/meta-scopes.helpers';
import { parseMessageIdFromResponse } from './meta-whatsapp.message.helpers';
import { buildEmbeddedSignupUrl } from './oauth/meta-embedded-signup.helpers';
import { buildWebhookHeartbeatPayload } from './meta-webhook-heartbeat.helpers';
import {
  buildDiscoveryFallback,
  buildMarkAsReadPayload,
  buildPhoneNumberDetailsFromGraphResponse,
  buildResolvedMetaConnection,
  buildSendMediaMessagePayload,
  buildSendTextMessagePayload,
  extractDiscoveredWhatsAppAssets,
  isMatchingEnvPhoneNumberId,
  type ResolvedMetaConnection,
} from './meta-whatsapp.service.helpers';
@Injectable()
export class MetaWhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(MetaWhatsAppService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaSdk: MetaSdkService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}
  onModuleInit(): void {
    runMetaStartupCheck({
      env: process.env,
      resolved: this.resolveRedirect(),
      logger: this.logger,
    });
  }
  buildEmbeddedSignupUrl(
    workspaceId: string,
    options?: { channel?: string | null; returnTo?: string | null },
  ): string {
    return buildEmbeddedSignupUrl({
      env: process.env,
      workspaceId,
      redirectUri: this.getOAuthRedirectUri(),
      ...(options !== undefined ? { options } : {}),
    });
  }
  safeBuildEmbeddedSignupUrl(
    workspaceId: string,
    options?: { channel?: string | null; returnTo?: string | null },
  ): string {
    try {
      return this.buildEmbeddedSignupUrl(workspaceId, options);
    } catch {
      return '';
    }
  }
  getOAuthRedirectUri(): string {
    return this.resolveRedirect().redirectUri;
  }
  resolveRedirect(): ResolvedOAuthRedirect {
    return resolveOAuthRedirect(process.env);
  }
  async resolveConnection(
    workspaceId: string,
    channel: string = 'whatsapp',
  ): Promise<ResolvedMetaConnection> {
    const channelSession = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel },
      select: {
        accessToken: true,
        tokenExpiresAt: true,
        pageId: true,
        pageName: true,
        pageAccessToken: true,
        instagramAccountId: true,
        instagramUsername: true,
        whatsappPhoneNumberId: true,
        whatsappBusinessId: true,
        adAccountId: true,
      },
    });
    return buildResolvedMetaConnection({
      workspaceId,
      channelSession,
      env: process.env,
    });
  }
  async discoverWhatsAppAssets(accessToken: string): Promise<{
    whatsappBusinessId?: string | null;
    whatsappPhoneNumberId?: string | null;
    displayPhoneNumber?: string | null;
    verifiedName?: string | null;
  }> {
    const discovered = buildDiscoveryFallback(process.env);
    if (!accessToken) {
      return discovered;
    }
    try {
      const businesses = await this.metaSdk.graphApiGet(
        'me/businesses',
        {
          fields:
            'id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}',
        },
        accessToken,
      );
      return extractDiscoveredWhatsAppAssets(businesses, discovered);
    } catch (error: unknown) {
      void this.opsAlert?.alertOnDegradation(
        error instanceof Error ? error.message : 'unknown_error',
        'MetaWhatsAppService.discoverAssets',
        { metadata: { hasAccessToken: Boolean(accessToken) } },
      );
      this.logger.warn(
        `Meta WhatsApp asset discovery failed: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );
      return discovered;
    }
  }
  async getPhoneNumberDetails(workspaceId: string): Promise<{
    connected: boolean;
    status: string;
    authUrl: string;
    phoneNumberId?: string;
    whatsappBusinessId?: string | null;
    phoneNumber?: string | null;
    pushName?: string | null;
    selfIds?: string[];
    tokenExpired?: boolean;
    metaConnected?: boolean;
    pageId?: string | null;
    pageName?: string | null;
    instagramAccountId?: string | null;
    instagramUsername?: string | null;
    degradedReason?: string | null;
  }> {
    const resolved = await this.resolveConnection(workspaceId);
    const authUrl = this.safeBuildEmbeddedSignupUrl(workspaceId);
    if (!resolved.accessToken) {
      return {
        connected: false,
        status: 'DISCONNECTED',
        authUrl,
        ...(resolved.phoneNumberId ? { phoneNumberId: resolved.phoneNumberId } : {}),
        ...(resolved.whatsappBusinessId !== undefined
          ? { whatsappBusinessId: resolved.whatsappBusinessId }
          : {}),
        tokenExpired: resolved.tokenExpired,
        metaConnected: false,
        ...(resolved.pageId !== undefined ? { pageId: resolved.pageId } : {}),
        ...(resolved.pageName !== undefined ? { pageName: resolved.pageName } : {}),
        ...(resolved.instagramAccountId !== undefined
          ? { instagramAccountId: resolved.instagramAccountId }
          : {}),
        ...(resolved.instagramUsername !== undefined
          ? { instagramUsername: resolved.instagramUsername }
          : {}),
        degradedReason: 'meta_auth_required',
      } as const;
    }
    if (!resolved.phoneNumberId) {
      return {
        connected: false,
        status: 'CONNECTION_INCOMPLETE',
        authUrl,
        whatsappBusinessId: resolved.whatsappBusinessId,
        tokenExpired: resolved.tokenExpired,
        metaConnected: true,
        pageId: resolved.pageId,
        pageName: resolved.pageName,
        instagramAccountId: resolved.instagramAccountId,
        instagramUsername: resolved.instagramUsername,
        degradedReason: 'meta_whatsapp_phone_number_id_missing',
      };
    }
    try {
      const phoneInfo = await this.metaSdk.graphApiGet(
        resolved.phoneNumberId,
        {
          fields:
            'id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status',
        },
        resolved.accessToken,
      );
      if (phoneInfo?.error) {
        throw new Error(phoneInfo.error.message);
      }
      const parsed = buildPhoneNumberDetailsFromGraphResponse(phoneInfo, resolved.pageName);
      return {
        connected: true,
        status: 'CONNECTED',
        authUrl,
        phoneNumberId: resolved.phoneNumberId,
        whatsappBusinessId: resolved.whatsappBusinessId,
        phoneNumber: parsed.displayPhoneNumber,
        pushName: parsed.verifiedName,
        selfIds: parsed.selfIds,
        tokenExpired: resolved.tokenExpired,
        metaConnected: true,
        pageId: resolved.pageId,
        pageName: resolved.pageName,
        instagramAccountId: resolved.instagramAccountId,
        instagramUsername: resolved.instagramUsername,
        degradedReason: resolved.tokenExpired ? 'meta_token_expired' : null,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnDegradation(
        error instanceof Error ? error.message : 'unknown_error',
        'MetaWhatsAppService.getConnectionStatus',
        { workspaceId },
      );
      return {
        connected: false,
        status: 'DEGRADED',
        authUrl,
        phoneNumberId: resolved.phoneNumberId,
        whatsappBusinessId: resolved.whatsappBusinessId,
        tokenExpired: resolved.tokenExpired,
        metaConnected: true,
        pageId: resolved.pageId,
        pageName: resolved.pageName,
        instagramAccountId: resolved.instagramAccountId,
        instagramUsername: resolved.instagramUsername,
        degradedReason: error instanceof Error ? error.message : 'meta_phone_lookup_failed',
      };
    }
  }
  async sendTextMessage(
    workspaceId: string,
    to: string,
    message: string,
    options?: { quotedMessageId?: string },
  ) {
    const resolved = await this.resolveConnection(workspaceId);
    const phoneNumberId = resolved.phoneNumberId;
    const accessToken = resolved.accessToken;
    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        error: 'meta_connection_required',
      };
    }
    const payload = buildSendTextMessagePayload({
      to,
      message,
      quotedMessageId: options?.quotedMessageId,
    });
    const response = await this.metaSdk.graphApiPost(
      `${phoneNumberId}/messages`,
      payload,
      accessToken,
    );
    if (response?.error) {
      return {
        success: false,
        error: response.error.message,
      };
    }
    const msgId = parseMessageIdFromResponse(response);
    return {
      success: true,
      messageId: msgId,
      raw: response,
    };
  }
  async sendMediaMessage(
    workspaceId: string,
    to: string,
    type: 'image' | 'video' | 'audio' | 'document',
    mediaUrl: string,
    caption?: string,
    options?: { quotedMessageId?: string },
  ) {
    const resolved = await this.resolveConnection(workspaceId);
    const phoneNumberId = resolved.phoneNumberId;
    const accessToken = resolved.accessToken;
    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        error: 'meta_connection_required',
      };
    }
    const payload = buildSendMediaMessagePayload({
      to,
      type,
      mediaUrl,
      ...(caption !== undefined ? { caption } : {}),
      quotedMessageId: options?.quotedMessageId,
    });
    const response = await this.metaSdk.graphApiPost(
      `${phoneNumberId}/messages`,
      payload,
      accessToken,
    );
    if (response?.error) {
      return {
        success: false,
        error: response.error.message,
      };
    }
    const msgId = parseMessageIdFromResponse(response);
    return {
      success: true,
      messageId: msgId,
      raw: response,
    };
  }
  async markMessageAsRead(workspaceId: string, messageId: string) {
    const resolved = await this.resolveConnection(workspaceId);
    const phoneNumberId = resolved.phoneNumberId;
    const accessToken = resolved.accessToken;
    if (!accessToken || !phoneNumberId || !messageId) {
      return false;
    }
    const response = await this.metaSdk.graphApiPost(
      `${phoneNumberId}/messages`,
      buildMarkAsReadPayload(messageId),
      accessToken,
    );
    return !response?.error;
  }
  async resolveWorkspaceIdByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
    const normalized = String(phoneNumberId || '').trim();
    if (!normalized) {
      return null;
    }
    const byConnection = await this.prisma.metaConnection.findFirst({
      where: { whatsappPhoneNumberId: normalized },
      select: { workspaceId: true },
    });
    if (byConnection?.workspaceId) {
      return byConnection.workspaceId;
    }
    if (isMatchingEnvPhoneNumberId(normalized, process.env.META_PHONE_NUMBER_ID)) {
      const candidates = await this.prisma.workspace.findMany({
        take: 2,
        where: {
          providerSettings: {
            path: ['whatsappProvider'],
            equals: 'meta-cloud',
          },
        },
        select: { id: true },
      });
      if (candidates.length === 1 && candidates[0]) {
        return candidates[0].id;
      }
    }
    return null;
  }
  async touchWebhookHeartbeat(workspaceId: string, patch?: Record<string, unknown>): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!workspace) {
      return;
    }
    const providerSettingsPayload = buildWebhookHeartbeatPayload(workspace.providerSettings, patch);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: providerSettingsPayload },
    });
  }
  getPublicBackendBaseUrl(): string {
    return resolvePublicBackendBaseUrl(process.env);
  }
  getRequestedScopesForChannel(channel: MetaMarketingChannel): string[] {
    return getRequestedScopesForChannel(channel);
  }
}
