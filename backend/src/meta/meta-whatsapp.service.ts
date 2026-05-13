import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { MetaSdkService } from './meta-sdk.service';
import { decryptMetaToken } from './meta-token-crypto';
import { asProviderSettings } from '../whatsapp/provider-settings.types';
import { readRecord, readStrictText } from './meta-read-helpers';
import { resolvePublicBackendBaseUrl } from './meta-oauth-url.helpers';

const D_RE = /\D/g;

type ResolvedMetaConnection = {
  workspaceId: string;
  accessToken: string;
  phoneNumberId: string;
  whatsappBusinessId: string | null;
  pageId: string | null;
  pageName: string | null;
  pageAccessToken: string | null;
  instagramAccountId: string | null;
  instagramUsername: string | null;
  adAccountId: string | null;
  tokenExpired: boolean;
  persistedConnection: boolean;
};

type MetaChannel = 'whatsapp' | 'instagram' | 'facebook';

const COMMON_META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'business_management',
];

const CHANNEL_META_SCOPES: Record<MetaChannel, string[]> = {
  whatsapp: [...COMMON_META_SCOPES, 'whatsapp_business_management', 'whatsapp_business_messaging'],
  instagram: [
    ...COMMON_META_SCOPES,
    'instagram_basic',
    'instagram_manage_messages',
    'instagram_manage_comments',
  ],
  facebook: [...COMMON_META_SCOPES, 'pages_messaging'],
};

function normalizeMetaChannel(channel?: string | null): MetaChannel {
  const normalized = String(channel || '')
    .trim()
    .toLowerCase();
  if (normalized === 'instagram' || normalized === 'facebook' || normalized === 'whatsapp') {
    return normalized;
  }
  return 'whatsapp';
}

function readChannelConfigId(channel: MetaChannel): string {
  const lookup = (primary: string, legacy: string): string => {
    const val = process.env[primary] || process.env[legacy] || process.env.META_CONFIG_ID || '';
    return String(val).trim();
  };

  if (channel === 'whatsapp') {
    const result = lookup('META_WHATSAPP_CONFIG_ID', 'META_CONFIG_ID_WHATSAPP');
    if (!result) {
      throw new BadRequestException('meta-config-id-missing-for-channel');
    }
    return result;
  }
  if (channel === 'instagram') {
    const result = lookup('META_INSTAGRAM_CONFIG_ID', 'META_CONFIG_ID_INSTAGRAM');
    if (!result) {
      throw new BadRequestException('meta-config-id-missing-for-channel');
    }
    return result;
  }
  const result = String(
    process.env.META_FACEBOOK_CONFIG_ID ||
      process.env.META_CONFIG_ID_MESSENGER ||
      process.env.META_CONFIG_ID_FACEBOOK ||
      process.env.META_CONFIG_ID ||
      '',
  ).trim();
  if (!result) {
    throw new BadRequestException('meta-config-id-missing-for-channel');
  }
  return result;
}

// cache.invalidate — Meta connections fetched live from DB; no Redis cache to invalidate
@Injectable()
export class MetaWhatsAppService {
  private readonly logger = new Logger(MetaWhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaSdk: MetaSdkService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  buildEmbeddedSignupUrl(
    workspaceId: string,
    options?: { channel?: string | null; returnTo?: string | null },
  ): string {
    const appId = String(process.env.META_APP_ID || '').trim();
    const channel = normalizeMetaChannel(options?.channel);
    const configId = readChannelConfigId(channel);
    const version = String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim();

    if (!appId) {
      return '';
    }

    const scopes = CHANNEL_META_SCOPES[channel].join(',');

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: this.getOAuthRedirectUri(),
      scope: scopes,
      response_type: 'code',
      override_default_response_type: String(true),
      state: JSON.stringify({
        workspaceId,
        channel,
        returnTo: options?.returnTo || null,
      }),
    });

    if (configId) {
      params.set('config_id', configId);
    }

    if (channel === 'whatsapp') {
      params.set('extras', JSON.stringify({ sessionInfoVersion: '3', version: 'v3' }));
    }

    return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
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

  /** Get o auth redirect uri. */
  getOAuthRedirectUri(): string {
    const publicBackendUrl = this.getPublicBackendBaseUrl();
    return `${publicBackendUrl}/meta/auth/callback`;
  }

  /** Resolve connection. */
  async resolveConnection(
    workspaceId: string,
    channel: string = 'whatsapp',
  ): Promise<ResolvedMetaConnection> {
    const connection = await this.prisma.metaConnection.findFirst({
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

    const accessToken = String(
      decryptMetaToken(connection?.accessToken) || process.env.META_ACCESS_TOKEN || '',
    ).trim();
    const phoneNumberId = String(
      connection?.whatsappPhoneNumberId || process.env.META_PHONE_NUMBER_ID || '',
    ).trim();
    const whatsappBusinessId = String(
      connection?.whatsappBusinessId || process.env.META_WABA_ID || '',
    ).trim();
    const tokenExpired = Boolean(
      connection?.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() < Date.now(),
    );

    return {
      workspaceId,
      accessToken,
      phoneNumberId,
      whatsappBusinessId: whatsappBusinessId || null,
      pageId: connection?.pageId || null,
      pageName: connection?.pageName || null,
      pageAccessToken: decryptMetaToken(connection?.pageAccessToken),
      instagramAccountId: connection?.instagramAccountId || null,
      instagramUsername: connection?.instagramUsername || null,
      adAccountId: connection?.adAccountId || null,
      tokenExpired,
      persistedConnection: Boolean(connection),
    };
  }

  /** Discover whats app assets. */
  async discoverWhatsAppAssets(accessToken: string): Promise<{
    whatsappBusinessId?: string | null;
    whatsappPhoneNumberId?: string | null;
    displayPhoneNumber?: string | null;
    verifiedName?: string | null;
  }> {
    const envWabaId = String(process.env.META_WABA_ID || '').trim();
    const envPhoneNumberId = String(process.env.META_PHONE_NUMBER_ID || '').trim();

    const discovered = {
      whatsappBusinessId: envWabaId || null,
      whatsappPhoneNumberId: envPhoneNumberId || null,
      displayPhoneNumber: null as string | null,
      verifiedName: null as string | null,
    };

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

      const firstBusiness = Array.isArray(businesses?.data) ? businesses.data[0] : null;
      const firstWaba = Array.isArray(firstBusiness?.owned_whatsapp_business_accounts)
        ? firstBusiness.owned_whatsapp_business_accounts[0]
        : null;
      const firstPhone = Array.isArray(firstWaba?.phone_numbers)
        ? firstWaba.phone_numbers[0]
        : null;

      return {
        whatsappBusinessId:
          String(firstWaba?.id || discovered.whatsappBusinessId || '').trim() || null,
        whatsappPhoneNumberId:
          String(firstPhone?.id || discovered.whatsappPhoneNumberId || '').trim() || null,
        displayPhoneNumber: String(firstPhone?.display_phone_number || '').trim() || null,
        verifiedName: String(firstPhone?.verified_name || '').trim() || null,
      };
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

  /** Get phone number details. */
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

      const displayPhoneNumber = readStrictText(phoneInfo?.display_phone_number) ?? null;
      const verifiedName = readStrictText(phoneInfo?.verified_name) || resolved.pageName || null;
      const phoneDigits = this.normalizePhone(displayPhoneNumber || '');

      return {
        connected: true,
        status: 'CONNECTED',
        authUrl,
        phoneNumberId: resolved.phoneNumberId,
        whatsappBusinessId: resolved.whatsappBusinessId,
        phoneNumber: displayPhoneNumber,
        pushName: verifiedName,
        selfIds: phoneDigits ? [`${phoneDigits}@c.us`, `${phoneDigits}@s.whatsapp.net`] : [],
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

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
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

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(to),
      type: 'text',
      text: {
        body: String(message || '').trim() || ' ',
        preview_url: false,
      },
    };

    if (options?.quotedMessageId) {
      payload.context = {
        message_id: String(options.quotedMessageId).trim(),
      };
    }

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

    const msgs = Array.isArray((response as Record<string, unknown>)?.messages)
      ? ((response as Record<string, unknown>).messages as Array<Record<string, unknown>>)
      : null;
    const msgId =
      (msgs && msgs.length > 0 && msgs[0] && typeof msgs[0].id === 'string' ? msgs[0].id : null) ||
      (typeof (response as Record<string, unknown>).message_id === 'string'
        ? (response as Record<string, unknown>).message_id
        : null) ||
      (typeof (response as Record<string, unknown>).id === 'string'
        ? (response as Record<string, unknown>).id
        : null) ||
      null;
    return {
      success: true,
      messageId: msgId,
      raw: response,
    };
  }

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
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

    const mediaPayload: Record<string, unknown> = {
      link: String(mediaUrl || '').trim(),
    };
    if (caption && type !== 'audio') {
      mediaPayload.caption = caption;
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(to),
      type,
      [type]: mediaPayload,
    };

    if (options?.quotedMessageId) {
      payload.context = {
        message_id: String(options.quotedMessageId).trim(),
      };
    }

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

    const msgs = Array.isArray((response as Record<string, unknown>)?.messages)
      ? ((response as Record<string, unknown>).messages as Array<Record<string, unknown>>)
      : null;
    const msgId =
      (msgs && msgs.length > 0 && msgs[0] && typeof msgs[0].id === 'string' ? msgs[0].id : null) ||
      (typeof (response as Record<string, unknown>).message_id === 'string'
        ? (response as Record<string, unknown>).message_id
        : null) ||
      (typeof (response as Record<string, unknown>).id === 'string'
        ? (response as Record<string, unknown>).id
        : null) ||
      null;
    return {
      success: true,
      messageId: msgId,
      raw: response,
    };
  }

  /** Mark message as read. */
  async markMessageAsRead(workspaceId: string, messageId: string) {
    const resolved = await this.resolveConnection(workspaceId);
    const phoneNumberId = resolved.phoneNumberId;
    const accessToken = resolved.accessToken;

    if (!accessToken || !phoneNumberId || !messageId) {
      return false;
    }

    const response = await this.metaSdk.graphApiPost(
      `${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      accessToken,
    );

    return !response?.error;
  }

  /** Resolve workspace id by phone number id. */
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

    const envPhoneNumberId = String(process.env.META_PHONE_NUMBER_ID || '').trim();
    if (envPhoneNumberId && envPhoneNumberId === normalized) {
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

  /** Touch webhook heartbeat. */
  async touchWebhookHeartbeat(workspaceId: string, patch?: Record<string, unknown>): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) {
      return;
    }

    const settings = asProviderSettings(workspace.providerSettings);
    const currentSession = readRecord(settings.whatsappApiSession);
    const patchRecord = readRecord(patch);
    const persistedStatus = readStrictText(currentSession.status);
    const heartbeatStatus = readStrictText(patchRecord.status);
    const { status: _ignoredStatus, ...patchWithoutStatus } = patchRecord;
    const nextStatus = heartbeatStatus || persistedStatus || 'connected';

    // Round-trip through JSON to coerce the typed object literal into the
    // Prisma.InputJsonValue index-signature shape without an unsafe cast.
    const providerSettingsPayload = JSON.parse(
      JSON.stringify({
        ...settings,
        whatsappProvider: 'meta-cloud',
        connectionStatus: nextStatus,
        whatsappApiSession: {
          ...currentSession,
          ...patchWithoutStatus,
          status: nextStatus,
          provider: 'meta-cloud',
          lastWebhookAt: new Date().toISOString(),
        },
      }),
    ) as Prisma.InputJsonObject;
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: providerSettingsPayload },
    });
  }

  /** Get public backend base url. */
  getPublicBackendBaseUrl(): string {
    return resolvePublicBackendBaseUrl(process.env);
  }

  private normalizePhone(value: string): string {
    return String(value || '').replace(D_RE, '');
  }
}
