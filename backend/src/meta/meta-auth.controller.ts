import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Idempotent } from '../common/idempotency.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { getTraceHeaders } from '../common/trace-headers';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSdkService } from './meta-sdk.service';
import { decryptMetaToken, encryptMetaToken } from './meta-token-crypto';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { RouteClass } from '../common/throttler/route-class.decorator';
import {
  buildDiagnosticsPayload,
  humanizeMetaError,
  sanitizeReturnTo as sanitizeReturnToHelper,
} from './oauth/meta-auth-helpers';
import { readRecord, readStrictText } from './read-model/meta-read-helpers';

function readFirstEnv(keys: string[]): string {
  return keys.map((key) => String(process.env[key] || '').trim()).find(Boolean) || '';
}

interface MetaAuthPage {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id?: string;
    username?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface MetaAuthAdAccount {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Meta Platform OAuth controller.
 *
 * Routes:
 *  GET  /meta/auth/url         — generate OAuth URL (authed)
 *  GET  /meta/auth/callback    — handle OAuth redirect (public)
 *  POST /meta/auth/disconnect  — remove MetaConnection (authed)
 *  GET  /meta/auth/status      — connection status (authed)
 */
@Controller('meta/auth')
@RouteClass('mutate')
export class MetaAuthController {
  private readonly logger = new Logger(MetaAuthController.name);

  private readonly appId = readFirstEnv(['META_APP_ID', 'FACEBOOK_APP_ID', 'META_CLIENT_ID']);
  private readonly appSecret = readFirstEnv([
    'META_APP_SECRET',
    'FACEBOOK_APP_SECRET',
    'META_CLIENT_SECRET',
  ]);
  private readonly frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(
    private readonly metaSdk: MetaSdkService,
    private readonly metaWhatsApp: MetaWhatsAppService,
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private parseState(rawState: string): {
    workspaceId: string;
    channel?: string | null;
    returnTo?: string | null;
  } {
    const raw = String(rawState || '').trim();
    if (!raw) {
      return { workspaceId: '' };
    }

    const candidates = [raw];
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded && decoded !== raw) {
        candidates.unshift(decoded);
      }
    } catch {
      void 0;
    }

    for (const candidate of candidates) {
      if (!candidate.startsWith('{')) {
        continue;
      }
      try {
        const parsed = readRecord(JSON.parse(candidate) as unknown);
        return {
          workspaceId: readStrictText(parsed.workspaceId)?.trim() || '',
          channel: readStrictText(parsed.channel)?.trim() || null,
          returnTo: readStrictText(parsed.returnTo)?.trim() || null,
        };
      } catch {
        continue;
      }
    }

    return { workspaceId: raw };
  }

  private sanitizeReturnTo(requestedReturnTo?: string | null, channel?: string | null): string {
    return sanitizeReturnToHelper(requestedReturnTo, channel, this.frontendUrl);
  }

  private buildFrontendRedirect(
    requestedReturnTo?: string | null,
    channel?: string | null,
    params?: Record<string, string>,
  ) {
    const target = this.sanitizeReturnTo(requestedReturnTo, channel);
    const url = new URL(target, this.frontendUrl);
    for (const [key, value] of Object.entries(params || {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private humanizeMetaError(rawMessage: string, errorCode?: string | number | null): string {
    return humanizeMetaError(rawMessage, errorCode);
  }

  // ─── Generate OAuth URL ──────────────────────────────────────────

  @Get('url')
  @UseGuards(WorkspaceGuard)
  getAuthUrl(
    @Req() req: AuthenticatedRequest,
    @Query('channel') channel?: string,
    @Query('returnTo') returnTo?: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return {
      url: this.metaWhatsApp.buildEmbeddedSignupUrl(workspaceId, {
        ...(channel !== undefined ? { channel } : {}),
        ...(returnTo !== undefined ? { returnTo: this.sanitizeReturnTo(returnTo, channel) } : {}),
      }),
    };
  }

  // ─── Diagnostics ─────────────────────────────────────────────────
  // Lets operators verify (1) which env var resolved the redirect URI,
  // (2) that it matches what is registered in the Meta app, and
  // (3) which scopes are requested per channel — all without dumping secrets.

  @InternalEndpoint('Meta OAuth configuration diagnostics')
  @Get('diagnostics')
  @UseGuards(WorkspaceGuard)
  getDiagnostics() {
    return buildDiagnosticsPayload({
      env: process.env,
      resolved: this.metaWhatsApp.resolveRedirect(),
      frontendUrl: this.frontendUrl,
      scopesByChannel: {
        whatsapp: this.metaWhatsApp.getRequestedScopesForChannel('whatsapp'),
        instagram: this.metaWhatsApp.getRequestedScopesForChannel('instagram'),
        facebook: this.metaWhatsApp.getRequestedScopesForChannel('facebook'),
      },
    });
  }

  // ─── OAuth Callback ──────────────────────────────────────────────

  @Public()
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const startedAt = Date.now();
    const parsedState = this.parseState(state);
    const workspaceId = parsedState.workspaceId;
    const returnTo = this.sanitizeReturnTo(parsedState.returnTo, parsedState.channel);

    if (!code || !state) {
      return res.redirect(
        this.buildFrontendRedirect(returnTo, parsedState.channel, {
          meta: 'error',
          reason: 'missing_params',
        }),
      );
    }

    if (!workspaceId) {
      return res.redirect(
        this.buildFrontendRedirect(returnTo, parsedState.channel, {
          meta: 'error',
          reason: 'invalid_state',
        }),
      );
    }

    try {
      // 1. Exchange code for short-lived token
      const redirectUri = this.metaWhatsApp.getOAuthRedirectUri();
      const tokenUrl = new URL(
        `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || 'v21.0'}/oauth/access_token`,
      );
      tokenUrl.searchParams.set('client_id', this.appId);
      tokenUrl.searchParams.set('client_secret', this.appSecret);
      tokenUrl.searchParams.set('redirect_uri', redirectUri);
      tokenUrl.searchParams.set('code', code);

      // Not SSRF: tokenUrl built from hardcoded graph.facebook.com base + server env vars
      const tokenRes = await fetch(tokenUrl.toString(), {
        headers: getTraceHeaders(),
        signal: AbortSignal.timeout(30000),
      });
      const tokenData = readRecord(await tokenRes.json());
      const tokenError = readRecord(tokenData.error);

      if (Object.keys(tokenError).length > 0) {
        const rawMetaError =
          readStrictText(tokenError.message) || readStrictText(tokenError.error_user_msg) || '';
        const errorCodeValue = tokenError.code ?? tokenError.type ?? null;
        const rawErrorCode =
          typeof errorCodeValue === 'string' || typeof errorCodeValue === 'number'
            ? errorCodeValue
            : null;
        this.logger.error(
          JSON.stringify({
            event: 'meta_oauth_token_exchange_failed',
            workspaceId,
            provider: 'meta',
            operation: 'oauth_token_exchange',
            status: 'error',
            durationMs: Date.now() - startedAt,
            errorCode: String(rawErrorCode ?? 'meta_oauth_error'),
            message: rawMetaError.slice(0, 512),
          }),
        );
        return res.redirect(
          this.buildFrontendRedirect(returnTo, parsedState.channel, {
            meta: 'error',
            reason: 'token_exchange',
            meta_error: this.humanizeMetaError(rawMetaError, rawErrorCode),
          }),
        );
      }

      const shortLivedToken = readStrictText(tokenData.access_token) || '';

      // 2. Exchange for long-lived token
      const longLived = await this.metaSdk.exchangeToken(shortLivedToken);
      const accessToken = longLived.access_token;
      const expiresIn = longLived.expires_in;

      // 3. Fetch user pages and Instagram accounts
      const pagesRes = await this.metaSdk.graphApiGet(
        'me/accounts',
        {
          fields: 'id,name,access_token,instagram_business_account{id,username}',
        },
        accessToken,
      );

      let pageId: string | null = null;
      let pageName: string | null = null;
      let pageAccessToken: string | null = null;
      let instagramAccountId: string | null = null;
      let instagramUsername: string | null = null;

      const pages = Array.isArray(pagesRes.data) ? pagesRes.data : [];
      if (pages.length > 0) {
        const page = pages[0] as MetaAuthPage; // Use first page
        pageId = typeof page.id === 'string' ? page.id : null;
        pageName = typeof page.name === 'string' ? page.name : null;
        pageAccessToken = typeof page.access_token === 'string' ? page.access_token : null;

        const instagramBusinessAccount =
          page.instagram_business_account &&
          typeof page.instagram_business_account === 'object' &&
          !Array.isArray(page.instagram_business_account)
            ? (page.instagram_business_account as MetaAuthPage['instagram_business_account'])
            : null;
        if (instagramBusinessAccount) {
          instagramAccountId =
            typeof instagramBusinessAccount.id === 'string' ? instagramBusinessAccount.id : null;
          instagramUsername =
            typeof instagramBusinessAccount.username === 'string'
              ? instagramBusinessAccount.username
              : null;
        }
      }

      // 4. Fetch ad accounts
      const adAccountsRes = await this.metaSdk.graphApiGet(
        'me/adaccounts',
        { fields: 'id,name' },
        accessToken,
      );

      let adAccountId: string | null = null;
      const adAccounts = Array.isArray(adAccountsRes.data) ? adAccountsRes.data : [];
      if (adAccounts.length > 0) {
        const firstAdAccount = adAccounts[0] as MetaAuthAdAccount;
        adAccountId = typeof firstAdAccount.id === 'string' ? firstAdAccount.id : null;
      }

      // 4b. Discover WhatsApp Business assets for Embedded Signup / Cloud API
      const whatsappAssets = await this.metaWhatsApp.discoverWhatsAppAssets(accessToken);

      // 5. Calculate token expiration date
      const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

      // 6. Upsert MetaConnection
      const connectionCreate: Prisma.MetaConnectionCreateInput = {
        workspace: { connect: { id: workspaceId } },
        accessToken: encryptMetaToken(accessToken) || accessToken,
        tokenExpiresAt,
        pageId,
        pageName,
        pageAccessToken: encryptMetaToken(pageAccessToken) ?? null,
        instagramAccountId,
        instagramUsername,
        whatsappPhoneNumberId: whatsappAssets.whatsappPhoneNumberId || null,
        whatsappBusinessId: whatsappAssets.whatsappBusinessId || null,
        adAccountId,
        status: 'connected',
        channel: parsedState.channel || 'whatsapp',
      };
      const connectionUpdate: Prisma.MetaConnectionUpdateInput = {
        accessToken: encryptMetaToken(accessToken) || accessToken,
        tokenExpiresAt,
        pageId,
        pageName,
        pageAccessToken: encryptMetaToken(pageAccessToken) ?? null,
        instagramAccountId,
        instagramUsername,
        whatsappPhoneNumberId: whatsappAssets.whatsappPhoneNumberId || null,
        whatsappBusinessId: whatsappAssets.whatsappBusinessId || null,
        adAccountId,
        status: 'connected',
        updatedAt: new Date(),
        channel: parsedState.channel || 'whatsapp',
      };
      const resolvedChannel = parsedState.channel || 'whatsapp';
      await this.prisma.metaConnection.upsert({
        where: { workspaceId_channel: { workspaceId, channel: resolvedChannel } },
        create: { ...connectionCreate, channel: resolvedChannel },
        update: connectionUpdate,
      });

      this.logger.log(
        `Meta connected for workspace ${workspaceId} channel=${resolvedChannel} (page: ${pageName || 'none'})`,
      );

      return res.redirect(
        this.buildFrontendRedirect(returnTo, parsedState.channel, {
          meta: 'success',
          channel: parsedState.channel || '',
        }),
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'unknown_error';
      void this.opsAlert?.alertOnCriticalError(err, 'MetaAuthController.callback');
      this.logger.error(
        JSON.stringify({
          event: 'meta_oauth_callback_failed',
          workspaceId,
          provider: 'meta',
          operation: 'oauth_callback',
          status: 'error',
          durationMs: Date.now() - startedAt,
          errorCode: err instanceof Error ? err.name : 'unknown_error',
          message: errMsg.slice(0, 512),
        }),
      );
      return res.redirect(
        this.buildFrontendRedirect(returnTo, parsedState.channel, {
          meta: 'error',
          reason: 'callback_failed',
          meta_error: this.humanizeMetaError(errMsg),
        }),
      );
    }
  }

  // ─── Disconnect ──────────────────────────────────────────────────

  @Post('disconnect')
  @Idempotent()
  @UseGuards(WorkspaceGuard)
  async disconnect(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);

    const connections = await this.prisma.metaConnection.findMany({
      where: { workspaceId },
    });

    if (connections.length === 0) {
      throw new HttpException('No Meta connection found', HttpStatus.NOT_FOUND);
    }

    // Revoke permission on Meta's side (best-effort, use first token)
    const firstConnection = connections[0];
    const resolvedAccessToken = firstConnection
      ? decryptMetaToken(firstConnection.accessToken)
      : null;
    if (resolvedAccessToken) {
      try {
        await this.metaSdk.graphApiDelete('me/permissions', resolvedAccessToken);
      } catch {
        this.logger.warn(
          `Failed to revoke Meta permissions for workspace ${workspaceId} (non-blocking)`,
        );
      }
    }

    await this.prisma.metaConnection.deleteMany({
      where: { workspaceId },
    });

    this.logger.log(`Meta disconnected for workspace ${workspaceId}`);

    return { status: 'disconnected' };
  }

  // ─── Connection Status ───────────────────────────────────────────

  @Get('status')
  @UseGuards(WorkspaceGuard)
  async getStatus(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);

    const connections = await this.prisma.metaConnection.findMany({
      where: { workspaceId },
      select: {
        status: true,
        pageName: true,
        pageId: true,
        instagramUsername: true,
        instagramAccountId: true,
        whatsappPhoneNumberId: true,
        whatsappBusinessId: true,
        adAccountId: true,
        pixelId: true,
        catalogId: true,
        tokenExpiresAt: true,
        connectedAt: true,
        updatedAt: true,
      },
    });

    if (connections.length === 0) {
      return { connected: false };
    }

    const merged = connections.reduce(
      (acc, c) => {
        if (c.pageId) {
          acc.pageId = c.pageId;
        }
        if (c.pageName) {
          acc.pageName = c.pageName;
        }
        if (c.instagramAccountId) {
          acc.instagramAccountId = c.instagramAccountId;
        }
        if (c.instagramUsername) {
          acc.instagramUsername = c.instagramUsername;
        }
        if (c.whatsappPhoneNumberId) {
          acc.whatsappPhoneNumberId = c.whatsappPhoneNumberId;
        }
        if (c.whatsappBusinessId) {
          acc.whatsappBusinessId = c.whatsappBusinessId;
        }
        if (c.adAccountId) {
          acc.adAccountId = c.adAccountId;
        }
        if (c.pixelId) {
          acc.pixelId = c.pixelId;
        }
        if (c.catalogId) {
          acc.catalogId = c.catalogId;
        }
        if (c.tokenExpiresAt) {
          acc.tokenExpiresAt = c.tokenExpiresAt;
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

    const tokenExpired =
      merged.tokenExpiresAt && new Date(merged.tokenExpiresAt as Date) < new Date();

    return {
      connected: true,
      tokenExpired: !!tokenExpired,
      channels: {
        whatsapp: {
          connected: Boolean(merged.whatsappPhoneNumberId),
          provider: 'meta-cloud',
          phoneNumberId: merged.whatsappPhoneNumberId,
          whatsappBusinessId: merged.whatsappBusinessId,
          status: merged.whatsappPhoneNumberId ? 'connected' : 'connection_incomplete',
        },
        instagram: {
          connected: Boolean(merged.instagramAccountId),
          instagramAccountId: merged.instagramAccountId,
          username: merged.instagramUsername,
          status: merged.instagramAccountId ? 'connected' : 'disconnected',
        },
        messenger: {
          connected: Boolean(merged.pageId),
          pageId: merged.pageId,
          status: merged.pageId ? 'connected' : 'disconnected',
        },
        facebook: {
          connected: Boolean(merged.pageId),
          pageId: merged.pageId,
          status: merged.pageId ? 'connected' : 'disconnected',
        },
        ads: {
          connected: Boolean(merged.adAccountId),
          adAccountId: merged.adAccountId,
          status: merged.adAccountId ? 'connected' : 'disconnected',
        },
      },
      ...merged,
    };
  }
}
