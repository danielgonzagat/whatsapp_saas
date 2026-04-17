import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { NoAudit } from '../auth/decorators/no-audit.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminTransactionsService } from './admin-transactions.service';
import { ListTransactionsQueryDto } from './dto/list-transactions.dto';
import { OperateTransactionDto } from './dto/operate-transaction.dto';

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

  @Post(':orderId/operate')
  @RequireAdminPermission(AdminModule.VENDAS, AdminAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async operate(
    @Param('orderId') orderId: string,
    @Body() dto: OperateTransactionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.transactions.operate(orderId, admin.id, dto.action, dto.note);
  }
}
