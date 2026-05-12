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
import { Prisma } from '@prisma/client';
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
import { RouteClass } from '../../common/throttler/route-class.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/** Meta ads controller. Resolves access token from DB — never accepts it from client. */
@Controller('meta/ads')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class MetaAdsController {
  constructor(
    private readonly metaAdsService: MetaAdsService,
    private readonly metaWhatsApp: MetaWhatsAppService,
    private readonly prisma: PrismaService,
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
    @Body() body: { status?: 'ACTIVE' | 'PAUSED'; approvalRequestId?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const normalizedCampaignId = normalizeMetaGraphSegment(campaignId, 'Meta campaign id');
    const approvalRequestId =
      typeof body.approvalRequestId === 'string' ? body.approvalRequestId.trim() : '';

    if (approvalRequestId) {
      const approval = await this.prisma.approvalRequest.findFirst({
        where: {
          id: approvalRequestId,
          workspaceId,
          kind: 'meta_ads:campaign_status',
          entityType: 'MetaAdsCampaign',
          entityId: normalizedCampaignId,
          state: 'APPROVED',
        },
        select: { id: true, payload: true },
      });
      if (!approval || !approval.payload || typeof approval.payload !== 'object') {
        throw new BadRequestException('Approved Meta Ads status request not found');
      }
      const payload = approval.payload as Record<string, unknown>;
      const approvedStatus =
        payload.status === 'ACTIVE' || payload.status === 'PAUSED' ? payload.status : null;
      if (!approvedStatus) {
        throw new BadRequestException('Approved Meta Ads status payload is invalid');
      }
      const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
      if (!resolved.accessToken) {
        throw new BadRequestException('meta_connection_required');
      }
      const result = await this.metaAdsService.updateCampaignStatus(
        normalizedCampaignId,
        approvedStatus,
        resolved.accessToken,
      );
      await this.prisma.approvalRequest.updateMany({
        where: { id: approval.id, workspaceId, state: 'APPROVED' },
        data: {
          state: 'COMPLETED',
          respondedAt: new Date(),
          response: {
            action: 'approved_meta_ads_campaign_status_executed',
            campaignId: normalizedCampaignId,
            status: approvedStatus,
            executedAt: new Date().toISOString(),
          },
        },
      });
      return { approvalExecuted: true, result };
    }

    if (body.status !== 'ACTIVE' && body.status !== 'PAUSED') {
      throw new BadRequestException('status must be ACTIVE or PAUSED');
    }
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }
    const approval = await this.prisma.approvalRequest.create({
      data: {
        workspaceId,
        kind: 'meta_ads:campaign_status',
        scope: 'workspace',
        entityType: 'MetaAdsCampaign',
        entityId: normalizedCampaignId,
        state: 'OPEN',
        title: `Aprovar alteracao de status Meta Ads para ${body.status}`,
        prompt: `A campanha Meta Ads ${normalizedCampaignId} sera alterada para ${body.status}. Revise impacto em gasto de midia antes de autorizar.`,
        payload: {
          campaignId: normalizedCampaignId,
          status: body.status,
          risk: 'high',
          requiresApproval: true,
        } as Prisma.InputJsonObject,
      },
      select: { id: true, state: true, title: true, createdAt: true },
    });
    return {
      approvalRequired: true,
      approvalRequestId: approval.id,
      approvalState: approval.state,
      approval,
      message: 'Alteracao de campanha Meta Ads enviada para aprovacao humana.',
    };
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
      ...(query.level !== undefined ? { level: query.level } : {}),
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
