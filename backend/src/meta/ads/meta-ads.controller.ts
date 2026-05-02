import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { normalizeMetaGraphSegment } from '../meta-input.util';
import {
  MetaAdsDailyInsightsQueryDto,
  MetaAdsInsightsQueryDto,
} from './dto/meta-ads-insights-query.dto';
import { MetaAdsService } from './meta-ads.service';

/** Meta ads controller. */
@Controller('meta/ads')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MetaAdsController {
  constructor(private readonly metaAdsService: MetaAdsService) {}

  /** Get campaigns. */
  @Get('campaigns')
  async getCampaigns(
    @Req() req: AuthenticatedRequest,
    @Query('adAccountId') adAccountId: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.getCampaigns(
      normalizeMetaGraphSegment(adAccountId, 'Meta ad account id'),
      accessToken,
    );
  }

  /** Update campaign status. */
  @Patch('campaigns/:id/status')
  async updateCampaignStatus(
    @Req() req: AuthenticatedRequest,
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

  /** Get account insights. */
  @Get('insights/account')
  async getAccountInsights(
    @Req() req: AuthenticatedRequest,
    @Query() query: MetaAdsInsightsQueryDto,
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.getAccountInsights(
      normalizeMetaGraphSegment(query.adAccountId, 'Meta ad account id'),
      query.accessToken,
      {
        since: query.since,
        until: query.until,
        level: query.level,
      },
    );
  }

  /** Get daily insights. */
  @Get('insights/daily')
  async getDailyInsights(
    @Req() req: AuthenticatedRequest,
    @Query() query: MetaAdsDailyInsightsQueryDto,
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.getCampaignInsights(
      normalizeMetaGraphSegment(query.campaignId, 'Meta campaign id'),
      query.accessToken,
      query.since,
      query.until,
    );
  }

  /** Get lead forms. */
  @Get('leads')
  async getLeadForms(
    @Req() req: AuthenticatedRequest,
    @Query('pageId') pageId: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.metaAdsService.getLeadForms(
      normalizeMetaGraphSegment(pageId, 'Meta page id'),
      accessToken,
    );
  }

  /** Get leads. */
  @Get('leads/:formId')
  async getLeads(
    @Req() req: AuthenticatedRequest,
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
