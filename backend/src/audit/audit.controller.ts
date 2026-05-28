import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AuditService } from './audit.service';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { PaginationLimitPipe } from '../common/pagination-clamp.pipe';

function clampAuditLimit(limit: number | string | undefined): number {
  const parsedLimit = Number(limit ?? 50);
  if (!Number.isFinite(parsedLimit)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(parsedLimit), 1), 100);
}

function clampAuditOffset(offset: number | string | undefined): number {
  const parsedOffset = Number(offset ?? 0);
  if (!Number.isFinite(parsedOffset)) {
    return 0;
  }

  return Math.max(Math.trunc(parsedOffset), 0);
}

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
    @Query('limit', new PaginationLimitPipe({ default: 50, max: 100 }))
    limit: number | string | undefined,
    @Query('offset') offset: number | string | undefined,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const clampedLimit = clampAuditLimit(limit);
    const clampedOffset = clampAuditOffset(offset);
    return this.auditService.getLogs(effectiveWorkspaceId, clampedLimit, clampedOffset);
  }
}
