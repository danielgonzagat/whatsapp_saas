import * as crypto from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type WebhookEvent } from '@prisma/client';
import type { Redis } from 'ioredis';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PaymentService } from './payment.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

/** Payment controller. */
@Controller('kloel/payments')
@UseGuards(ThrottlerGuard)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly webhooksService: WebhooksService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /** Payment webhook. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // Webhooks precisam de limite alto
  async paymentWebhook(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Headers('x-event-id') eventId: string | undefined,
    @Body()
    body: {
      event: string;
      payment: Record<string, unknown> & { workspaceId?: string };
      workspaceId?: string;
    },
  ) {
    const expected = process.env.PAYMENT_WEBHOOK_SECRET;
    if (process.env.NODE_ENV === 'production' && !expected) {
      throw new ForbiddenException('PAYMENT_WEBHOOK_SECRET not configured');
    }
    if (expected) {
      if (!secret || !safeCompareStrings(secret, expected)) {
        throw new ForbiddenException('invalid_webhook_secret');
      }
    }

    // Double-layer idempotency: Redis SET NX + WebhookEvent unique constraint
    const redisKey =
      eventId ||
      `webhook:payment_kloel:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}`;
    const acquired = await this.redis.set(redisKey, '1', 'EX', 300, 'NX');
    if (!acquired) {
      this.logger.warn(`Duplicate Kloel payment webhook (Redis): ${redisKey}`);
      return { received: true, duplicate: true };
    }

    const externalId = eventId || `kloel_payment_${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}`;
    let webhookEvent: WebhookEvent | undefined;
    try {
      webhookEvent = await this.webhooksService.logWebhookEvent(
        'kloel_payment',
        body.event || 'unknown',
        externalId,
        body,
      );
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2002') {
        this.logger.log(`Duplicate Kloel payment webhook event ${externalId}, returning 200`);
        return { received: true, duplicate: true };
      }
      this.logger.warn(
        `Failed to log Kloel payment webhook event: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    const rawWsId =
      body.workspaceId ||
      (body?.payment?.metadata as Record<string, unknown> | undefined)?.workspaceId ||
      body?.payment?.workspaceId;
    const workspaceId = typeof rawWsId === 'string' ? rawWsId : undefined;
    if (!workspaceId) {
      throw new BadRequestException('missing_workspaceId');
    }

    await this.paymentService.processPaymentWebhook(workspaceId, body.event, body.payment);

    if (webhookEvent?.id) {
      await this.webhooksService
        .markWebhookProcessed(webhookEvent.id)
        .catch((err: unknown) =>
          this.logger.error(
            `Failed to mark webhook ${webhookEvent.id} as processed: ${err instanceof Error ? err.message : 'unknown'}`,
          ),
        );
    }

    return { received: true };
  }

  /** Create payment. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('create/:workspaceId')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Máximo 10 criações de pagamento por minuto
  async createPayment(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      leadId: string;
      customerName: string;
      customerPhone: string;
      amount: number;
      description?: string;
      productName?: string;
    },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const payment = await this.paymentService.createPayment({
      workspaceId: effectiveWorkspaceId,
      ...body,
      description: body.description || body.productName || 'Pagamento KLOEL',
    });

    return {
      success: true,
      paymentLink: payment.paymentLink || payment.invoiceUrl || payment.pixCopyPaste,
      payment,
    };
  }

  /** Sales report. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('report/:workspaceId')
  async salesReport(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Query('period') period: string = 'week',
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.paymentService.getSalesReport(effectiveWorkspaceId, period);
  }

  /** Get status. */
  @Get('status')
  getStatus() {
    return { status: 'online', service: 'KLOEL Payment Service' };
  }

  /** Get public payment. */
  @Public()
  @Get('public/:paymentId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getPublicPayment(@Param('paymentId') paymentId: string) {
    const payment = await this.paymentService.getPublicPayment(paymentId);
    if (!payment) {
      throw new NotFoundException('payment_not_found');
    }
    return payment;
  }
}
