import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { InternalEndpoint } from '../../common/decorators/internal-endpoint.decorator';
import { AdminMindService } from './admin-mind.service';
import {
  AdminMindSurpriseQueryDto,
  AdminMindLiftQueryDto,
  AdminMindConceptsQueryDto,
  AdminMindAskBodyDto,
} from './dto/admin-mind-query.dto';

@Controller('admin/mind')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminMindController {
  constructor(private readonly service: AdminMindService) {}

  @InternalEndpoint('admin mind state')
  @Get(':workspaceId/state')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async state(
    @Param('workspaceId') workspaceId: string,
    @Query('decisionType') decisionType?: string,
  ) {
    return this.service.getState(workspaceId, decisionType);
  }

  @InternalEndpoint('admin mind surprise')
  @Get(':workspaceId/surprise')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async surprise(
    @Param('workspaceId') workspaceId: string,
    @Query() query: AdminMindSurpriseQueryDto,
  ) {
    return this.service.getRecentSurprise(workspaceId, query.limit ?? 20);
  }

  @InternalEndpoint('admin mind lift')
  @Get(':workspaceId/lift')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async lift(@Param('workspaceId') workspaceId: string, @Query() query: AdminMindLiftQueryDto) {
    return this.service.getLift(workspaceId, query.decisionType, query.sinceDays ?? 14);
  }

  @InternalEndpoint('admin mind concepts')
  @Get(':workspaceId/concepts')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async concepts(
    @Param('workspaceId') workspaceId: string,
    @Query() query: AdminMindConceptsQueryDto,
  ) {
    return this.service.getConcepts(workspaceId, query.hours ?? 24);
  }

  @InternalEndpoint('admin mind health')
  @Get(':workspaceId/health')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async health(@Param('workspaceId') workspaceId: string) {
    return this.service.getHealth(workspaceId);
  }

  @InternalEndpoint('admin mind briefing')
  @Get(':workspaceId/briefing')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async briefing(@Param('workspaceId') workspaceId: string) {
    return this.service.getBriefing(workspaceId);
  }

  @InternalEndpoint('admin mind ask')
  @Post(':workspaceId/ask')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async ask(@Param('workspaceId') workspaceId: string, @Body() body: AdminMindAskBodyDto) {
    return this.service.askQuestion(workspaceId, body.question);
  }

  @InternalEndpoint('admin mind global lift')
  @Get('lift')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async liftOverview(@Query('sinceDays') sinceDays?: string) {
    return this.service.getLiftReport(sinceDays ? Number(sinceDays) : 14);
  }

  @InternalEndpoint('admin mind report')
  @Post(':workspaceId/report')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async report(@Param('workspaceId') workspaceId: string) {
    return this.service.generateReport(workspaceId);
  }
}
