import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { ListHomeQueryDto } from '../dashboard/dto/list-home.dto';
import { AdminComplianceService } from './admin-compliance.service';

@Public()
@Controller('admin/compliance')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminComplianceController {
  constructor(private readonly compliance: AdminComplianceService) {}

  @Get('overview')
  @RequireAdminPermission(AdminModule.COMPLIANCE, AdminAction.VIEW)
  async overview(@Query() query: ListHomeQueryDto) {
    return this.compliance.overview(query.period, query.from, query.to);
  }
}
