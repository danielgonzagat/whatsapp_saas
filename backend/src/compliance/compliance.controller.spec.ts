import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { JwtSetValidator } from './utils/jwt-set.validator';

function encodeBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildSignedRequest(payload: Record<string, unknown>, secret: string) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encodedPayload).digest();
  return `${encodeBase64Url(signature)}.${encodedPayload}`;
}

describe('ComplianceController', () => {
  let app: INestApplication;

  const prismaMock = {
    $transaction: jest.fn((arg: unknown, _opts?: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    dataDeletionRequest: {
      create: jest.fn(),
      update: jest.fn(),
    },
    socialAccount: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    agent: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    magicLinkToken: {
      updateMany: jest.fn(),
    },
  };

  beforeAll(async () => {
    process.env.META_APP_SECRET = 'meta-app-secret';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://kloel.com';

    const moduleRef = await Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [
        ComplianceService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: EmailService,
          useValue: { sendDataDeletionConfirmationEmail: jest.fn() },
        },
        {
          provide: JwtSetValidator,
          useValue: { validate: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.dataDeletionRequest.create.mockResolvedValue({
      id: 'ddr_1',
      requestedAt: new Date('2026-04-19T12:00:00.000Z'),
    });
    prismaMock.socialAccount.findFirst.mockResolvedValue({
      agent: {
        id: 'agent_1',
        email: 'founder@kloel.com',
      },
    });
    prismaMock.agent.update.mockResolvedValue({
      id: 'agent_1',
      email: 'deleted-agent_1@removed.local',
    });
    prismaMock.socialAccount.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.magicLinkToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.dataDeletionRequest.update.mockResolvedValue({
      id: 'ddr_1',
      status: 'completed',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a data deletion request and returns confirmation metadata', async () => {
    const signedRequest = buildSignedRequest(
      {
        algorithm: 'HMAC-SHA256',
        issued_at: 1_713_000_000,
        user_id: 'facebook-user-123',
      },
      process.env.META_APP_SECRET ?? '',
    );

    const response = await request(app.getHttpServer())
      .post('/auth/facebook/data-deletion')
      .type('form')
      .send({ signed_request: signedRequest })
      .expect(201);

    expect(prismaMock.dataDeletionRequest.create).toHaveBeenCalled();
    expect(response.body).toEqual(
      expect.objectContaining({
        confirmation_code: expect.any(String),
        url: expect.stringContaining('/data-deletion/status/'),
      }),
    );
  });

  it('returns 400 when facebook data deletion is called without signed_request', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/facebook/data-deletion')
      .type('form')
      .send({})
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'signed_request is required',
      }),
    );
  });

  it('returns 400 when facebook deauthorize is called without signed_request', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/facebook/deauthorize')
      .type('form')
      .send({})
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'signed_request is required',
      }),
    );
  });

  it('revokes facebook tokens on deauthorize callback', async () => {
    const signedRequest = buildSignedRequest(
      {
        algorithm: 'HMAC-SHA256',
        issued_at: 1_713_000_000,
        user_id: 'facebook-user-456',
      },
      process.env.META_APP_SECRET ?? '',
    );

    await request(app.getHttpServer())
      .post('/auth/facebook/deauthorize')
      .type('form')
      .send({ signed_request: signedRequest })
      .expect(200, {});

    expect(prismaMock.socialAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: 'facebook',
          providerUserId: 'facebook-user-456',
        },
      }),
    );
  });
});
