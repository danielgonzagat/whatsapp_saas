import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminClientsService } from './admin-clients.service';
import { ListClientsQueryDto } from './dto/list-clients.dto';
import { RouteClass } from '../../common/throttler/route-class.decorator';

/** Admin clients controller. */
@Public()
@Controller('admin/clients')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
@RouteClass('read')
export class AdminClientsController {
  constructor(private readonly clients: AdminClientsService) {}

  /** List. */
  @Get()
  @RequireAdminPermission(AdminModule.CLIENTES, AdminAction.VIEW)
  async list(@Query() query: ListClientsQueryDto) {
    return this.clients.list({
      ...(query.search !== undefined ? { search: query.search } : {}),
      ...(query.kycStatus !== undefined ? { kycStatus: query.kycStatus } : {}),
      ...(query.skip !== undefined ? { skip: query.skip } : {}),
      ...(query.take !== undefined ? { take: query.take } : {}),
    });
  }
}
