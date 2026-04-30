import { Controller, Delete, Get, HttpCode, HttpStatus, Param, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminSessionsService } from './admin-sessions.service';

/** Admin sessions controller. */
@Public()
@Controller('admin/sessions')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminSessionsController {
  constructor(private readonly sessions: AdminSessionsService) {}

  /** List own. */
  @Get('me')
  async listOwn(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.sessions.listOwn(admin.id);
  }

  /** List for user. */
  // PULSE_OK: internal route, admin panel only
  @Get('user/:id')
  @RequireAdminPermission(AdminModule.IAM, AdminAction.VIEW)
  async listForUser(@Param('id') id: string) {
    return this.sessions.listForUser(id);
  }

  /** Revoke. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    await this.sessions.revoke(id, admin.id, admin.role);
  }
}
