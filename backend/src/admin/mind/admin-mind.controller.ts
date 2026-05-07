import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminMindService } from './admin-mind.service';
import { AdminMindSurpriseQueryDto, AdminMindLiftQueryDto } from './dto/admin-mind-query.dto';

@Public()
@Controller('admin/mind')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminMindController {
  constructor(private readonly service: AdminMindService) {}

  @Get(':workspaceId/state')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async state(
    @Param('workspaceId') workspaceId: string,
    @Query('decisionType') decisionType?: string,
  ) {
    return this.service.getState(workspaceId, decisionType);
  }

  @Get(':workspaceId/surprise')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async surprise(
    @Param('workspaceId') workspaceId: string,
    @Query() query: AdminMindSurpriseQueryDto,
  ) {
    return this.service.getRecentSurprise(workspaceId, query.limit ?? 20);
  }

  @Get(':workspaceId/lift')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async lift(@Param('workspaceId') workspaceId: string, @Query() query: AdminMindLiftQueryDto) {
    return this.service.getLift(workspaceId, query.decisionType, query.sinceDays ?? 14);
  }
}
