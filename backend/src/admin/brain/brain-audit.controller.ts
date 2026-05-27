import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { RouteClass } from '../../common/throttler/route-class.decorator';
import { MindSpineAudit } from '../../kloel/mind/observability';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Public()
@Controller('admin/brain')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
@RouteClass('read')
export class BrainAuditController {
  constructor(private readonly audit: MindSpineAudit) {}

  @Get('spine-audit')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  async spineAudit(@Query('since') since?: string) {
    const sinceIso = since ?? new Date(Date.now() - ONE_DAY_MS).toISOString();
    const parsed = Date.parse(sinceIso);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(
        `since must be a valid ISO-8601 timestamp; got: ${JSON.stringify(since)}`,
      );
    }
    return this.audit.audit(new Date(parsed).toISOString());
  }
}
