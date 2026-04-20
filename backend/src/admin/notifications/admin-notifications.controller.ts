import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminNotificationsService } from './admin-notifications.service';

/** Admin notifications controller. */
@Public()
@Controller('admin/notifications')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminNotificationsController {
  constructor(private readonly notifications: AdminNotificationsService) {}

  @Get()
  @RequireAdminPermission(AdminModule.HOME, AdminAction.VIEW)
  async list(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.notifications.list(admin.id);
  }

  @Post(':notificationId/read')
  @RequireAdminPermission(AdminModule.HOME, AdminAction.VIEW)
  async markRead(
    @Param('notificationId') notificationId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.notifications.markRead(admin.id, notificationId);
  }

  @Patch('preferences')
  @RequireAdminPermission(AdminModule.PERFIL, AdminAction.EDIT)
  async updatePreferences(
    @Body()
    preferences: Partial<
      Record<'chargebacks' | 'kyc' | 'support' | 'security' | 'growth', boolean>
    >,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.notifications.updatePreferences(admin.id, preferences);
  }
}
