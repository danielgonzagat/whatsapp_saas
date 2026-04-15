import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminGuardsModule } from '../auth/admin-guards.module';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { AdminPermissionsService } from './admin-permissions.service';

@Module({
  imports: [PrismaModule, AdminGuardsModule],
  providers: [AdminPermissionsService, AdminPermissionGuard, AdminRoleGuard],
  exports: [AdminPermissionsService, AdminPermissionGuard, AdminRoleGuard, AdminGuardsModule],
})
export class AdminPermissionsModule {}
