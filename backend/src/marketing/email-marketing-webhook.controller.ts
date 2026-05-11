import { Body, Controller, Logger, Optional, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { Idempotent } from '../common/idempotency.guard';
import { OpsAlertService } from '../observability/ops-alert.service';
import { EmailMarketingService } from './email-marketing.service';

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
export class EmailMarketingWebhookController {
  private readonly logger = new Logger(EmailMarketingWebhookController.name);

  constructor(
    private readonly emailMarketingService: EmailMarketingService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  @Public()
  @Post('resend')
  @Idempotent()
  async handleResendWebhook(@Body() payload: ResendWebhookPayload): Promise<{ received: boolean }> {
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
  @Idempotent()
  async handleSendGridWebhook(
    @Body() payload: SendGridWebhookPayload,
  ): Promise<{ received: boolean }> {
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

      try {
        await this.emailMarketingService.reconcileDeliveryFromWebhook({
          providerMessageId,
          event: mappedEvent,
          metadata: eventObj,
        });
        processed++;
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
