import {
  Controller,
  Post,
  Param,
  Body,
  Query,
  Headers,
  Logger,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { Public } from '../auth/public.decorator';
import { createHmac } from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { ForbiddenException } from '@nestjs/common';

@Controller('hooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    @InjectRedis() private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('catch/:workspaceId/:flowId')
  async catchHook(
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: any,
    @Query() query: any,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-event-id') eventId?: string,
  @Req() req?: any,
  ) {
    await this.verifySignatureOrThrow(signature, req);
    await this.checkIdempotencyOrThrow(eventId, req);
    await this.assertWorkspaceNotSuspended(workspaceId);

    this.logger.log(
      `Webhook received for flow ${flowId} in workspace ${workspaceId}`,
    );

    // Combine body and query for maximum flexibility
    const payload = { ...query, ...body };

    try {
      const result = await this.webhooksService.processWebhook(
        workspaceId,
        flowId,
        payload,
      );
      return {
        status: 'success',
        message: 'Webhook processed',
        executionId: result.executionId,
      };
    } catch (error) {
      this.logger.error(`Webhook failed: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Finance Trigger: recebe eventos de boleto/pix/checkout e dispara flow configurado.
   * Espera body.status (paid/pending/canceled/overdue) e body.phone.
   */
  @Public()
  @Post('finance/:workspaceId')
  async financeHook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-event-id') eventId?: string,
    @Req() req?: any,
  ) {
    await this.verifySignatureOrThrow(signature, req);
    await this.checkIdempotencyOrThrow(eventId, req);
    await this.assertWorkspaceNotSuspended(workspaceId);

    try {
      const res = await this.webhooksService.processFinanceEvent(
        workspaceId,
        body,
      );
      return { status: 'received', ...res };
    } catch (error) {
      this.logger.error(`Finance webhook failed: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('finance/:workspaceId/recent')
  async recentFinance(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { limit?: number; status?: string },
  ) {
    const limit = body?.limit && body.limit > 0 ? body.limit : 50;
    await this.assertWorkspaceNotSuspended(workspaceId);
    return this.webhooksService.getRecentFinanceEvents(
      workspaceId,
      Math.min(limit, 200),
      body?.status,
    );
  }

  private async verifySignatureOrThrow(signature?: string, req?: any) {
    const secret = process.env.HOOKS_WEBHOOK_SECRET;
    if (!secret) return;
    if (!signature) {
      throw new HttpException('Missing webhook signature', HttpStatus.FORBIDDEN);
    }
    const raw = req?.rawBody || JSON.stringify(req?.body || '');
    const expected = createHmac('sha256', secret)
      .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
      .digest('hex');
    if (signature !== expected) {
      throw new HttpException('Invalid webhook signature', HttpStatus.FORBIDDEN);
    }
  }

  private async checkIdempotencyOrThrow(eventId?: string, req?: any) {
    const raw = req?.rawBody || JSON.stringify(req?.body || '');
    const keyId =
      eventId ||
      createHmac('sha256', process.env.HOOKS_WEBHOOK_SECRET || 'hooks_salt')
        .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
        .digest('hex')
        .slice(0, 24);
    const dedupeKey = `webhook:hooks:${keyId}`;
    const set = await this.redis.setnx(dedupeKey, '1');
    if (set === 0) {
      this.logger.warn(`Duplicate webhook ignored: ${keyId}`);
      await this.sendOpsAlert('webhook_duplicate', {
        source: 'hooks',
        key: keyId,
        path: (req as any)?.url,
      });
      throw new HttpException('Duplicate webhook', HttpStatus.OK);
    }
    await this.redis.expire(dedupeKey, 300); // 5 min
  }

  private async assertWorkspaceNotSuspended(pathWorkspaceId?: string) {
    const workspaceId = resolveWorkspaceId({ user: null }, pathWorkspaceId);
    if (!workspaceId) return;
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if ((ws?.providerSettings as any)?.billingSuspended) {
      throw new ForbiddenException('Workspace suspended (billing)');
    }
  }

  private async sendOpsAlert(message: string, meta: any) {
    const url =
      process.env.OPS_WEBHOOK_URL ||
      process.env.AUTOPILOT_ALERT_WEBHOOK ||
      process.env.DLQ_WEBHOOK_URL;
    if (!url || !(global as any).fetch) return;
    try {
      await (global as any).fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: message,
          meta,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'dev',
        }),
      });
    } catch {
      // best effort
    }

    // Persist last alerts for quick inspection (Redis list capped at 50)
    try {
      const payload = {
        type: message,
        meta,
        at: new Date().toISOString(),
      };
      await this.redis.lpush('alerts:webhooks', JSON.stringify(payload));
      await this.redis.ltrim('alerts:webhooks', 0, 49);
    } catch {
      // ignore
    }
  }

  /**
   * Recebe callbacks de status de mensagens (Meta/WPP/etc) para marcar DELIVERED/READ/FAILED.
   * Espera: { workspaceId, externalId, status, errorCode?, phone? }
   */
  @Public()
  @Post('message-status')
  async messageStatus(
    @Body()
    body: {
      workspaceId?: string;
      externalId?: string;
      status: string;
      errorCode?: string;
      phone?: string;
      channel?: string;
    },
    @Headers('x-webhook-signature') signature?: string,
    @Req() req?: any,
  ) {
    await this.verifySignatureOrThrow(signature, req);
    const { workspaceId, externalId, status, errorCode, phone, channel } = body || {};
    return this.webhooksService.updateMessageStatus({
      workspaceId,
      externalId,
      status,
      errorCode,
      phone,
      channel,
    });
  }

  /**
   * Alias para status de e-mail (bounce/entregue). Espera workspaceId + phone ou externalId.
   */
  @Public()
  @Post('email-status')
  async emailStatus(
    @Body()
    body: {
      workspaceId: string;
      externalId?: string;
      status: string;
      errorCode?: string;
      phone?: string;
    },
    @Headers('x-webhook-signature') signature?: string,
    @Req() req?: any,
  ) {
    await this.verifySignatureOrThrow(signature, req);
    return this.webhooksService.updateMessageStatus({
      ...body,
      channel: 'EMAIL',
    });
  }

  /**
   * Alias para status de Telegram (enviado/erro). Espera workspaceId + phone ou externalId.
   */
  @Public()
  @Post('telegram-status')
  async telegramStatus(
    @Body()
    body: {
      workspaceId: string;
      externalId?: string;
      status: string;
      errorCode?: string;
      phone?: string;
    },
    @Headers('x-webhook-signature') signature?: string,
    @Req() req?: any,
  ) {
    await this.verifySignatureOrThrow(signature, req);
    return this.webhooksService.updateMessageStatus({
      ...body,
      channel: 'TELEGRAM',
    });
  }
}
