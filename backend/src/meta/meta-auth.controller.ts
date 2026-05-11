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
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { getTraceHeaders } from '../common/trace-headers';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSdkService } from './meta-sdk.service';
import { decryptMetaToken, encryptMetaToken } from './meta-token-crypto';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { OpsAlertService } from '../observability/ops-alert.service';

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
export class MetaAuthController {
  private readonly logger = new Logger(MetaAuthController.name);

  private readonly appId = process.env.META_APP_ID || '';
  private readonly appSecret = process.env.META_APP_SECRET || '';
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
        const parsed = JSON.parse(candidate);
        return {
          workspaceId: String(parsed?.workspaceId || '').trim(),
          channel: parsed?.channel ? String(parsed.channel).trim() : null,
          returnTo: parsed?.returnTo ? String(parsed.returnTo).trim() : null,
        };
      } catch {
        continue;
      }
    }

    return { workspaceId: raw };
  }

  private sanitizeReturnTo(requestedReturnTo?: string | null, channel?: string | null): string {
    const raw = String(requestedReturnTo || '').trim();
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      return raw;
    }

    const marketingChannel = String(channel || '')
      .trim()
      .toLowerCase();
    if (['whatsapp', 'instagram', 'facebook', 'email'].includes(marketingChannel)) {
      return `/marketing/${marketingChannel}`;
    }

    return '/settings?section=apps';
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

  private humanizeMetaError(rawMessage: string): string {
    const msg = rawMessage.toLowerCase();
    if (msg.includes('redirect_uri') || msg.includes('redirect uri')) {
      return 'A Meta nao autorizou o dominio de retorno. Ajuste os dominios do app Meta e tente novamente.';
    }
    if (msg.includes('expired') || msg.includes('code has expired')) {
      return 'O codigo de autorizacao Meta expirou. Tente conectar novamente.';
    }
    if (msg.includes('invalid') && (msg.includes('code') || msg.includes('token'))) {
      return 'Codigo de autorizacao Meta invalido ou ja usado. Tente conectar novamente.';
    }
    if (msg.includes('client_id') || msg.includes('app_id')) {
      return 'A configuracao do app Meta nao foi aceita. Revise o app conectado e tente novamente.';
    }
    if (msg.includes('permission') || msg.includes('permissions')) {
      return 'Permissoes insuficientes no app Meta. Verifique os scopes configurados no dashboard.';
    }
    if (msg.includes('rate') || msg.includes('limit')) {
      return 'Limite de requisicoes da Meta atingido. Aguarde alguns minutos e tente novamente.';
    }
    return 'Nao foi possivel concluir a autenticacao Meta. Tente novamente em instantes.';
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
        channel,
        returnTo: this.sanitizeReturnTo(returnTo, channel),
      }),
    };
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
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        const rawMetaError = String(
          tokenData.error.message || tokenData.error.error_user_msg || '',
        );
        this.logger.error(
          JSON.stringify({
            event: 'meta_oauth_token_exchange_failed',
            workspaceId,
            provider: 'meta',
            operation: 'oauth_token_exchange',
            status: 'error',
            durationMs: Date.now() - startedAt,
            errorCode: String(tokenData.error.code || tokenData.error.type || 'meta_oauth_error'),
            message: rawMetaError.slice(0, 512),
          }),
        );
        return res.redirect(
          this.buildFrontendRedirect(returnTo, parsedState.channel, {
            meta: 'error',
            reason: 'token_exchange',
            meta_error: this.humanizeMetaError(rawMetaError),
          }),
        );
      }

      const shortLivedToken = tokenData.access_token;

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
        const page = pages[0] as Record<string, unknown>; // Use first page
        pageId = typeof page.id === 'string' ? page.id : null;
        pageName = typeof page.name === 'string' ? page.name : null;
        pageAccessToken = typeof page.access_token === 'string' ? page.access_token : null;

        const instagramBusinessAccount =
          page.instagram_business_account &&
          typeof page.instagram_business_account === 'object' &&
          !Array.isArray(page.instagram_business_account)
            ? (page.instagram_business_account as Record<string, unknown>)
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
        const firstAdAccount = adAccounts[0] as Record<string, unknown>;
        adAccountId = typeof firstAdAccount.id === 'string' ? firstAdAccount.id : null;
      }

      // 4b. Discover WhatsApp Business assets for Embedded Signup / Cloud API
      const whatsappAssets = await this.metaWhatsApp.discoverWhatsAppAssets(accessToken);

      // 5. Calculate token expiration date
      const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

      // 6. Upsert MetaConnection
      await this.prisma.metaConnection.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          accessToken: encryptMetaToken(accessToken) || accessToken,
          tokenExpiresAt,
          pageId,
          pageName,
          pageAccessToken: encryptMetaToken(pageAccessToken),
          instagramAccountId,
          instagramUsername,
          whatsappPhoneNumberId: whatsappAssets.whatsappPhoneNumberId || null,
          whatsappBusinessId: whatsappAssets.whatsappBusinessId || null,
          adAccountId,
          status: 'connected',
        },
        update: {
          accessToken: encryptMetaToken(accessToken) || accessToken,
          tokenExpiresAt,
          pageId,
          pageName,
          pageAccessToken: encryptMetaToken(pageAccessToken),
          instagramAccountId,
          instagramUsername,
          whatsappPhoneNumberId: whatsappAssets.whatsappPhoneNumberId || null,
          whatsappBusinessId: whatsappAssets.whatsappBusinessId || null,
          adAccountId,
          status: 'connected',
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Meta connected for workspace ${workspaceId} (page: ${pageName || 'none'})`);

      return res.redirect(
        this.buildFrontendRedirect(returnTo, parsedState.channel, {
          meta: 'success',
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
  @UseGuards(WorkspaceGuard)
  async disconnect(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);

    const connection = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
    });

    if (!connection) {
      throw new HttpException('No Meta connection found', HttpStatus.NOT_FOUND);
    }

    // Revoke permission on Meta's side (best-effort)
    const resolvedAccessToken = decryptMetaToken(connection.accessToken);
    if (resolvedAccessToken) {
      try {
        await this.metaSdk.graphApiDelete('me/permissions', resolvedAccessToken);
      } catch {
        this.logger.warn(
          `Failed to revoke Meta permissions for workspace ${workspaceId} (non-blocking)`,
        );
      }
    }

    await this.prisma.metaConnection.delete({
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

    const connection = await this.prisma.metaConnection.findUnique({
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

    if (!connection) {
      return { connected: false };
    }

    const tokenExpired =
      connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date();

    return {
      connected: true,
      tokenExpired: !!tokenExpired,
      channels: {
        whatsapp: {
          connected: Boolean(connection.whatsappPhoneNumberId),
          provider: 'meta-cloud',
          phoneNumberId: connection.whatsappPhoneNumberId,
          whatsappBusinessId: connection.whatsappBusinessId,
          status: connection.whatsappPhoneNumberId ? 'connected' : 'connection_incomplete',
        },
        instagram: {
          connected: Boolean(connection.instagramAccountId),
          instagramAccountId: connection.instagramAccountId,
          username: connection.instagramUsername,
          status: connection.instagramAccountId ? 'connected' : 'disconnected',
        },
        messenger: {
          connected: Boolean(connection.pageId),
          pageId: connection.pageId,
          status: connection.pageId ? 'connected' : 'disconnected',
        },
        ads: {
          connected: Boolean(connection.adAccountId),
          adAccountId: connection.adAccountId,
          status: connection.adAccountId ? 'connected' : 'disconnected',
        },
      },
      ...connection,
    };
  }
}
