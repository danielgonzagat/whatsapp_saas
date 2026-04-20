import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminConfigService } from './admin-config.service';
import { ListConfigOverviewDto } from './dto/list-config-overview.dto';
import { UpdateWorkspaceConfigDto } from './dto/update-workspace-config.dto';

/** Admin config controller. */
@Public()
@Controller('admin/config')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminConfigController {
  constructor(private readonly config: AdminConfigService) {}

  /** Overview. */
  @Get('overview')
  @RequireAdminPermission(AdminModule.CONFIGURACOES, AdminAction.VIEW)
  async overview(@Query() query: ListConfigOverviewDto) {
    return this.config.overview(query.search);
  }

  /** Update workspace. */
  @Patch('workspaces/:workspaceId')
  @RequireAdminPermission(AdminModule.CONFIGURACOES, AdminAction.EDIT)
  async updateWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceConfigDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.config.updateWorkspaceConfig(workspaceId, admin.id, dto);
  }
}
