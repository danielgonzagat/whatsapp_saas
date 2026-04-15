import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { NoAudit } from '../auth/decorators/no-audit.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminTransactionsService } from './admin-transactions.service';
import { ListTransactionsQueryDto } from './dto/list-transactions.dto';

@Public()
@Controller('admin/transactions')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminTransactionsController {
  constructor(private readonly transactions: AdminTransactionsService) {}

  @Get()
  @NoAudit()
  @RequireAdminPermission(AdminModule.VENDAS, AdminAction.VIEW)
  async list(@Query() query: ListTransactionsQueryDto) {
    return this.transactions.list({
      search: query.search,
      status: query.status,
      method: query.method,
      gateway: query.gateway,
      workspaceId: query.workspaceId,
      from: query.from,
      to: query.to,
      skip: query.skip,
      take: query.take,
    });
  }
}
