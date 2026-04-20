import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CRUD for outbound webhookEvent subscription URLs.
 * This is NOT a webhook receiver — it manages what URLs get dispatched to.
 * Ordering/sequence is managed by the WebhookDispatcherService via BullMQ jobId.
 */
@Controller('settings/webhooks')
@UseGuards(JwtAuthGuard)
export class WebhookSettingsController {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /** List. */
  @Get()
  async list(@Request() req) {
    return this.prisma.webhookSubscription.findMany({
      where: { workspaceId: req.user.workspaceId },
    });
  }

  /** Create. */
  @Post()
  async create(
    @Request() req,
    @Body() body: { url: string; events: string[] },
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    // Idempotency: if caller provides a key, use upsert-style check
    const existingRecord = idempotencyKey
      ? await this.prisma.webhookSubscription.findFirst({
          where: { workspaceId: req.user.workspaceId, url: body.url },
        })
      : null;
    if (existingRecord) {
      return existingRecord;
    }

    return this.prisma.webhookSubscription.create({
      data: {
        workspaceId: req.user.workspaceId,
        url: body.url,
        events: body.events,
        secret: randomUUID(),
      },
    });
  }

  /** Delete. */
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
