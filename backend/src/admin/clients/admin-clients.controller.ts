import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminClientsService } from './admin-clients.service';
import { ListClientsQueryDto } from './dto/list-clients.dto';

@Public()
@Controller('admin/clients')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminClientsController {
  constructor(private readonly clients: AdminClientsService) {}

  @Get()
  @RequireAdminPermission(AdminModule.CLIENTES, AdminAction.VIEW)
  async list(@Query() query: ListClientsQueryDto) {
    return this.clients.list({
      search: query.search,
      kycStatus: query.kycStatus,
      skip: query.skip,
      take: query.take,
    });
  }
}
