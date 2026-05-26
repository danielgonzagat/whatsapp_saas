import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AuditService } from './audit.service';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { PaginationLimitPipe, clampLimit } from '../common/pagination-clamp.pipe';

/** Audit controller. */
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('read')
/**
 * @cluster whatsapp_saas/backend/audit
 * L11 multi-agent TaskGraph annotation (Wave 4 loop-runner).
 */
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** Get logs. */
  @InternalEndpoint('audit log access')
  @Get()
  @ApiOperation({ summary: 'Get audit logs for the workspace' })
  async getLogs(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: string,
    @Query('limit', new PaginationLimitPipe({ default: 50, max: 100 })) limit: number | string | undefined,
    @Query('offset') offset: number | string | undefined,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const clampedLimit = clampLimit(limit, { default: 50, max: 100 });
    const parsedOffset = typeof offset === 'number' ? offset : Number(offset);
    const clampedOffset = Number.isFinite(parsedOffset)
      ? Math.max(Math.floor(parsedOffset), 0)
      : 0;
    return this.auditService.getLogs(effectiveWorkspaceId, clampedLimit, clampedOffset);
  }
}
