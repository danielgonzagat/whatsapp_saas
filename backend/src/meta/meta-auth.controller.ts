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

    // Defense-in-depth against open redirects:
    //  - Must be absolute internal path: starts with single "/"
    //  - Reject protocol-relative ("//evil.com"), backslash tricks ("/\\evil"),
    //    encoded variants ("/%5cevil", "/%2f%2fevil"), CR/LF injection, schemes.
    const looksSafe =
      raw.length > 0 &&
      raw.length <= 512 &&
      raw.startsWith('/') &&
      !raw.startsWith('//') &&
      !raw.startsWith('/\\') &&
      !/^\/%2f/i.test(raw) &&
      !/^\/%5c/i.test(raw) &&
      !/[\r\n\t]/.test(raw) &&
      !/^[a-z][a-z0-9+.-]*:/i.test(raw);

    if (looksSafe) {
      // Round-trip through URL parser bound to the trusted frontend origin to
      // catch anything that constructs cross-origin once parsed.
      try {
        const parsed = new URL(raw, this.frontendUrl);
        const base = new URL(this.frontendUrl);
        if (parsed.origin === base.origin) {
          return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      } catch {
        // fall through to channel default
      }
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

  private humanizeMetaError(rawMessage: string, errorCode?: string | number | null): string {
    const msg = rawMessage.toLowerCase();
    const code = String(errorCode || '').trim();

    // Match by numeric Graph API code first (more reliable than message scan):
    //   https://developers.facebook.com/docs/graph-api/guides/error-handling/
    if (code === '190') {
      return 'O token Meta expirou ou foi revogado. Reconecte o canal para gerar um novo.';
    }
    if (code === '200' || code === '10' || code === '299') {
      return 'O usuario nao concedeu todas as permissoes necessarias. Tente conectar novamente marcando todas as opcoes.';
    }
    if (code === '4' || code === '17' || code === '32' || code === '613') {
      return 'Limite de requisicoes da Meta atingido. Aguarde alguns minutos e tente novamente.';
    }
    if (code === '368') {
      return 'A Meta bloqueou esta acao temporariamente para o seu app. Aguarde algumas horas antes de reenviar.';
    }
    if (code === '100') {
      return 'A Meta recusou um parametro obrigatorio. Verifique se o redirect_uri cadastrado bate exatamente com o backend e tente novamente.';
    }
    if (code === '80004' || code === '131056') {
      return 'O numero WhatsApp atingiu o limite de mensagens ou nao esta aprovado para o tier atual.';
    }

    // Domain / redirect URI specific (the user's reported error)
    if (
      msg.includes("url's domain") ||
      msg.includes('app domains') ||
      (msg.includes('url isn') && msg.includes('domain')) ||
      (msg.includes('not in') && msg.includes('domain')) ||
      msg.includes('redirect_uri') ||
      msg.includes('redirect uri')
    ) {
      return 'A URL de retorno nao consta nos dominios do app Meta. Cadastre o backend (ex: api.kloel.com) em "App Domains" + "Allowed Domains" + "OAuth Redirect URIs" e confira BACKEND_PUBLIC_URL / META_OAUTH_REDIRECT_URI.';
    }
    if (msg.includes('expired') || msg.includes('code has expired')) {
      return 'O codigo de autorizacao Meta expirou. Tente conectar novamente.';
    }
    if (msg.includes('invalid') && (msg.includes('code') || msg.includes('token'))) {
      return 'Codigo de autorizacao Meta invalido ou ja usado. Tente conectar novamente.';
    }
    if (msg.includes('client_id') || msg.includes('app_id')) {
      return 'A configuracao do app Meta nao foi aceita. Revise META_APP_ID/META_APP_SECRET e o status do app no dashboard.';
    }
    if (msg.includes('whatsapp') && (msg.includes('not enabled') || msg.includes('disabled'))) {
      return 'Seu numero WhatsApp Business ainda nao foi habilitado para o app. Conclua o Embedded Signup ou peca verificacao a Meta.';
    }
    if (msg.includes('no business') || msg.includes('not associated with any business')) {
      return 'O usuario Meta nao esta associado a nenhum Business Manager. Crie um em business.facebook.com antes de continuar.';
    }
    if (msg.includes('no page') || msg.includes('no pages')) {
      return 'O usuario Meta nao possui uma pagina do Facebook associada. Crie a pagina e tente conectar de novo.';
    }
    if (
      msg.includes('instagram') &&
      (msg.includes('not connected') || msg.includes('no instagram'))
    ) {
      return 'Sua pagina do Facebook nao possui uma conta Instagram Business vinculada. Vincule pela pagina e reconecte.';
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

  // ─── Diagnostics ─────────────────────────────────────────────────
  // Lets operators verify (1) which env var resolved the redirect URI,
  // (2) that it matches what is registered in the Meta app, and
  // (3) which scopes are requested per channel — all without dumping secrets.

  @Get('diagnostics')
  @UseGuards(WorkspaceGuard)
  getDiagnostics() {
    const resolved = this.metaWhatsApp.resolveRedirect();
    const appIdRaw = String(process.env.META_APP_ID || '').trim();
    const appSecretSet = Boolean(String(process.env.META_APP_SECRET || '').trim());
    const verifyTokenSet = Boolean(String(process.env.META_VERIFY_TOKEN || '').trim());

    return {
      redirectUri: resolved.redirectUri,
      redirectUriSource: resolved.source,
      isFallback: resolved.isFallback,
      backendBaseUrl: resolved.baseUrl,
      frontendUrl: this.frontendUrl,
      appId: appIdRaw ? `${appIdRaw.slice(0, 4)}…${appIdRaw.slice(-4)}` : null,
      appIdSet: Boolean(appIdRaw),
      appSecretSet,
      verifyTokenSet,
      graphApiVersion: String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim(),
      configIds: {
        whatsapp: Boolean(
          String(process.env.META_CONFIG_ID_WHATSAPP || process.env.META_CONFIG_ID || '').trim(),
        ),
        instagram: Boolean(
          String(process.env.META_CONFIG_ID_INSTAGRAM || process.env.META_CONFIG_ID || '').trim(),
        ),
        messenger: Boolean(
          String(
            process.env.META_CONFIG_ID_MESSENGER ||
              process.env.META_CONFIG_ID_FACEBOOK ||
              process.env.META_CONFIG_ID ||
              '',
          ).trim(),
        ),
      },
      scopes: {
        whatsapp: this.metaWhatsApp.getRequestedScopesForChannel('whatsapp'),
        instagram: this.metaWhatsApp.getRequestedScopesForChannel('instagram'),
        facebook: this.metaWhatsApp.getRequestedScopesForChannel('facebook'),
      },
      checklist: {
        backendUrlRegistered: !resolved.isFallback,
        appCredentialsPresent: Boolean(appIdRaw) && appSecretSet,
        webhookVerifyTokenPresent: verifyTokenSet,
      },
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
        const rawErrorCode = tokenData.error.code ?? tokenData.error.type ?? null;
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
