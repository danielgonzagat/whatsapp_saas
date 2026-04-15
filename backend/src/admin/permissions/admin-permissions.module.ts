import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { AdminPermissionsService } from './admin-permissions.service';

@Module({
  imports: [PrismaModule],
  providers: [AdminPermissionsService, AdminPermissionGuard, AdminRoleGuard],
  exports: [AdminPermissionsService, AdminPermissionGuard, AdminRoleGuard],
})
export class AdminPermissionsModule {}
