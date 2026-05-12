import { Controller, Get, Post, Query, Req, Param } from '@nestjs/common';
import type { Request } from 'express';
import { AnunciosService } from './anuncios.service';
import { AdsSyncProcessor } from '../integrations/ads-sync.processor';
import { RouteClass } from '../common/throttler/route-class.decorator';

interface WorkspaceRequest extends Request {
  workspaceId?: string;
}

@Controller('api/anuncios')
@RouteClass('mutate')
export class AnunciosController {
  constructor(
    private readonly anunciosService: AnunciosService,
    private readonly adsSyncProcessor: AdsSyncProcessor,
  ) {}

  private workspaceId(req: Request): string {
    return (req as WorkspaceRequest).workspaceId || '';
  }

  @Get('status')
  async getStatus(@Req() req: Request) {
    const wsId = this.workspaceId(req);
    const statuses = await this.anunciosService.getPlatformStatuses(wsId);
    return { data: statuses };
  }

  @Get('sync-status/meta')
  async getMetaSyncStatus(@Req() req: Request) {
    const wsId = this.workspaceId(req);
    const status = await this.adsSyncProcessor.getSyncStatus(wsId);
    return { data: status };
  }

  @Get('sync-status/google')
  async getGoogleSyncStatus(@Req() req: Request) {
    const wsId = this.workspaceId(req);
    const status = await this.adsSyncProcessor.getSyncStatus(wsId);
    return { data: status };
  }

  @Get('accounts')
  async getAccounts(@Req() req: Request, @Query('platform') platform?: string) {
    const wsId = this.workspaceId(req);
    const accounts = await this.anunciosService.getAccounts(wsId, platform);
    return { data: accounts };
  }

  @Get('campaigns')
  async getCampaigns(@Req() req: Request, @Query('platform') platform?: string) {
    const wsId = this.workspaceId(req);
    const campaigns = await this.anunciosService.getCampaigns(wsId, platform);
    return { data: campaigns };
  }

  @Get('connect/:platform')
  async getConnectUrl(@Req() req: Request, @Param('platform') platform: string) {
    const wsId = this.workspaceId(req);
    const result = await this.anunciosService.getConnectUrl(wsId, platform);
    return { data: result };
  }

  @Post('disconnect/:platform')
  async disconnect(@Req() req: Request, @Param('platform') platform: string) {
    const wsId = this.workspaceId(req);
    const result = await this.anunciosService.disconnect(wsId, platform);
    return { data: result };
  }

  @Post('sync/accounts')
  async syncAccounts(@Req() req: Request) {
    const wsId = this.workspaceId(req);
    const accounts = await this.anunciosService.syncAccounts(wsId);
    return { data: accounts };
  }

  @Post('sync/campaigns')
  async syncCampaigns(@Req() req: Request) {
    const wsId = this.workspaceId(req);
    const campaigns = await this.anunciosService.syncCampaigns(wsId);
    return { data: campaigns };
  }
}
