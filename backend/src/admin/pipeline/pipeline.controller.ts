import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { PipelineService } from './pipeline.service';

@Controller('admin/pipeline')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class PipelineController {
  constructor(private readonly service: PipelineService) {}

  @Get('state')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async state(@Query('workspaceId') workspaceId: string) {
    return this.service.getState(workspaceId);
  }

  @Post('state')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async setState(
    @Body()
    body: {
      workspaceId: string;
      state: 'legacy' | 'shadow' | 'active';
      reason?: string;
    },
  ) {
    return this.service.setState(
      body.workspaceId,
      body.state,
      'admin',
      body.reason,
    );
  }

  @Get('health')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async health(@Query('workspaceId') workspaceId: string) {
    return this.service.getHealth(workspaceId);
  }
}
