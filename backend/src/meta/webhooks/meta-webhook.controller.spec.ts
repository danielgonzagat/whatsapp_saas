import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { OmnichannelService } from '../../inbox/omnichannel.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InboundProcessorService } from '../../whatsapp/inbound-processor.service';
import { MetaWhatsAppService } from '../meta-whatsapp.service';
import { MetaWebhookController } from './meta-webhook.controller';

describe('MetaWebhookController', () => {
  let app: INestApplication;
  const originalMetaVerifyToken = process.env.META_VERIFY_TOKEN;
  const originalMetaWebhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const originalMetaAppSecret = process.env.META_APP_SECRET;

  beforeEach(async () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    process.env.META_VERIFY_TOKEN = 'meta-verify-token';

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [MetaWebhookController],
      providers: [
        {
          provide: MetaWhatsAppService,
          useValue: {
            resolveWorkspaceIdByPhoneNumberId: jest.fn(),
            touchWebhookHeartbeat: jest.fn(),
          },
        },
        {
          provide: InboundProcessorService,
          useValue: {},
        },
        {
          provide: OmnichannelService,
          useValue: {
            processInstagramWebhook: jest.fn(),
            handleIncomingMessage: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            workspace: {
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();

    if (originalMetaVerifyToken === undefined) {
      delete process.env.META_VERIFY_TOKEN;
    } else {
      process.env.META_VERIFY_TOKEN = originalMetaVerifyToken;
    }

    if (originalMetaWebhookVerifyToken === undefined) {
      delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    } else {
      process.env.META_WEBHOOK_VERIFY_TOKEN = originalMetaWebhookVerifyToken;
    }

    if (originalMetaAppSecret === undefined) {
      delete process.env.META_APP_SECRET;
    } else {
      process.env.META_APP_SECRET = originalMetaAppSecret;
    }
  });

  it('verifies webhook challenge using META_VERIFY_TOKEN when META_WEBHOOK_VERIFY_TOKEN is absent', async () => {
    await request(app.getHttpServer())
      .get('/webhooks/meta')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'meta-verify-token',
        'hub.challenge': '123456',
      })
      .expect(200)
      .expect('123456');
  });

  it('rejects webhook posts without a signature when META_APP_SECRET is configured', async () => {
    process.env.META_APP_SECRET = 'meta-app-secret';

    await request(app.getHttpServer())
      .post('/webhooks/meta')
      .send({
        object: 'whatsapp_business_account',
        entry: [],
      })
      .expect(403);
  });
});
