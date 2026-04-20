import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminDashboardModule } from '../dashboard/admin-dashboard.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminMarketingController } from './admin-marketing.controller';
import { AdminMarketingService } from './admin-marketing.service';

/** Admin marketing module. */
@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminDashboardModule],
  controllers: [AdminMarketingController],
  providers: [AdminMarketingService],
  exports: [AdminMarketingService],
})
export class AdminMarketingModule {}
