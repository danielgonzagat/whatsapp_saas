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
    @Query('limit', new PaginationLimitPipe({ default: 50, max: 100 })) limit: number,
    @Query('offset') offset: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const clampedOffset = Math.max(Number(offset) || 0, 0);
    return this.auditService.getLogs(effectiveWorkspaceId, limit, clampedOffset);
  }
}
