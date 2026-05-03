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
import { MetaWhatsAppService } from '../meta-whatsapp.service';
import { normalizeMetaGraphSegment } from '../meta-input.util';
import {
  MetaAdsDailyInsightsQueryDto,
  MetaAdsInsightsQueryDto,
} from './dto/meta-ads-insights-query.dto';
import { MetaAdsService } from './meta-ads.service';

/** Meta ads controller. Resolves access token from DB — never accepts it from client. */
@Controller('meta/ads')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MetaAdsController {
  constructor(
    private readonly metaAdsService: MetaAdsService,
    private readonly metaWhatsApp: MetaWhatsAppService,
  ) {}

  private async resolveAdAccountAccess(workspaceId: string, adAccountId: string) {
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }
    return {
      adAccountId: normalizeMetaGraphSegment(
        adAccountId || resolved.adAccountId || '',
        'Meta ad account id',
      ),
      accessToken: resolved.accessToken,
    };
  }

  /** Get campaigns. */
  @Get('campaigns')
  async getCampaigns(@Req() req: AuthenticatedRequest, @Query('adAccountId') adAccountId: string) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveAdAccountAccess(workspaceId, adAccountId);
    return this.metaAdsService.getCampaigns(connection.adAccountId, connection.accessToken);
  }

  /** Update campaign status. */
  @Patch('campaigns/:id/status')
  async updateCampaignStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') campaignId: string,
    @Body() body: { status: 'ACTIVE' | 'PAUSED' },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }
    return this.metaAdsService.updateCampaignStatus(
      normalizeMetaGraphSegment(campaignId, 'Meta campaign id'),
      body.status,
      resolved.accessToken,
    );
  }

  /** Get account insights. */
  @Get('insights/account')
  async getAccountInsights(
    @Req() req: AuthenticatedRequest,
    @Query() query: MetaAdsInsightsQueryDto,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveAdAccountAccess(workspaceId, query.adAccountId);
    return this.metaAdsService.getAccountInsights(connection.adAccountId, connection.accessToken, {
      since: query.since,
      until: query.until,
      level: query.level,
    });
  }

  /** Get daily insights. */
  @Get('insights/daily')
  async getDailyInsights(
    @Req() req: AuthenticatedRequest,
    @Query() query: MetaAdsDailyInsightsQueryDto,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }
    return this.metaAdsService.getCampaignInsights(
      normalizeMetaGraphSegment(query.campaignId, 'Meta campaign id'),
      resolved.accessToken,
      query.since,
      query.until,
    );
  }

  /** Get lead forms. */
  @Get('leads')
  async getLeadForms(@Req() req: AuthenticatedRequest, @Query('pageId') pageId: string) {
    const workspaceId = resolveWorkspaceId(req);
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }
    return this.metaAdsService.getLeadForms(
      normalizeMetaGraphSegment(pageId || resolved.pageId || '', 'Meta page id'),
      resolved.accessToken,
    );
  }

  /** Get leads. */
  @Get('leads/:formId')
  async getLeads(@Req() req: AuthenticatedRequest, @Param('formId') formId: string) {
    const workspaceId = resolveWorkspaceId(req);
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }
    return this.metaAdsService.getLeads(
      normalizeMetaGraphSegment(formId, 'Meta form id'),
      resolved.accessToken,
    );
  }
}
