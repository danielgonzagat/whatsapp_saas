import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminDashboardModule } from '../dashboard/admin-dashboard.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminSalesController } from './admin-sales.controller';
import { AdminSalesService } from './admin-sales.service';

/** Admin sales module. */
@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminDashboardModule],
  controllers: [AdminSalesController],
  providers: [AdminSalesService],
  exports: [AdminSalesService],
})
export class AdminSalesModule {}
