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
import { resolveWorkspaceId } from '../auth/workspace-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@Controller('analytics')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly smartTimeService: SmartTimeService,
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
}
