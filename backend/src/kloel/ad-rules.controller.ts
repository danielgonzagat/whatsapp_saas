import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { OpsAlertService } from '../observability/ops-alert.service';

/** Ad rules controller. */
@Controller('ad-rules')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AdRulesController {
  private readonly logger = new Logger(AdRulesController.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** List. */
  @Get()
  async list(@Request() req: AuthenticatedRequest) {
    try {
      const workspaceId = req.user.workspaceId;
      return await this.prisma.adRule.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (e: unknown) {
      void this.opsAlert?.alertOnCriticalError(e, 'AdRulesController.findMany');
      this.logger.warn(`AdRule table may not exist yet: ${(e as Error).message}`);
      return [];
    }
  }

  /** Create. */
  @Post()
  async create(
    @Request() req: AuthenticatedRequest,
    @Body()
    dto: {
      name: string;
      condition: string;
      action: string;
      alertMethod?: string;
      alertTarget?: string;
      idempotencyKey?: string;
    },
  ) {
    const workspaceId = req.user.workspaceId;
    return this.prisma.adRule.create({
      data: {
        workspaceId,
        name: dto.name,
        condition: dto.condition,
        action: dto.action,
        alertMethod: dto.alertMethod,
        alertTarget: dto.alertTarget,
      },
    });
  }

  /** Update. */
  @Put(':id')
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      condition?: string;
      action?: string;
      alertMethod?: string;
      alertTarget?: string;
      active?: boolean;
    },
  ) {
    const workspaceId = req.user.workspaceId;
    const rule = await this.prisma.adRule.findFirst({
      where: { id, workspaceId },
    });
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    await this.prisma.adRule.updateMany({ where: { id, workspaceId }, data: dto });
    return this.prisma.adRule.findFirstOrThrow({ where: { id, workspaceId } });
  }

  /** Remove. */
  @Delete(':id')
  async remove(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;
    const rule = await this.prisma.adRule.findFirst({
      where: { id, workspaceId },
    });
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'AdRule',
      resourceId: id,
      details: { deletedBy: 'user', name: rule.name },
    });
    await this.prisma.adRule.deleteMany({ where: { id, workspaceId } });
    return { success: true };
  }

  /** Toggle. */
  @Post(':id/toggle')
  async toggle(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;
    const rule = await this.prisma.adRule.findFirst({
      where: { id, workspaceId },
    });
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    await this.prisma.adRule.updateMany({
      where: { id, workspaceId },
      data: { active: !rule.active },
    });
    return this.prisma.adRule.findFirstOrThrow({ where: { id, workspaceId } });
  }
}
