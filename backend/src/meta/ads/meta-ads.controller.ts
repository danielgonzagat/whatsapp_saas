import { Controller, Get, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { MetaAdsService } from './meta-ads.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { normalizeMetaGraphSegment } from '../meta-input.util';

@Controller('meta/ads')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MetaAdsController {
  constructor(private readonly metaAdsService: MetaAdsService) {}

  @Get('campaigns')
  async getCampaigns(
    @Req() req: any,
    @Query('adAccountId') adAccountId: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.getCampaigns(
      normalizeMetaGraphSegment(adAccountId, 'Meta ad account id'),
      accessToken,
    );
  }

  @Patch('campaigns/:id/status')
  async updateCampaignStatus(
    @Req() req: any,
    @Param('id') campaignId: string,
    @Body() body: { status: 'ACTIVE' | 'PAUSED'; accessToken: string },
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.updateCampaignStatus(
      normalizeMetaGraphSegment(campaignId, 'Meta campaign id'),
      body.status,
      body.accessToken,
    );
  }

  @Get('insights/account')
  async getAccountInsights(
    @Req() req: any,
    @Query('adAccountId') adAccountId: string,
    @Query('since') since: string,
    @Query('until') until: string,
    @Query('level') level: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.getAccountInsights(
      normalizeMetaGraphSegment(adAccountId, 'Meta ad account id'),
      accessToken,
      {
        since,
        until,
        level,
      },
    );
  }

  @Get('insights/daily')
  async getDailyInsights(
    @Req() req: any,
    @Query('campaignId') campaignId: string,
    @Query('since') since: string,
    @Query('until') until: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.getCampaignInsights(
      normalizeMetaGraphSegment(campaignId, 'Meta campaign id'),
      accessToken,
      since,
      until,
    );
  }

  @Get('leads')
  async getLeadForms(
    @Req() req: any,
    @Query('pageId') pageId: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.getLeadForms(
      normalizeMetaGraphSegment(pageId, 'Meta page id'),
      accessToken,
    );
  }

  @Get('leads/:formId')
  async getLeads(
    @Req() req: any,
    @Param('formId') formId: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.getLeads(
      normalizeMetaGraphSegment(formId, 'Meta form id'),
      accessToken,
    );
  }
}
