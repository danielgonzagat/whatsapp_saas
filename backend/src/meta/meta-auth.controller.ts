import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
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
import { PrismaService } from '../prisma/prisma.service';
import { MetaSdkService } from './meta-sdk.service';
import { MetaWhatsAppService } from './meta-whatsapp.service';

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
  private readonly configId = process.env.META_CONFIG_ID || '';
  private readonly frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(
    private readonly metaSdk: MetaSdkService,
    private readonly metaWhatsApp: MetaWhatsAppService,
    private readonly prisma: PrismaService,
  ) {}

  private parseState(rawState: string): {
    workspaceId: string;
    channel?: string | null;
    returnTo?: string | null;
  } {
    const raw = String(rawState || '').trim();
    if (!raw) return { workspaceId: '' };

    const candidates = [raw];
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded && decoded !== raw) candidates.unshift(decoded);
    } catch {
      void 0;
    }

    for (const candidate of candidates) {
      if (!candidate.startsWith('{')) continue;
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

  // ─── Generate OAuth URL ──────────────────────────────────────────

  @Get('url')
  @UseGuards(WorkspaceGuard)
  getAuthUrl(
    @Req() req: any,
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
        signal: AbortSignal.timeout(30000),
      });
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        this.logger.error(`Meta OAuth token exchange error: ${tokenData.error.message}`);
        return res.redirect(
          this.buildFrontendRedirect(returnTo, parsedState.channel, {
            meta: 'error',
            reason: 'token_exchange',
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

      if (pagesRes.data && pagesRes.data.length > 0) {
        const page = pagesRes.data[0]; // Use first page
        pageId = page.id;
        pageName = page.name;
        pageAccessToken = page.access_token;

        if (page.instagram_business_account) {
          instagramAccountId = page.instagram_business_account.id;
          instagramUsername = page.instagram_business_account.username || null;
        }
      }

      // 4. Fetch ad accounts
      const adAccountsRes = await this.metaSdk.graphApiGet(
        'me/adaccounts',
        { fields: 'id,name' },
        accessToken,
      );

      let adAccountId: string | null = null;
      if (adAccountsRes.data && adAccountsRes.data.length > 0) {
        adAccountId = adAccountsRes.data[0].id;
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
          accessToken,
          tokenExpiresAt,
          pageId,
          pageName,
          pageAccessToken,
          instagramAccountId,
          instagramUsername,
          whatsappPhoneNumberId: whatsappAssets.whatsappPhoneNumberId || null,
          whatsappBusinessId: whatsappAssets.whatsappBusinessId || null,
          adAccountId,
          status: 'connected',
        },
        update: {
          accessToken,
          tokenExpiresAt,
          pageId,
          pageName,
          pageAccessToken,
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
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error(`Meta OAuth callback failed: ${errInstanceofError.message}`);
      return res.redirect(
        this.buildFrontendRedirect(returnTo, parsedState.channel, {
          meta: 'error',
          reason: 'callback_failed',
        }),
      );
    }
  }

  // ─── Disconnect ──────────────────────────────────────────────────

  @Post('disconnect')
  @UseGuards(WorkspaceGuard)
  async disconnect(@Req() req: any) {
    const workspaceId = resolveWorkspaceId(req);

    const connection = await this.prisma.metaConnection.findUnique({
      where: { workspaceId },
    });

    if (!connection) {
      throw new HttpException('No Meta connection found', HttpStatus.NOT_FOUND);
    }

    // Revoke permission on Meta's side (best-effort)
    try {
      await this.metaSdk.graphApiDelete('me/permissions', connection.accessToken);
    } catch {
      this.logger.warn(
        `Failed to revoke Meta permissions for workspace ${workspaceId} (non-blocking)`,
      );
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
  async getStatus(@Req() req: any) {
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
