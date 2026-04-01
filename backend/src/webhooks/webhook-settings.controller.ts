import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('settings/webhooks')
@UseGuards(JwtAuthGuard)
export class WebhookSettingsController {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  @Get()
  async list(@Request() req) {
    return this.prisma.webhookSubscription.findMany({
      where: { workspaceId: req.user.workspaceId },
    });
  }

  @Post()
  async create(
    @Request() req,
    @Body() body: { url: string; events: string[] },
  ) {
    return this.prisma.webhookSubscription.create({
      data: {
        workspaceId: req.user.workspaceId,
        url: body.url,
        events: body.events,
        secret: Math.random().toString(36).substring(2),
      },
    });
  }

  @Delete(':id')
  async delete(@Request() req, @Param('id') id: string) {
    await this.auditService.log({
      workspaceId: req.user.workspaceId,
      action: 'DELETE_RECORD',
      resource: 'WebhookSubscription',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    return this.prisma.webhookSubscription.deleteMany({
      where: { id, workspaceId: req.user.workspaceId },
    });
  }
}
