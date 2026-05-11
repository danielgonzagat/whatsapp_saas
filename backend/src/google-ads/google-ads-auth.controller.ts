import { Controller, Get, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { AnunciosService } from '../anuncios/anuncios.service';

interface WorkspaceRequest extends Request {
  workspaceId?: string;
}

@Controller('api/google-ads')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class GoogleAdsAuthController {
  constructor(private readonly anunciosService: AnunciosService) {}

  private workspaceId(req: Request): string {
    return (req as WorkspaceRequest).workspaceId || '';
  }

  @Get('connect')
  async getConnectUrl(@Req() req: Request) {
    const wsId = this.workspaceId(req);
    const result = await this.anunciosService.getConnectUrl(wsId, 'google');
    return { data: result };
  }

  @Get('callback')
  async oauthCallback(@Req() req: Request, @Query('code') code?: string, @Query('error') error?: string) {
    const wsId = this.workspaceId(req);

    if (error) {
      return { data: { connected: false, status: 'oauth_error', error } };
    }

    if (!code) {
      throw new BadRequestException('Missing authorization code');
    }

    const result = await this.anunciosService.completeOAuth(wsId, 'google', code);
    return { data: result };
  }

  @Get('status')
  async getStatus(@Req() req: Request) {
    const wsId = this.workspaceId(req);
    const statuses = await this.anunciosService.getPlatformStatuses(wsId);
    const google = statuses.find((s) => s.platform === 'google');
    return { data: google || { platform: 'google', connected: false, status: 'disconnected', accountId: '', clientConfigured: false } };
  }

  @Post('disconnect')
  async disconnect(@Req() req: Request) {
    const wsId = this.workspaceId(req);
    const result = await this.anunciosService.disconnect(wsId, 'google');
    return { data: result };
  }
}
