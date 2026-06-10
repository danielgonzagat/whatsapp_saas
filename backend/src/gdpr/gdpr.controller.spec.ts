import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  type INestApplication,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { GdprStatus, GdprType } from '@prisma/client';
import type { Server } from 'node:http';
import { type Response } from 'express';
import { EmailService } from '../auth/email.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import { injectHttpRequest } from '../../test/helpers/in-process-http';

jest.mock('../common/redis/redis.util', () => {
  const actual = jest.requireActual<typeof import('../common/redis/redis.util')>(
    '../common/redis/redis.util',
  );
  return {
    ...actual,
    createBullMqConnectionOptions: jest.fn(() => {
      const { RedisConfigurationError } = jest.requireActual<
        typeof import('../common/redis/resolve-redis-url')
      >('../common/redis/resolve-redis-url');
      throw new RedisConfigurationError('Redis not available in test');
    }),
    createRedisClient: jest.fn(() => {
      const { RedisConfigurationError } = jest.requireActual<
        typeof import('../common/redis/resolve-redis-url')
      >('../common/redis/resolve-redis-url');
      throw new RedisConfigurationError('Redis not available in test');
    }),
  };
});

jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class SpecJwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../common/guards/workspace.guard', () => ({
  WorkspaceGuard: class SpecWorkspaceGuard {
    canActivate() {
      return true;
    }
  },
}));

type HttpLikeException = {
  getResponse: () => unknown;
  getStatus: () => number;
};

function isHttpLikeException(exception: unknown): exception is HttpLikeException {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'getResponse' in exception &&
    'getStatus' in exception &&
    typeof exception.getResponse === 'function' &&
    typeof exception.getStatus === 'function'
  );
}

@Catch()
class SpecHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (!isHttpLikeException(exception)) {
      response.status(500).json({ message: 'Internal server error', statusCode: 500 });
      return;
    }

    const body = exception.getResponse();
    response
      .status(exception.getStatus())
      .json(typeof body === 'string' ? { message: body } : body);
  }
}

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

  const prismaMock = createPartialPrismaMock({
    gdprRequest: ['create', 'findUnique', 'findUniqueOrThrow', 'findFirst', 'update', 'updateMany'],
    agent: ['findUnique', 'findFirst', 'update', 'updateMany'],
    refreshToken: ['updateMany'],
    socialAccount: ['updateMany'],
    magicLinkToken: ['updateMany'],
    auditLog: ['create'],
    conversation: ['findMany', 'updateMany'],
    message: ['findMany', 'updateMany'],
    chatMessage: ['findMany', 'updateMany'],
  });
  prismaMock.$transaction = jest.fn((arg: unknown, _opts?: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

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
    app.useGlobalFilters(new SpecHttpExceptionFilter());
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
      const response = await injectHttpRequest(app.getHttpServer() as Server, {
        method: 'GET',
        path: '/gdpr/status/abc123',
      });

      expect(response.status).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          code: 'abc123',
          type: 'EXPORT',
          status: 'PENDING',
        }),
      );
    });

    it('returns 404 for unknown code', async () => {
      prismaMock.gdprRequest.findFirst.mockResolvedValueOnce(null);

      const response = await injectHttpRequest(app.getHttpServer() as Server, {
        method: 'GET',
        path: '/gdpr/status/unknown',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('facebook-callback', () => {
    it('returns 400 when signed_request is empty', async () => {
      const response = await injectHttpRequest(app.getHttpServer() as Server, {
        method: 'POST',
        path: '/gdpr/facebook-callback',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ signed_request: '' }).toString(),
      });

      expect(response.status).toBe(400);
      expect(response.json()).toEqual(
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

      const response = await injectHttpRequest(app.getHttpServer() as Server, {
        method: 'POST',
        path: '/gdpr/facebook-callback',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ signed_request: `sig.${encodedPayload}` }).toString(),
      });

      expect(response.status).toBe(200);
      const body = response.json<{ confirmation_code?: unknown }>();
      expect(body).toEqual(
        expect.objectContaining({
          url: expect.stringContaining('/data-deletion/status/') as unknown,
        }),
      );
      expect(typeof body.confirmation_code).toBe('string');
    });

    it('returns not_found when facebook user is not in the system', async () => {
      prismaMock.agent.findFirst.mockResolvedValueOnce(null);

      const encodedPayload = Buffer.from(
        JSON.stringify({ user_id: 'unknown_fb_user', algorithm: 'HMAC-SHA256' }),
      ).toString('base64');

      const response = await injectHttpRequest(app.getHttpServer() as Server, {
        method: 'POST',
        path: '/gdpr/facebook-callback',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ signed_request: `sig.${encodedPayload}` }).toString(),
      });

      expect(response.status).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          confirmation_code: 'not_found',
        }),
      );
    });
  });
});
