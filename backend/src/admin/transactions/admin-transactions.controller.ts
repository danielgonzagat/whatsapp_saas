import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

/** Admin transactions controller. */
@Public()
@Controller('admin/transactions')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminTransactionsController {
  constructor(private readonly transactions: AdminTransactionsService) {}

  /** List. */
  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @NoAudit()
  @RequireAdminPermission(AdminModule.VENDAS, AdminAction.VIEW)
  async list(@Query() query: ListTransactionsQueryDto) {
    return this.transactions.list({
      ...(query.search !== undefined ? { search: query.search } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.method !== undefined ? { method: query.method } : {}),
      ...(query.gateway !== undefined ? { gateway: query.gateway } : {}),
      ...(query.workspaceId !== undefined ? { workspaceId: query.workspaceId } : {}),
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
      ...(query.skip !== undefined ? { skip: query.skip } : {}),
      ...(query.take !== undefined ? { take: query.take } : {}),
    });
  }

  /** Operate. */
  @Post(':orderId/operate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RequireAdminPermission(AdminModule.VENDAS, AdminAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async operate(
    @Param('orderId') orderId: string,
    @Body() dto: OperateTransactionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    await this.transactions.operate(orderId, admin.id, dto.action, dto.note, idempotencyKey);
  }
}
