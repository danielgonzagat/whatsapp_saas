import { InjectRedis } from '@nestjs-modules/ioredis';
import * as crypto from 'node:crypto';
import { createHmac } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';
import {
  sanitizeWebhookChallenge,
  sendPlainTextResponse,
} from '../common/utils/webhook-challenge-response.util';
import { WebhooksService } from '../webhooks/webhooks.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

interface MarketingWebhookBody {
  object?: string;
  entry?: MarketingWebhookEntry[];
}

interface MarketingWebhookEntry {
  id?: string;
  time?: number;
  changes?: MarketingWebhookChange[];
}

interface MarketingWebhookChange {
  field?: string;
  value?: Record<string, unknown>;
}

@Controller('webhooks/meta-marketing')
@RouteClass('webhook')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = String(
      process.env.META_MARKETING_VERIFY_TOKEN ||
        process.env.META_VERIFY_TOKEN ||
        process.env.META_WEBHOOK_VERIFY_TOKEN ||
        '',
    ).trim();

    if (mode === 'subscribe' && verifyToken && safeCompareStrings(token, verifyToken)) {
      const sanitizedChallenge = sanitizeWebhookChallenge(challenge);
      if (!sanitizedChallenge) {
        throw new ForbiddenException('Verification failed');
      }
      this.logger.log('Meta Marketing webhook verified');
      return sendPlainTextResponse(res, sanitizedChallenge);
    }
    throw new ForbiddenException('Verification failed');
  }

  @Public()
  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: MarketingWebhookBody,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: { rawBody?: Buffer },
  ) {
    const appSecret =
      process.env.META_APP_SECRET || (process.env.CI === 'true' ? 'e2e-meta-secret' : '');

    if (appSecret) {
      if (!signature) {
        this.logger.warn('Missing Meta Marketing webhook signature — rejecting');
        throw new ForbiddenException('Missing Meta webhook signature');
      }
      const raw = req.rawBody || Buffer.from(JSON.stringify(body || {}));
      const expected = `sha256=${createHmac('sha256', appSecret)
        .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
        .digest('hex')}`;

      if (!safeCompareStrings(signature, expected)) {
        this.logger.warn('Invalid Meta Marketing webhook signature — rejecting');
        throw new ForbiddenException('Invalid Meta webhook signature');
      }
    }

    // Redis SET NX per-entry dedup (fast gate before DB round-trip)
    const entries = body.entry || [];
    if (entries.length > 0) {
      let allDupes = true;
      for (const entry of entries) {
        const changeField = entry.changes?.[0]?.field || 'unknown';
        const entryRedisKey = `webhook:meta-marketing:${entry.id}-${entry.time}-${changeField}`;
        const acquired = await this.redis.set(entryRedisKey, '1', 'EX', 300, 'NX');
        if (acquired) {allDupes = false;}
      }
      if (allDupes) {
        this.logger.log('All Meta marketing entries already processed (Redis dedup)');
        return 'ok';
      }
    }

    const metaExternalId = `meta_marketing_${crypto
      .createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex')
      .slice(0, 32)}`;

    try {
      await this.webhooksService.logWebhookEvent(
        'meta-marketing',
        String(body.object || 'ad_account'),
        metaExternalId,
        body,
      );
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2002') {
        this.logger.log(`Duplicate Meta marketing webhook event ${metaExternalId}, returning 200`);
        return 'ok';
      }
      this.logger.warn(
        `Failed to log Meta marketing webhook: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return 'ok';
    }

    this.logger.log(
      `Meta marketing webhook received: object=${body.object} entries=${body.entry?.length || 0}`,
    );

    return 'ok';
  }
}
