import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { RouteClass } from '../../common/throttler/route-class.decorator';
import { BrainSpineAuditService } from '../../brain/brain-spine-audit.service';

@Public()
@Controller('admin/brain')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
@RouteClass('read')
export class BrainAuditController {
  constructor(private readonly audit: BrainSpineAuditService) {}

  @Get('spine-audit')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async spineAudit(@Query('since') since?: string) {
    const sinceIso = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return this.audit.audit(sinceIso);
  }
}
