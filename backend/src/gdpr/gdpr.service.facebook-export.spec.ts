import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { GdprStatus, GdprType } from '@prisma/client';
import { EmailService } from '../auth/email.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { GdprService } from './gdpr.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

jest.mock('node:fs', () => {
  const { Writable } = jest.requireActual('node:stream');
  const actual = jest.requireActual('node:fs');
  const stream = new Writable({ write: (_ch: unknown, _enc: unknown, cb: () => void) => cb() });
  stream.on = jest.fn().mockImplementation(function (
    this: Record<string, unknown>,
    event: string,
    cb: () => void,
  ) {
    if (event === 'close') {
      setImmediate(cb);
    }
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
  (prismaMock as any).$transaction = jest.fn((arg: unknown, _opts?: unknown) => {
    if (typeof arg === 'function') {return (arg as (tx: unknown) => unknown)(prismaMock);}
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

  beforeEach(async () => {
    jest.clearAllMocks();

    jwtMock.sign.mockReturnValue('verification-token');
    jwtMock.verify.mockReturnValue({ sub: 'agent_1', requestId: 'gdpr_1' });
    prismaMock.gdprRequest.create.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findUnique.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findUniqueOrThrow.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findFirst.mockResolvedValue(null);
    prismaMock.gdprRequest.update.mockResolvedValue({
      ...gdprRecord,
      status: GdprStatus.PROCESSING,
    });
    prismaMock.agent.findUnique.mockResolvedValue(agentRecord);
    prismaMock.agent.findFirst.mockResolvedValue(agentRecord);
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
          url: expect.stringContaining('/data-deletion/status/'),
        }),
      );
      expect(typeof result.confirmation_code).toBe('string');
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

      const result = await service.handleFacebookCallback(makeSignedRequest({ user_id: 'fb_456' }));

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
      return expect(service.handleFacebookCallback('signature.')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for signed_request with invalid base64', () => {
      return expect(service.handleFacebookCallback('sig.!!!invalid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('processExport', () => {
    const fs = jest.requireMock('node:fs');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('completes full export pipeline: sweep, zip, upload, signed URL, cleanup', async () => {
      await service.processExport('gdpr_1');

      expect(prismaMock.gdprRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gdpr_1', workspaceId: 'ws_1' },
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
      expect(prismaMock.gdprRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gdpr_1', workspaceId: 'ws_1' },
          data: expect.objectContaining({ status: GdprStatus.COMPLETE }),
        }),
      );
    });

    it('sweeps agent profile, conversations, and messages into export dir', async () => {
      prismaMock.conversation.findMany.mockResolvedValueOnce([
        {
          id: 'c1',
          status: 'OPEN',
          channel: 'WHATSAPP',
          lastMessageAt: new Date(),
          createdAt: new Date(),
        },
      ]);
      prismaMock.message.findMany.mockResolvedValueOnce([
        { id: 'm1', content: 'hello', direction: 'INBOUND', createdAt: new Date() },
      ]);
      prismaMock.chatMessage.findMany.mockResolvedValueOnce([
        {
          id: 'cm1',
          threadId: 'thread_1',
          role: 'user',
          content: 'internal chat',
          metadata: null,
          createdAt: new Date(),
        },
      ]);

      await service.processExport('gdpr_1');

      expect(prismaMock.agent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent_1', workspaceId: 'ws_1' },
        }),
      );
      expect(prismaMock.conversation.findMany).toHaveBeenCalled();
      expect(prismaMock.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agentId: 'agent_1',
            workspaceId: 'ws_1',
          }),
        }),
      );
      expect(prismaMock.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'agent_1',
            workspaceId: 'ws_1',
          }),
        }),
      );
      expect(fs.writeFileSync).toHaveBeenCalledTimes(5); // agent, conversations, messages, chat_messages, manifest
    });
  });
});
