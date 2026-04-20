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
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('ad-rules')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AdRulesController {
  private readonly logger = new Logger(AdRulesController.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list(@Request() req: AuthenticatedRequest) {
    try {
      const workspaceId = req.user.workspaceId;
      return await this.prisma.adRule.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (e) {
      this.logger.warn(`AdRule table may not exist yet: ${(e as Error).message}`);
      return [];
    }
  }

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
    return this.prisma.adRule.update({ where: { id }, data: dto });
  }

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
    await this.prisma.adRule.delete({ where: { id } });
    return { success: true };
  }

  @Post(':id/toggle')
  async toggle(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;
    const rule = await this.prisma.adRule.findFirst({
      where: { id, workspaceId },
    });
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    return this.prisma.adRule.update({
      where: { id },
      data: { active: !rule.active },
    });
  }
}
