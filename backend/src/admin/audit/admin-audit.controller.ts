import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { NoAudit } from '../auth/decorators/no-audit.decorator';
import { AdminAuditService } from './admin-audit.service';
import { ListAuditQueryDto } from './dto/list-audit.dto';

/** Admin audit controller. */
@Public()
@Controller('admin/audit')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  @RequireAdminPermission(AdminModule.AUDIT_LOG, AdminAction.VIEW)
  @NoAudit()
  async list(@Query() query: ListAuditQueryDto) {
    return this.audit.list(query);
  }
}
