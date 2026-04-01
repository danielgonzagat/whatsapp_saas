import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { MetaSdkService } from './meta-sdk.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';

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
  private readonly frontendUrl =
    process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(
    private readonly metaSdk: MetaSdkService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Generate OAuth URL ──────────────────────────────────────────

  @Get('url')
  @UseGuards(WorkspaceGuard)
  getAuthUrl(@Req() req: any) {
    const workspaceId = resolveWorkspaceId(req);

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

    const redirectUri = `${this.frontendUrl}/api/meta/callback`;

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code',
      state: workspaceId,
      ...(this.configId ? { config_id: this.configId } : {}),
    });

    const url = `https://www.facebook.com/${process.env.META_GRAPH_API_VERSION || 'v21.0'}/dialog/oauth?${params.toString()}`;

    return { url };
  }

  // ─── OAuth Callback ──────────────────────────────────────────────

  @Public()
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      return res.redirect(
        `${this.frontendUrl}/settings/integrations?meta=error&reason=missing_params`,
      );
    }

    const workspaceId = state;

    try {
      // 1. Exchange code for short-lived token
      const redirectUri = `${this.frontendUrl}/api/meta/callback`;
      const tokenUrl = new URL(
        `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || 'v21.0'}/oauth/access_token`,
      );
      tokenUrl.searchParams.set('client_id', this.appId);
      tokenUrl.searchParams.set('client_secret', this.appSecret);
      tokenUrl.searchParams.set('redirect_uri', redirectUri);
      tokenUrl.searchParams.set('code', code);

      const tokenRes = await fetch(tokenUrl.toString(), {
        signal: AbortSignal.timeout(30000),
      });
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        this.logger.error(
          `Meta OAuth token exchange error: ${tokenData.error.message}`,
        );
        return res.redirect(
          `${this.frontendUrl}/settings/integrations?meta=error&reason=token_exchange`,
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
          fields:
            'id,name,access_token,instagram_business_account{id,username}',
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

      // 5. Calculate token expiration date
      const tokenExpiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : null;

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
          adAccountId,
          status: 'connected',
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Meta connected for workspace ${workspaceId} (page: ${pageName || 'none'})`,
      );

      return res.redirect(
        `${this.frontendUrl}/settings/integrations?meta=success`,
      );
    } catch (err: any) {
      this.logger.error(`Meta OAuth callback failed: ${err.message}`);
      return res.redirect(
        `${this.frontendUrl}/settings/integrations?meta=error&reason=callback_failed`,
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
      await this.metaSdk.graphApiDelete(
        'me/permissions',
        connection.accessToken,
      );
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
      connection.tokenExpiresAt &&
      new Date(connection.tokenExpiresAt) < new Date();

    return {
      connected: true,
      tokenExpired: !!tokenExpired,
      ...connection,
    };
  }
}
