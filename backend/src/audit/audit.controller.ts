import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Get audit logs for the workspace' })
  async getLogs(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const clampedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const clampedOffset = Math.max(Number(offset) || 0, 0);
    return this.auditService.getLogs(effectiveWorkspaceId, clampedLimit, clampedOffset);
  }
}
