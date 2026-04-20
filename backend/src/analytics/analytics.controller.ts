import { Controller, Get, Param, Query, Req, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { AnalyticsService } from './analytics.service';
import { SmartTimeService } from './smart-time/smart-time.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

function parseDateRange(startDate?: string, endDate?: string) {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  const safeStart = Number.isNaN(start.getTime())
    ? new Date(safeEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
    : start;

  return { start: safeStart, end: safeEnd };
}

/** Analytics controller. */
@Controller('analytics')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
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
  async getDashboard(@Request() req) {
    return this.analyticsService.getDashboardStats(req.user.workspaceId);
  }

  /** Get daily activity. */
  @Get('activity')
  async getDailyActivity(@Request() req) {
    return this.analyticsService.getDailyActivity(req.user.workspaceId);
  }

  /** Get flow stats. */
  @Get('flow/:id')
  async getFlowStats(@Request() req, @Param('id') id: string) {
    return this.analyticsService.getFlowStats(req.user.workspaceId, id);
  }

  /** Get advanced. */
  @Get('advanced')
  async getAdvanced(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const { start, end } = parseDateRange(startDate, endDate);
    return this.advancedAnalyticsService.getAdvancedDashboard(req.user.workspaceId, start, end);
  }

  /** Get full report. */
  @Get('reports')
  async getFullReport(
    @Request() req,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (startDate && endDate) {
      const { start, end } = parseDateRange(startDate, endDate);
      return this.analyticsService.getFullReport(req.user.workspaceId, 'custom', start, end);
    }
    return this.analyticsService.getFullReport(req.user.workspaceId, period || '30d');
  }

  /** Get ai report. */
  @Get('reports/ai')
  async getAIReport(@Request() req) {
    return this.analyticsService.getAIReport(req.user.workspaceId);
  }
}
