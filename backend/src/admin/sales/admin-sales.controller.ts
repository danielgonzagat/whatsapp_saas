import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule, OrderStatus, PaymentMethod } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminSalesService } from './admin-sales.service';

/** Admin sales controller. */
@Public()
@Controller('admin/sales')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminSalesController {
  constructor(private readonly sales: AdminSalesService) {}

  /** Overview. */
  @Get('overview')
  @RequireAdminPermission(AdminModule.VENDAS, AdminAction.VIEW)
  async overview(
    @Query('search') search?: string,
    @Query('status') status?: OrderStatus,
    @Query('method') method?: PaymentMethod,
    @Query('gateway') gateway?: string,
  ) {
    return this.sales.overview({ search, status, method, gateway });
  }
}
