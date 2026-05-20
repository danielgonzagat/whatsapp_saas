import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsDateRangeQueryDto, AnalyticsReportQueryDto } from './dto/analytics-query.dto';
import { SmartTimeService } from './smart-time/smart-time.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

import { RouteClass } from '../common/throttler/route-class.decorator';
/**
 * @cluster whatsapp_saas/backend/analytics
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
function parseDateRange(startDate?: string, endDate?: string) {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException('Invalid startDate');
  }
  if (Number.isNaN(end.getTime())) {
    throw new BadRequestException('Invalid endDate');
  }

  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  const safeStart = Number.isNaN(start.getTime())
    ? new Date(safeEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
    : start;

  return { start: safeStart, end: safeEnd };
}

/** Analytics controller. */
@Controller('analytics')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('read')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly smartTimeService: SmartTimeService,
    private readonly advancedAnalyticsService: AdvancedAnalyticsService,
  ) {}

  /** Get smart time. */
  @Get('smart-time')
  async getSmartTime(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.smartTimeService.getBestTime(effectiveWorkspaceId);
  }

  /** Get stats. */
  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.analyticsService.getDashboardStats(effectiveWorkspaceId);
  }

  /** Get dashboard. */
  @Get('dashboard')
  async getDashboard(@Req() req: AuthenticatedRequest) {
    return this.analyticsService.getDashboardStats(req.user.workspaceId);
  }

  /** Get daily activity. */
  @Get('activity')
  async getDailyActivity(@Req() req: AuthenticatedRequest) {
    return this.analyticsService.getDailyActivity(req.user.workspaceId);
  }

  /** Get flow stats. */
  @Get('flow/:id')
  async getFlowStats(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.analyticsService.getFlowStats(req.user.workspaceId, id);
  }

  /** Get advanced. */
  @Get('advanced')
  async getAdvanced(@Req() req: AuthenticatedRequest, @Query() query: AnalyticsDateRangeQueryDto) {
    const { start, end } = parseDateRange(query.startDate, query.endDate);
    return this.advancedAnalyticsService.getAdvancedDashboard(req.user.workspaceId, start, end);
  }

  /** Get full report. */
  @Get('reports')
  async getFullReport(@Req() req: AuthenticatedRequest, @Query() query: AnalyticsReportQueryDto) {
    if (query.startDate && query.endDate) {
      const { start, end } = parseDateRange(query.startDate, query.endDate);
      return this.analyticsService.getFullReport(req.user.workspaceId, 'custom', start, end);
    }
    return this.analyticsService.getFullReport(req.user.workspaceId, query.period || '30d');
  }

  /** Get ai report. */
  @Get('reports/ai')
  async getAIReport(@Req() req: AuthenticatedRequest) {
    return this.analyticsService.getAIReport(req.user.workspaceId);
  }
}
