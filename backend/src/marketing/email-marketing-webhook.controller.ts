import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Optional,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';
import { OpsAlertService } from '../observability/ops-alert.service';
import { EmailMarketingService } from './email-marketing.service';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { PrismaService } from '../prisma/prisma.service';

type ResendWebhookPayload = {
  type: string;
  data: {
    email_id: string;
    created_at?: string;
    event?: string;
  };
};

type SendGridWebhookPayload = Record<string, unknown>[];

const RESEND_EVENT_MAP: Record<
  string,
  'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'COMPLAINT'
> = {
  'email.delivered': 'DELIVERED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINT',
};

const SENDGRID_EVENT_MAP: Record<
  string,
  'DELIVERED' | 'OPENED' | 'CLICKED' | 'REPLIED' | 'BOUNCED' | 'COMPLAINT' | 'UNSUBSCRIBED'
> = {
  delivered: 'DELIVERED',
  open: 'OPENED',
  click: 'CLICKED',
  bounce: 'BOUNCED',
  dropped: 'BOUNCED',
  spamreport: 'COMPLAINT',
  unsubscribe: 'UNSUBSCRIBED',
  group_unsubscribe: 'UNSUBSCRIBED',
  group_resubscribe: 'CLICKED',
};

@Controller('marketing/email/webhook')
@RouteClass('webhook')
export class EmailMarketingWebhookController {
  private readonly logger = new Logger(EmailMarketingWebhookController.name);

  constructor(
    private readonly emailMarketingService: EmailMarketingService,
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private assertInboundSecret(providedSecret?: string, authorization?: string): void {
    const expected = String(process.env.EMAIL_INBOUND_SECRET || '').trim();
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new ForbiddenException('EMAIL_INBOUND_SECRET not configured');
      }
      return;
    }

    const bearer = String(authorization || '').replace(/^Bearer\s+/i, '');
    const provided = String(providedSecret || bearer || '').trim();
    if (!provided || !safeCompareStrings(provided, expected)) {
      this.logger.warn('Email marketing webhook rejected: invalid inbound secret');
      throw new ForbiddenException('Invalid email webhook secret');
    }
  }

  @Public()
  @Post('resend')
  async handleResendWebhook(
    @Body() payload: ResendWebhookPayload,
    @Headers('x-webhook-secret') webhookSecret?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<{ received: boolean; duplicate?: true }> {
    this.assertInboundSecret(webhookSecret, authorization);

    const eventType = payload?.type;
    if (!eventType) {
      this.logger.warn('Resend webhook received without type field');
      return { received: false };
    }

    const mappedEvent = RESEND_EVENT_MAP[eventType];
    if (!mappedEvent) {
      this.logger.log(`Resend webhook event ignored: ${eventType}`);
      return { received: false };
    }

    const providerMessageId = payload?.data?.email_id;
    if (!providerMessageId) {
      this.logger.warn(`Resend webhook "${eventType}" received without email_id`);
      return { received: false };
    }

    const resendExternalId = `resend:${providerMessageId}:${eventType}`;
    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider: 'resend',
          externalId: resendExternalId,
          eventType,
          payload: toPrismaJsonValue(payload),
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.log(`Duplicate Resend webhook: ${resendExternalId}`);
        return { received: true, duplicate: true };
      }
      throw err;
    }

    try {
      await this.emailMarketingService.reconcileDeliveryFromWebhook({
        providerMessageId,
        event: mappedEvent,
        metadata: payload.data,
      });
      this.logger.log(`Resend webhook processed: ${eventType} for ${providerMessageId}`);
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        err,
        'EmailMarketingWebhookController.handleResendWebhook',
      );
    }

    return { received: true };
  }

  @Public()
  @Post('sendgrid')
  async handleSendGridWebhook(
    @Body() payload: SendGridWebhookPayload,
    @Headers('x-webhook-secret') webhookSecret?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<{ received: boolean; duplicate?: true }> {
    this.assertInboundSecret(webhookSecret, authorization);

    if (!Array.isArray(payload)) {
      this.logger.warn('SendGrid webhook received non-array payload');
      return { received: false };
    }

    let processed = 0;

    for (const eventObj of payload) {
      const rawEvent = typeof eventObj.event === 'string' ? eventObj.event : '';
      const mappedEvent = SENDGRID_EVENT_MAP[rawEvent];
      if (!mappedEvent) {
        continue;
      }

      const providerMessageId =
        typeof eventObj.sg_message_id === 'string' ? eventObj.sg_message_id : '';
      if (!providerMessageId) {
        continue;
      }

      const sgEventId = typeof eventObj.sg_event_id === 'string' ? eventObj.sg_event_id : '';
      const sgExternalId = sgEventId || `sendgrid:${providerMessageId}:${rawEvent}`;
      try {
        await this.prisma.webhookEvent.create({
          data: {
            provider: 'sendgrid',
            externalId: sgExternalId,
            eventType: rawEvent,
            payload: toPrismaJsonValue(eventObj),
          },
        });
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'P2002') {
          continue;
        }
        throw err;
      }

      try {
        await this.emailMarketingService.reconcileDeliveryFromWebhook({
          providerMessageId,
          event: mappedEvent,
          metadata: eventObj,
        });
        processed += 1;
      } catch (err: unknown) {
        void this.opsAlert?.alertOnCriticalError(
          err,
          'EmailMarketingWebhookController.handleSendGridWebhook',
        );
      }
    }

    this.logger.log(`SendGrid webhook processed: ${processed}/${payload.length} events`);
    return { received: processed > 0 };
  }
}
