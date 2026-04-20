import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { ListHomeQueryDto } from '../dashboard/dto/list-home.dto';
import { AdminMarketingService } from './admin-marketing.service';

/** Admin marketing controller. */
@Public()
@Controller('admin/marketing')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminMarketingController {
  constructor(private readonly marketing: AdminMarketingService) {}

  @Get('overview')
  @RequireAdminPermission(AdminModule.MARKETING, AdminAction.VIEW)
  async overview(@Query() query: ListHomeQueryDto) {
    return this.marketing.overview(query.period, query.from, query.to);
  }
}
