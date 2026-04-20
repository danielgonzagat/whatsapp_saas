import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { ListHomeQueryDto } from '../dashboard/dto/list-home.dto';
import { AdminReportsService } from './admin-reports.service';

/** Admin reports controller. */
@Public()
@Controller('admin/reports')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  /** Overview. */
  @Get('overview')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async overview(@Query() query: ListHomeQueryDto) {
    return this.reports.overview(query.period, query.from, query.to);
  }

  /** Export csv. */
  @Get('export/csv')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.EXPORT)
  async exportCsv(@Query() query: ListHomeQueryDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.reports.exportCsvRows(query.period, admin.id, query.from, query.to);
  }
}
