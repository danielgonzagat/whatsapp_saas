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
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Idempotent } from '../common/idempotency.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TikTokAdsProvider } from '../integrations/tiktok-ads.provider';
import { asProviderSettings } from '../whatsapp/provider-settings.types';
import { OpsAlertService } from '../observability/ops-alert.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

interface TikTokProviderSubsettings {
  connected?: boolean;
  status?: string;
  kind?: string;
  accessToken?: string;
  refreshToken?: string | null;
  advertiserIds?: string[];
  expiresAt?: string | null;
  connectedAt?: string;
  [key: string]: unknown;
}

@Controller('tiktok-ads/auth')
@RouteClass('mutate')
export class TikTokAuthController {
  private readonly logger = new Logger(TikTokAuthController.name);
  private readonly frontendUrl = (process.env.FRONTEND_URL || 'https://app.kloel.com').replace(
    /\/+$/,
    '',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiktokAdsProvider: TikTokAdsProvider,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private buildFrontendRedirect(returnTo: string, params?: Record<string, string>) {
    const target = returnTo.startsWith('/') ? returnTo : '/integrations/tiktok';
    const url = new URL(target, this.frontendUrl);
    for (const [key, value] of Object.entries(params || {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  @Get('url')
  @UseGuards(WorkspaceGuard)
  async getAuthUrl(
    @Req() req: AuthenticatedRequest,
    @Query('redirectUri') redirectUri?: string,
    @Query('returnTo') returnTo?: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const resolvedRedirectUri = redirectUri || `${this.frontendUrl}/api/tiktok-ads/auth/callback`;

    const result = await this.tiktokAdsProvider.connect(workspaceId, resolvedRedirectUri);
    return {
      authUrl: result.authUrl || '',
      returnTo: returnTo || '/integrations/tiktok',
    };
  }

  @Public()
  @Get('callback')
  async handleCallback(
    @Query('auth_code') code: string,
    @Query('state') state: string,
    @Query('return_to') returnTo: string,
    @Res() res: Response,
  ) {
    const fallbackReturnTo = '/integrations/tiktok';

    if (!code) {
      return res.redirect(
        this.buildFrontendRedirect(returnTo || fallbackReturnTo, {
          tiktok: 'error',
          reason: 'missing_code',
        }),
      );
    }

    let workspaceId = '';
    try {
      const rawState = typeof state === 'string' ? state : '';
      const decoded = Buffer.from(rawState, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      const rawWorkspaceId = parsed['workspaceId'];
      workspaceId = typeof rawWorkspaceId === 'string' ? rawWorkspaceId.trim() : '';
    } catch {
      void 0;
    }

    if (!workspaceId) {
      return res.redirect(
        this.buildFrontendRedirect(returnTo || fallbackReturnTo, {
          tiktok: 'error',
          reason: 'invalid_state',
        }),
      );
    }

    try {
      const result = await this.tiktokAdsProvider.completeOAuth(
        workspaceId,
        code,
        `${this.frontendUrl}/api/tiktok-ads/auth/callback`,
      );

      if (!result.connected) {
        return res.redirect(
          this.buildFrontendRedirect(returnTo || fallbackReturnTo, {
            tiktok: 'error',
            reason: result.status,
          }),
        );
      }

      return res.redirect(
        this.buildFrontendRedirect(returnTo || fallbackReturnTo, {
          tiktok: 'success',
        }),
      );
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'TikTokAuthController.callback');
      this.logger.error(
        `TikTok OAuth callback failed: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
      return res.redirect(
        this.buildFrontendRedirect(returnTo || fallbackReturnTo, {
          tiktok: 'error',
          reason: 'callback_failed',
        }),
      );
    }
  }

  @Post('disconnect')
  @Idempotent()
  @UseGuards(WorkspaceGuard)
  async disconnect(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) {
      throw new HttpException('Workspace not found', HttpStatus.NOT_FOUND);
    }

    const settings = asProviderSettings(workspace.providerSettings);
    const tiktok = (settings.tiktok || {}) as TikTokProviderSubsettings;

    if (!tiktok.connected) {
      throw new HttpException('No TikTok Ads connection found', HttpStatus.NOT_FOUND);
    }

    const result = await this.tiktokAdsProvider.disconnect(workspaceId);
    return { status: result.status };
  }

  @Get('status')
  @UseGuards(WorkspaceGuard)
  async getStatus(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) {
      return { connected: false };
    }

    const settings = asProviderSettings(workspace.providerSettings);
    const tiktok = (settings.tiktok || {}) as TikTokProviderSubsettings;

    if (!tiktok.connected) {
      return { connected: false };
    }

    const tokenExpired = tiktok.expiresAt && new Date(tiktok.expiresAt) < new Date();

    return {
      connected: true,
      kind: tiktok.kind || 'advertiser',
      advertiserIds: tiktok.advertiserIds || [],
      tokenExpired,
      expiresAt: tiktok.expiresAt || null,
      connectedAt: tiktok.connectedAt || null,
    };
  }
}
