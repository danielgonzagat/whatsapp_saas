import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  Param,
  Request,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SmartTimeService } from './smart-time/smart-time.service';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

function parseDateRange(startDate?: string, endDate?: string) {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  const safeStart = Number.isNaN(start.getTime())
    ? new Date(safeEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
    : start;

  return { start: safeStart, end: safeEnd };
}

@Controller('analytics')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly smartTimeService: SmartTimeService,
    private readonly advancedAnalyticsService: AdvancedAnalyticsService,
  ) {}

  @Get('smart-time')
  async getSmartTime(
    @Req() req: any,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.smartTimeService.getBestTime(effectiveWorkspaceId);
  }

  @Get('stats')
  async getStats(@Req() req: any, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.analyticsService.getDashboardStats(effectiveWorkspaceId);
  }

  @Get('dashboard')
  async getDashboard(@Request() req) {
    return this.analyticsService.getDashboardStats(req.user.workspaceId);
  }

  @Get('activity')
  async getDailyActivity(@Request() req) {
    return this.analyticsService.getDailyActivity(req.user.workspaceId);
  }

  @Get('flow/:id')
  async getFlowStats(@Request() req, @Param('id') id: string) {
    return this.analyticsService.getFlowStats(req.user.workspaceId, id);
  }

  @Get('advanced')
  async getAdvanced(@Request() req, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    const { start, end } = parseDateRange(startDate, endDate);
    return this.advancedAnalyticsService.getAdvancedDashboard(req.user.workspaceId, start, end);
  }
}
