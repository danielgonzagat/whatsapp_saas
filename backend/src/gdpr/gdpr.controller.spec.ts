import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { GdprStatus, GdprType } from '@prisma/client';
import * as request from 'supertest';
import { EmailService } from '../auth/email.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';

jest.mock('../common/redis/redis.util', () => {
  const actual = jest.requireActual('../common/redis/redis.util');
  return {
    ...actual,
    createRedisClient: jest.fn(() => {
      const { RedisConfigurationError } = jest.requireActual('../common/redis/resolve-redis-url');
      throw new RedisConfigurationError('Redis not available in test');
    }),
  };
});

describe('GdprController', () => {
  let app: INestApplication;

  const agentRecord = {
    id: 'agent_1',
    email: 'user@kloel.com',
    name: 'Test User',
    workspaceId: 'ws_1',
  };

  const gdprRecord = {
    id: 'gdpr_1',
    workspaceId: 'ws_1',
    userId: 'agent_1',
    type: GdprType.EXPORT,
    code: 'abc123',
    status: GdprStatus.PENDING,
    requestedAt: new Date('2026-05-10T12:00:00.000Z'),
    completedAt: null,
  };

  const prismaMock = {
    $transaction: jest.fn((arg: unknown, _opts?: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    gdprRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    agent: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    socialAccount: {
      updateMany: jest.fn(),
    },
    magicLinkToken: {
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    conversation: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    chatMessage: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const jwtMock = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const emailMock = {
    sendEmail: jest.fn(),
    sendDataDeletionConfirmationEmail: jest.fn(),
  };

  const storageMock = {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GdprController],
      providers: [
        GdprService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: EmailService, useValue: emailMock },
        { provide: StorageService, useValue: storageMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jwtMock.sign.mockReturnValue('verification-token');
    jwtMock.verify.mockReturnValue({ sub: 'agent_1', requestId: 'gdpr_1' });
    prismaMock.gdprRequest.create.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findUnique.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findUniqueOrThrow.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findFirst.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.update.mockResolvedValue({
      ...gdprRecord,
      status: GdprStatus.PROCESSING,
    });
    prismaMock.agent.findUnique.mockResolvedValue(agentRecord);
    prismaMock.agent.findFirst.mockResolvedValue(null);
    prismaMock.conversation.findMany.mockResolvedValue([]);
    prismaMock.conversation.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.message.findMany.mockResolvedValue([]);
    prismaMock.message.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.chatMessage.findMany.mockResolvedValue([]);
    prismaMock.chatMessage.updateMany.mockResolvedValue({ count: 0 });
    emailMock.sendEmail.mockResolvedValue(true);
    emailMock.sendDataDeletionConfirmationEmail.mockResolvedValue(true);
    storageMock.upload.mockResolvedValue({
      url: 'https://cdn.example.com/file.zip',
      path: 'gdpr-exports/file.zip',
      size: 1024,
    });
    storageMock.getSignedUrl.mockReturnValue('https://cdn.example.com/signed/file.zip');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('getStatus', () => {
    it('returns status for a valid code', async () => {
      const response = await request(app.getHttpServer()).get('/gdpr/status/abc123').expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          code: 'abc123',
          type: 'EXPORT',
          status: 'PENDING',
        }),
      );
    });

    it('returns 404 for unknown code', async () => {
      prismaMock.gdprRequest.findFirst.mockResolvedValueOnce(null);

      await request(app.getHttpServer()).get('/gdpr/status/unknown').expect(404);
    });
  });

  describe('facebook-callback', () => {
    it('returns 400 when signed_request is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/gdpr/facebook-callback')
        .type('form')
        .send({ signed_request: '' })
        .expect(400);

      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'signed_request inválido.',
        }),
      );
    });

    it('creates a deletion request when facebook user is found', async () => {
      prismaMock.agent.findFirst.mockResolvedValueOnce({
        id: 'agent_2',
        workspaceId: 'ws_2',
      });

      const encodedPayload = Buffer.from(
        JSON.stringify({ user_id: 'fb_user_1', algorithm: 'HMAC-SHA256', issued_at: 1713000000 }),
      ).toString('base64');

      const response = await request(app.getHttpServer())
        .post('/gdpr/facebook-callback')
        .type('form')
        .send({ signed_request: `sig.${encodedPayload}` })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          url: expect.stringContaining('/data-deletion/status/'),
        }),
      );
      expect(typeof response.body.confirmation_code).toBe('string');
    });

    it('returns not_found when facebook user is not in the system', async () => {
      prismaMock.agent.findFirst.mockResolvedValueOnce(null);

      const encodedPayload = Buffer.from(
        JSON.stringify({ user_id: 'unknown_fb_user', algorithm: 'HMAC-SHA256' }),
      ).toString('base64');

      const response = await request(app.getHttpServer())
        .post('/gdpr/facebook-callback')
        .type('form')
        .send({ signed_request: `sig.${encodedPayload}` })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          confirmation_code: 'not_found',
        }),
      );
    });
  });
});
