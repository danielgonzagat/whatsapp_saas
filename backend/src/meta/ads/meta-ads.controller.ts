import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { normalizeMetaGraphSegment } from '../meta-input.util';
import { MetaWhatsAppService } from '../meta-whatsapp.service';
import { MetaAdsService } from './meta-ads.service';

@Controller('meta/ads')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MetaAdsController {
  private static readonly ACT_PREFIX_RE = /^act_/i;

  constructor(
    private readonly metaAdsService: MetaAdsService,
    private readonly metaWhatsApp: MetaWhatsAppService,
  ) {}

  private async resolveAdsConnection(workspaceId: string, adAccountId?: string) {
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    const finalAccessToken = String(resolved.accessToken || '').trim();
    const finalAdAccountId = normalizeMetaGraphSegment(
      adAccountId || resolved.adAccountId || '',
      'Meta ad account id',
    ).replace(MetaAdsController.ACT_PREFIX_RE, '');

    if (!finalAccessToken) {
      throw new BadRequestException('meta_ads_connection_required');
    }

    return {
      accessToken: finalAccessToken,
      adAccountId: finalAdAccountId,
    };
  }

  private async resolveLeadFormsConnection(workspaceId: string, pageId?: string) {
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    const finalAccessToken = String(resolved.accessToken || '').trim();
    const finalPageId = normalizeMetaGraphSegment(pageId || resolved.pageId || '', 'Meta page id');

    if (!finalAccessToken) {
      throw new BadRequestException('meta_ads_connection_required');
    }

    return {
      accessToken: finalAccessToken,
      pageId: finalPageId,
    };
  }

  @Get('campaigns')
  async getCampaigns(
    @Req() req: AuthenticatedRequest,
    @Query('adAccountId') adAccountId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveAdsConnection(workspaceId, adAccountId);
    return this.metaAdsService.getCampaigns(connection.adAccountId, connection.accessToken);
  }

  @Patch('campaigns/:id/status')
  async updateCampaignStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') campaignId: string,
    @Body() body: { status: 'ACTIVE' | 'PAUSED' },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveAdsConnection(workspaceId);
    return this.metaAdsService.updateCampaignStatus(
      normalizeMetaGraphSegment(campaignId, 'Meta campaign id'),
      body.status,
      connection.accessToken,
    );
  }

  @Get('insights/account')
  async getAccountInsights(
    @Req() req: AuthenticatedRequest,
    @Query('adAccountId') adAccountId: string,
    @Query('since') since: string,
    @Query('until') until: string,
    @Query('level') level: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveAdsConnection(workspaceId, adAccountId);
    return this.metaAdsService.getAccountInsights(
      connection.adAccountId,
      connection.accessToken,
      {
        since,
        until,
        level,
      },
    );
  }

  @Get('insights/daily')
  async getDailyInsights(
    @Req() req: AuthenticatedRequest,
    @Query('campaignId') campaignId: string,
    @Query('since') since: string,
    @Query('until') until: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveAdsConnection(workspaceId);
    return this.metaAdsService.getCampaignInsights(
      normalizeMetaGraphSegment(campaignId, 'Meta campaign id'),
      connection.accessToken,
      since,
      until,
    );
  }

  @Get('leads')
  async getLeadForms(
    @Req() req: AuthenticatedRequest,
    @Query('pageId') pageId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveLeadFormsConnection(workspaceId, pageId);
    return this.metaAdsService.getLeadForms(connection.pageId, connection.accessToken);
  }

  @Get('leads/:formId')
  async getLeads(
    @Req() req: AuthenticatedRequest,
    @Param('formId') formId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveAdsConnection(workspaceId);
    return this.metaAdsService.getLeads(
      normalizeMetaGraphSegment(formId, 'Meta form id'),
      connection.accessToken,
    );
  }
}
