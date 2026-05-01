import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { MetaSdkService } from './meta-sdk.service';
import { decryptMetaToken } from './meta-token-crypto';
import { asProviderSettings } from '../whatsapp/provider-settings.types';
import { readRecord, readStrictText, readText } from './__companions__/meta-read-helpers';

const D_RE = /\D/g;

const PATTERN_RE = /\/+$/;
const HTTPS_RE = /^https?:\/\//i;
const LOCALHOST_127__0__0__1_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;

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
  tokenExpired: boolean;
  persistedConnection: boolean;
};

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
    const configId = String(process.env.META_CONFIG_ID || '').trim();
    const version = String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim();

    if (!appId) {
      return '';
    }

    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_messages',
      'instagram_manage_comments',
      'instagram_content_publish',
      'business_management',
      'ads_management',
      'ads_read',
      'catalog_management',
      'whatsapp_business_management',
      'whatsapp_business_messaging',
    ].join(',');

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: this.getOAuthRedirectUri(),
      scope: scopes,
      response_type: 'code',
      state: JSON.stringify({
        workspaceId,
        channel: options?.channel || null,
        returnTo: options?.returnTo || null,
      }),
    });

    if (configId) {
      params.set('config_id', configId);
    }

    return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
  }

  /** Get o auth redirect uri. */
  getOAuthRedirectUri(): string {
    const publicBackendUrl = this.getPublicBackendBaseUrl();
    return `${publicBackendUrl}/meta/auth/callback`;
  }

  /** Resolve connection. */
  async resolveConnection(workspaceId: string): Promise<ResolvedMetaConnection> {
    const connection = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
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
    const authUrl = this.buildEmbeddedSignupUrl(workspaceId);

    if (!resolved.accessToken) {
      return {
        connected: false,
        status: 'DISCONNECTED',
        authUrl,
        phoneNumberId: resolved.phoneNumberId || undefined,
        whatsappBusinessId: resolved.whatsappBusinessId,
        tokenExpired: resolved.tokenExpired,
        metaConnected: false,
        pageId: resolved.pageId,
        pageName: resolved.pageName,
        instagramAccountId: resolved.instagramAccountId,
        instagramUsername: resolved.instagramUsername,
        degradedReason: 'meta_auth_required',
      };
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

    return {
      success: true,
      messageId: response?.messages?.[0]?.id || response?.message_id || response?.id || null,
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

    return {
      success: true,
      messageId: response?.messages?.[0]?.id || response?.message_id || response?.id || null,
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

      if (candidates.length === 1) {
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
    const candidates = [
      process.env.BACKEND_PUBLIC_URL,
      process.env.APP_URL,
      process.env.BACKEND_URL,
      process.env.NEXT_PUBLIC_API_URL,
      process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '',
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizePublicBaseUrl(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return 'http://localhost:3001';
  }

  private normalizePublicBaseUrl(candidate: unknown): string {
    const raw = readText(candidate).trim().replace(PATTERN_RE, '');
    if (!raw) {
      return '';
    }

    if (HTTPS_RE.test(raw)) {
      return raw;
    }

    if (LOCALHOST_127__0__0__1_RE.test(raw)) {
      return `http://${raw}`;
    }

    return `https://${raw}`;
  }

  private normalizePhone(value: string): string {
    return String(value || '').replace(D_RE, '');
  }
}
