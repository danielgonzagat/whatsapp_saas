import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { GdprStatus, GdprType } from '@prisma/client';
import { EmailService } from '../auth/email.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { GdprService } from './gdpr.service';

jest.mock('node:fs', () => {
  const { Writable } = jest.requireActual('node:stream') as typeof import('node:stream');
  const actual = jest.requireActual('node:fs');
  const stream = new Writable({ write: (_ch: unknown, _enc: unknown, cb: () => void) => cb() });
  stream.on = jest.fn().mockImplementation(function (this: Record<string, unknown>, event: string, cb: () => void) {
    if (event === 'close') setImmediate(cb);
    return this;
  });
  return {
    ...actual,
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue('--email-template--'),
    unlinkSync: jest.fn(),
    rmSync: jest.fn(),
    createWriteStream: jest.fn().mockReturnValue(stream),
  };
});

jest.mock('node:os', () => ({
  ...jest.requireActual('node:os'),
  tmpdir: jest.fn(() => '/tmp'),
}));

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn(() => {
    const { RedisConfigurationError } = jest.requireActual('../common/redis/resolve-redis-url');
    throw new RedisConfigurationError('Redis not available in test');
  }),
}));

const mockArchive = {
  pipe: jest.fn(),
  directory: jest.fn(),
  finalize: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

const mockArchiver = jest.fn(() => mockArchive);

jest.mock('archiver', () => ({
  __esModule: true,
  default: mockArchiver,
}));

describe('GdprService', () => {
  let service: GdprService;

  const agentRecord = {
    id: 'agent_1',
    email: 'user@kloel.com',
    name: 'Test User',
    workspaceId: 'ws_1',
  };

  const requestedAt = new Date('2026-05-10T12:00:00.000Z');

  const gdprRecord = {
    id: 'gdpr_1',
    workspaceId: 'ws_1',
    userId: 'agent_1',
    type: GdprType.EXPORT,
    code: 'abc123',
    status: GdprStatus.PENDING,
    requestedAt,
    completedAt: null as Date | null,
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
    },
    agent: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
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
    },
    message: {
      findMany: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();

    jwtMock.sign.mockReturnValue('verification-token');
    jwtMock.verify.mockReturnValue({ sub: 'agent_1', requestId: 'gdpr_1' });
    prismaMock.gdprRequest.create.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findUnique.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findUniqueOrThrow.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findFirst.mockResolvedValue(null);
    prismaMock.gdprRequest.update.mockResolvedValue({ ...gdprRecord, status: GdprStatus.PROCESSING });
    prismaMock.agent.findUnique.mockResolvedValue(agentRecord);
    prismaMock.agent.findFirst.mockResolvedValue(null);
    prismaMock.conversation.findMany.mockResolvedValue([]);
    prismaMock.message.findMany.mockResolvedValue([]);
    emailMock.sendEmail.mockResolvedValue(true);
    emailMock.sendDataDeletionConfirmationEmail.mockResolvedValue(true);
    storageMock.upload.mockResolvedValue({ url: 'https://cdn.example.com/file.zip', path: 'gdpr-exports/file.zip', size: 1024 });
    storageMock.getSignedUrl.mockReturnValue('https://cdn.example.com/signed/file.zip');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GdprService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: EmailService, useValue: emailMock },
        { provide: StorageService, useValue: storageMock },
      ],
    }).compile();

    service = module.get<GdprService>(GdprService);
  });

  describe('requestExport', () => {
    it('creates an export request and sends verification email', async () => {
      const result = await service.requestExport('agent_1', 'ws_1');

      expect(result).toEqual({
        code: expect.any(String),
        status: GdprStatus.PENDING,
        requestedAt,
      });
      expect(prismaMock.gdprRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'agent_1',
            workspaceId: 'ws_1',
            type: GdprType.EXPORT,
            status: GdprStatus.PENDING,
          }),
        }),
      );
      expect(emailMock.sendEmail).toHaveBeenCalled();
    });

    it('generates a unique random code for each request', async () => {
      const result = await service.requestExport('agent_1', 'ws_1');

      expect(result.code).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('requestDeletion', () => {
    it('creates a new deletion request when no existing one', async () => {
      const result = await service.requestDeletion('agent_1', 'ws_1');

      expect(result).toEqual({
        code: expect.any(String),
        status: GdprStatus.PENDING,
        requestedAt,
      });
      expect(prismaMock.gdprRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: GdprType.DELETE,
          }),
        }),
      );
    });

    it('returns existing pending deletion request without creating new one', async () => {
      const existing = {
        ...gdprRecord,
        type: GdprType.DELETE,
        code: 'existing',
        status: GdprStatus.PENDING,
      };
      prismaMock.gdprRequest.findFirst.mockResolvedValueOnce(existing);

      const result = await service.requestDeletion('agent_1', 'ws_1');

      expect(result).toEqual({
        code: 'existing',
        status: GdprStatus.PENDING,
        requestedAt,
        message: 'Solicitação de exclusão já existe.',
      });
      expect(prismaMock.gdprRequest.create).not.toHaveBeenCalled();
    });

    it('throws when a complete deletion already exists', async () => {
      prismaMock.gdprRequest.findFirst.mockResolvedValueOnce({
        ...gdprRecord,
        type: GdprType.DELETE,
        status: GdprStatus.COMPLETE,
      });

      await expect(service.requestDeletion('agent_1', 'ws_1')).rejects.toThrow(BadRequestException);
    });

    it('returns existing request when status is PROCESSING', async () => {
      const processing = {
        ...gdprRecord,
        type: GdprType.DELETE,
        code: 'processing-code',
        status: GdprStatus.PROCESSING,
      };
      prismaMock.gdprRequest.findFirst.mockResolvedValueOnce(processing);

      const result = await service.requestDeletion('agent_1', 'ws_1');

      expect(result.code).toBe('processing-code');
      expect(prismaMock.gdprRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyIdentity', () => {
    it('verifies and enqueues processing', async () => {
      const result = await service.verifyIdentity('abc123', 'valid-token');

      expect(result).toEqual({
        code: 'abc123',
        status: 'PROCESSING',
        message: 'Solicitação verificada e em processamento.',
      });
      expect(jwtMock.verify).toHaveBeenCalledWith('valid-token');
      expect(prismaMock.gdprRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gdpr_1' },
          data: { status: GdprStatus.VERIFYING },
        }),
      );
    });

    it('throws UnauthorizedException for invalid token', async () => {
      jwtMock.verify.mockImplementationOnce(() => {
        throw new Error('jwt malformed');
      });

      await expect(service.verifyIdentity('abc123', 'bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws NotFoundException for unknown code', async () => {
      prismaMock.gdprRequest.findUnique.mockResolvedValueOnce(null);

      await expect(service.verifyIdentity('unknown', 'valid-token')).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when token does not match request', async () => {
      jwtMock.verify.mockReturnValueOnce({ sub: 'other_agent', requestId: 'other_gdpr' });

      await expect(service.verifyIdentity('abc123', 'valid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException when request is not in PENDING state', async () => {
      prismaMock.gdprRequest.findUnique.mockResolvedValueOnce({
        ...gdprRecord,
        status: GdprStatus.VERIFYING,
      });

      await expect(service.verifyIdentity('abc123', 'valid-token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStatus', () => {
    it('returns status for a valid code', async () => {
      const result = await service.getStatus('abc123');

      expect(result).toEqual(
        expect.objectContaining({
          code: 'abc123',
          type: GdprType.EXPORT,
          status: GdprStatus.PENDING,
        }),
      );
    });

    it('throws NotFoundException for unknown code', async () => {
      prismaMock.gdprRequest.findUnique.mockResolvedValueOnce(null);

      await expect(service.getStatus('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleFacebookCallback', () => {
    const makeSignedRequest = (payload: Record<string, unknown>) => {
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
      return `signature.${encoded}`;
    };

    it('creates deletion request when facebook user is found by providerId', async () => {
      prismaMock.agent.findFirst.mockResolvedValueOnce({
        id: 'agent_fb',
        workspaceId: 'ws_fb',
      });

      const result = await service.handleFacebookCallback(
        makeSignedRequest({ user_id: 'fb_123', algorithm: 'HMAC-SHA256' }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          confirmation_code: expect.any(String),
          url: expect.stringContaining('/data-deletion/status/'),
        }),
      );
      expect(prismaMock.gdprRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: GdprType.DELETE,
            status: GdprStatus.VERIFYING,
          }),
        }),
      );
    });

    it('creates deletion request when facebook user found via socialAccounts', async () => {
      prismaMock.agent.findFirst.mockResolvedValueOnce({
        id: 'agent_social',
        workspaceId: 'ws_social',
      });

      const result = await service.handleFacebookCallback(
        makeSignedRequest({ user_id: 'fb_456' }),
      );

      expect(result.confirmation_code).toBeDefined();
    });

    it('returns not_found when facebook user is not found', async () => {
      prismaMock.agent.findFirst.mockResolvedValueOnce(null);

      const result = await service.handleFacebookCallback(
        makeSignedRequest({ user_id: 'unknown_fb' }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          confirmation_code: 'not_found',
        }),
      );
    });

    it('throws BadRequestException for empty signed_request', () => {
      return expect(service.handleFacebookCallback('')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid signed_request format', () => {
      return expect(service.handleFacebookCallback('invalid')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for signed_request without payload', () => {
      return expect(service.handleFacebookCallback('signature.')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for signed_request with invalid base64', () => {
      return expect(service.handleFacebookCallback('sig.!!!invalid')).rejects.toThrow(BadRequestException);
    });
  });

  describe('processExport', () => {
    const fs = jest.requireMock('node:fs') as {
      mkdirSync: jest.Mock;
      writeFileSync: jest.Mock;
      readFileSync: jest.Mock;
      unlinkSync: jest.Mock;
      rmSync: jest.Mock;
      createWriteStream: jest.Mock;
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('completes full export pipeline: sweep, zip, upload, signed URL, cleanup', async () => {
      await service.processExport('gdpr_1');

      expect(prismaMock.gdprRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gdpr_1' },
          data: expect.objectContaining({ status: GdprStatus.PROCESSING }),
        }),
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(mockArchiver).toHaveBeenCalled();
      expect(mockArchive.directory).toHaveBeenCalled();
      expect(storageMock.upload).toHaveBeenCalled();
      expect(storageMock.getSignedUrl).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(fs.rmSync).toHaveBeenCalled();
      expect(prismaMock.gdprRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gdpr_1' },
          data: expect.objectContaining({ status: GdprStatus.COMPLETE }),
        }),
      );
    });

    it('sweeps agent profile, conversations, and messages into export dir', async () => {
      prismaMock.conversation.findMany.mockResolvedValueOnce([
        { id: 'c1', status: 'OPEN', channel: 'WHATSAPP', lastMessageAt: new Date(), createdAt: new Date() },
      ]);
      prismaMock.message.findMany.mockResolvedValueOnce([
        { id: 'm1', content: 'hello', direction: 'INBOUND', createdAt: new Date() },
      ]);

      await service.processExport('gdpr_1');

      expect(prismaMock.agent.findUnique).toHaveBeenCalled();
      expect(prismaMock.conversation.findMany).toHaveBeenCalled();
      expect(prismaMock.message.findMany).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(4); // agent.json, conversations.json, messages.json, manifest.json
    });
  });

  describe('processDeletion', () => {
    it('completes deletion cascade within 30-day window', async () => {
      await service.processDeletion('gdpr_1');

      expect(prismaMock.gdprRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gdpr_1' },
          data: expect.objectContaining({ status: GdprStatus.PROCESSING }),
        }),
      );
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.gdprRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gdpr_1' },
          data: expect.objectContaining({ status: GdprStatus.COMPLETE }),
        }),
      );
    });

    it('marks as FAILED when request exceeds 30-day window', async () => {
      const oldRequest = {
        ...gdprRecord,
        requestedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      };
      prismaMock.gdprRequest.findUniqueOrThrow.mockResolvedValueOnce(oldRequest);

      await service.processDeletion('gdpr_1');

      expect(prismaMock.gdprRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gdpr_1' },
          data: expect.objectContaining({ status: GdprStatus.FAILED }),
        }),
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('executes transaction for cascade anonymization', async () => {
      await service.processDeletion('gdpr_1');

      const txCall = prismaMock.$transaction.mock.calls[0]?.[0] as (tx: typeof prismaMock) => unknown;
      expect(txCall).toBeDefined();
    });

    it('sets evidenceUrl after cascade completion', async () => {
      await service.processDeletion('gdpr_1');

      const evidenceCall = prismaMock.gdprRequest.update.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[0] as { data?: { evidenceUrl?: string } };
          return Boolean(arg?.data?.evidenceUrl);
        },
      );
      expect(evidenceCall).toBeDefined();
    });
  });
});
