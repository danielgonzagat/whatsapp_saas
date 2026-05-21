import type { PrismaService } from '../../prisma/prisma.service';
import type { InboundProcessorService } from '../../whatsapp/inbound-processor.service';
import type { WebhooksService } from '../../webhooks/webhooks.service';
import type { MetaWhatsAppService } from '../meta-whatsapp.service';
import type { OmnichannelService } from '../../inbox/omnichannel.service';
import { MetaWebhookController } from './meta-webhook.controller';

describe('Core MetaWebhookController', () => {
  let controller: MetaWebhookController;
  let redis: { set: jest.Mock };
  let webhooksService: { logWebhookEvent: jest.Mock; markWebhookProcessed: jest.Mock };

  beforeEach(() => {
    redis = { set: jest.fn().mockResolvedValue('OK') };
    webhooksService = {
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    };
    controller = new MetaWebhookController(
      { touchWebhookHeartbeat: jest.fn() } as never,
      { processInboundMessage: jest.fn() } as never,
      {
        processInstagramWebhook: jest.fn(),
        handleIncomingMessage: jest.fn(),
      } as never,
      {
        metaConnection: { findFirst: jest.fn() },
        message: { updateMany: jest.fn() },
      } as never as PrismaService,
      webhooksService as never as WebhooksService,
      redis as never,
    );
  });

  afterEach(() => {
    delete process.env.META_APP_SECRET;
  });

  it('rejects unsigned POST payloads when META_APP_SECRET is configured', async () => {
    process.env.META_APP_SECRET = 'test-secret';
    const body = { object: 'page', entry: [] };

    await expect(
      controller.handleWebhook(body, '', undefined, {
        rawBody: Buffer.from(JSON.stringify(body)),
      } as never),
    ).rejects.toThrow('Missing Meta webhook signature');

    expect(redis.set).not.toHaveBeenCalled();
    expect(webhooksService.logWebhookEvent).not.toHaveBeenCalled();
  });
});
