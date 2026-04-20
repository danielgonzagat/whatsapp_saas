import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminSupportService } from './admin-support.service';
import { ReplySupportTicketDto } from './dto/reply-support-ticket.dto';
import { UpdateSupportTicketStatusDto } from './dto/update-support-ticket-status.dto';

/** Admin support controller. */
@Public()
@Controller('admin/support')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  @Get('overview')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.VIEW)
  async overview(@Query('search') search?: string) {
    return this.support.overview(search);
  }

  @Get(':conversationId')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.VIEW)
  async detail(@Param('conversationId') conversationId: string) {
    return this.support.detail(conversationId);
  }

  @Post(':conversationId/status')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.EDIT)
  async updateStatus(
    @Param('conversationId') conversationId: string,
    @Body() dto: UpdateSupportTicketStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.support.updateStatus(conversationId, dto.status, admin.id);
    return { ok: true };
  }

  @Post(':conversationId/reply')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.EDIT)
  async reply(
    @Param('conversationId') conversationId: string,
    @Body() dto: ReplySupportTicketDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.support.reply(conversationId, admin.id, dto.content);
    return { ok: true };
  }
}
