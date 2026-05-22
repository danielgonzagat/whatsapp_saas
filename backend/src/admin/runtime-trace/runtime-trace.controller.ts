import { BadRequestException, Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { RuntimeConversationTracerService } from '../../kloel/runtime-conversation-tracer.service';
import { InternalEndpoint } from '../../common/decorators/internal-endpoint.decorator';

@Controller('admin/runtime')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class RuntimeTraceController {
  private readonly logger = new Logger(RuntimeTraceController.name);

  constructor(private readonly tracer: RuntimeConversationTracerService) {}

  @InternalEndpoint('admin runtime trace lookup')
  @Get('trace')
  @RequireAdminPermission(AdminModule.RELATORIOS, AdminAction.VIEW)
  getTrace(
    @Query('workspaceId') workspaceId: string,
    @Query('contactId') contactId: string,
    @Query('correlationId') correlationId: string,
  ) {
    if (!workspaceId || !contactId || !correlationId) {
      throw new BadRequestException(
        'workspaceId, contactId, and correlationId query parameters are required',
      );
    }

    const events = this.tracer.getTrace({ workspaceId, contactId, correlationId });

    this.logger.log(
      `Runtime trace queried for ${workspaceId}:${contactId}:${correlationId} — ${events.length} events`,
    );

    return {
      workspaceId,
      contactId,
      correlationId,
      events: events.map((e) => ({
        kind: e.kind,
        timestamp: new Date(e.timestamp).toISOString(),
        detail: e.detail,
      })),
    };
  }
}
