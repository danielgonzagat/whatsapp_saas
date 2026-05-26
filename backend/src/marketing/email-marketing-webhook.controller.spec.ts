import { ForbiddenException } from '@nestjs/common';
import { EmailMarketingWebhookController } from './email-marketing-webhook.controller';

describe('EmailMarketingWebhookController', () => {
  let controller: EmailMarketingWebhookController;
  let service: {
    reconcileDeliveryFromWebhook: jest.Mock<Promise<void>, unknown[]>;
  };
  let prisma: {
    webhookEvent: {
      create: jest.Mock<Promise<{ id: string }>, unknown[]>;
    };
  };

  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.EMAIL_INBOUND_SECRET;
    process.env.NODE_ENV = 'test';
    service = {
      reconcileDeliveryFromWebhook: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      webhookEvent: {
        create: jest.fn().mockResolvedValue({ id: 'webhook-event-1' }),
      },
    };
    controller = new EmailMarketingWebhookController(service as never, prisma as never);
  });

  afterEach(() => {
    delete process.env.EMAIL_INBOUND_SECRET;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('processes a Resend delivery event when no test secret is configured', async () => {
    await expect(
      controller.handleResendWebhook({
        type: 'email.delivered',
        data: { email_id: 'email_1', created_at: '2026-05-11T00:00:00.000Z' },
      }),
    ).resolves.toEqual({ received: true });

    expect(service.reconcileDeliveryFromWebhook).toHaveBeenCalledWith({
      providerMessageId: 'email_1',
      event: 'DELIVERED',
      metadata: { email_id: 'email_1', created_at: '2026-05-11T00:00:00.000Z' },
    });
  });

  it('rejects Resend webhook without the configured inbound secret', async () => {
    process.env.EMAIL_INBOUND_SECRET = 'email-secret';

    await expect(
      controller.handleResendWebhook({
        type: 'email.delivered',
        data: { email_id: 'email_1' },
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(service.reconcileDeliveryFromWebhook).not.toHaveBeenCalled();
  });

  it('accepts Resend webhook with bearer secret', async () => {
    process.env.EMAIL_INBOUND_SECRET = 'email-secret';

    await expect(
      controller.handleResendWebhook(
        {
          type: 'email.bounced',
          data: { email_id: 'email_2' },
        },
        undefined,
        'Bearer email-secret',
      ),
    ).resolves.toEqual({ received: true });

    expect(service.reconcileDeliveryFromWebhook).toHaveBeenCalledWith({
      providerMessageId: 'email_2',
      event: 'BOUNCED',
      metadata: { email_id: 'email_2' },
    });
  });

  it('accepts SendGrid webhook with x-webhook-secret', async () => {
    process.env.EMAIL_INBOUND_SECRET = 'email-secret';

    await expect(
      controller.handleSendGridWebhook(
        [{ event: 'spamreport', sg_message_id: 'sg_1', email: 'lead@example.com' }],
        'email-secret',
      ),
    ).resolves.toEqual({ received: true });

    expect(service.reconcileDeliveryFromWebhook).toHaveBeenCalledWith({
      providerMessageId: 'sg_1',
      event: 'COMPLAINT',
      metadata: { event: 'spamreport', sg_message_id: 'sg_1', email: 'lead@example.com' },
    });
  });

  it('rejects email webhooks in production when EMAIL_INBOUND_SECRET is missing', async () => {
    process.env.NODE_ENV = 'production';

    await expect(controller.handleSendGridWebhook([])).rejects.toThrow(ForbiddenException);
  });
});
