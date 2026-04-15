import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { NoAudit } from '../auth/decorators/no-audit.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminHomeCompareDto, AdminHomePeriodDto, ListHomeQueryDto } from './dto/list-home.dto';

@Public()
@Controller('admin/dashboard')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('home')
  @NoAudit()
  @RequireAdminPermission(AdminModule.HOME, AdminAction.VIEW)
  async home(@Query() query: ListHomeQueryDto) {
    return this.dashboard.getHome(
      query.period,
      query.compare ?? AdminHomeCompareDto.PREVIOUS,
      query.from,
      query.to,
    );
  }
}

// Guarantee the enum re-exports stay wired; otherwise Nest DI can tree-shake
// them and class-validator blows up at runtime.
void AdminHomePeriodDto;
