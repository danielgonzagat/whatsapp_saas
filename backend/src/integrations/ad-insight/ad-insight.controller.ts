import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { AdInsightService } from './ad-insight.service';

/** Ad insight controller. */
@ApiTags('Ad Insights')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard)
@Controller('ad-insights')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AdInsightController {
  constructor(private readonly adInsightService: AdInsightService) {}

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: string,
    @Query('accountId') accountId?: string,
    @Query('platform') platform?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.adInsightService.list(effectiveWorkspaceId, {
      accountId,
      platform,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }

  @Get('summary')
  async getSummary(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: string,
    @Query('accountId') accountId?: string,
    @Query('platform') platform?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.adInsightService.getSummary(effectiveWorkspaceId, {
      accountId,
      platform,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
    });
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      workspaceId: string;
      accountId: string;
      platform: string;
      date: string;
      spend?: number;
      revenue?: number;
      roas?: number;
      conversions?: number;
      impressions?: number;
      clicks?: number;
      ctr?: number;
      cpc?: number;
    },
  ) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.adInsightService.create(effectiveWorkspaceId, {
      ...data,
      date: new Date(data.date),
    });
  }

  @Post('sync')
  async sync(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      workspaceId: string;
      accountId: string;
      platform: string;
      insights: Array<{
        date: string;
        spend?: number;
        revenue?: number;
        roas?: number;
        conversions?: number;
        impressions?: number;
        clicks?: number;
        ctr?: number;
        cpc?: number;
      }>;
    },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.adInsightService.syncInsights(
      effectiveWorkspaceId,
      body.accountId,
      body.platform,
      body.insights.map((i) => ({ ...i, date: new Date(i.date) })),
    );
  }

  @Put(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body()
    body: {
      workspaceId?: string;
      spend?: number;
      revenue?: number;
      roas?: number;
      conversions?: number;
      impressions?: number;
      clicks?: number;
      ctr?: number;
      cpc?: number;
    },
  ) {
    const { workspaceId, ...data } = body || {};
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.adInsightService.update(effectiveWorkspaceId, id, data);
  }

  @Delete(':id')
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.adInsightService.delete(effectiveWorkspaceId, id);
  }
}
