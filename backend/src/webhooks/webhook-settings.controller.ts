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
import {
  decryptWebhookSubscriptionSecret,
  encryptWebhookSubscriptionSecret,
} from './webhook-subscription.crypto';

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

  private serializeSubscription(
    subscription: Record<string, unknown>,
    options?: { exposeSecret?: boolean },
  ) {
    const { secret: _secret, ...rest } = subscription;
    const secret = decryptWebhookSubscriptionSecret(String(subscription.secret || '').trim());
    const suffix = secret.slice(-4);

    return {
      ...rest,
      ...(options?.exposeSecret ? { secret } : {}),
      ...(secret
        ? {
            hasSecret: true,
            secretPreview: suffix ? `****${suffix}` : '****',
          }
        : {
            hasSecret: false,
            secretPreview: null,
          }),
    };
  }

  @Get()
  async list(@Request() req) {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: { workspaceId: req.user.workspaceId },
    });
    return subscriptions.map((subscription) => this.serializeSubscription(subscription));
  }

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
    if (existingRecord) return this.serializeSubscription(existingRecord);

    const created = await this.prisma.webhookSubscription.create({
      data: {
        workspaceId: req.user.workspaceId,
        url: body.url,
        events: body.events,
        secret: encryptWebhookSubscriptionSecret(randomUUID()),
      },
    });
    return this.serializeSubscription(created, { exposeSecret: true });
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
