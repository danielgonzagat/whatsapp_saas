import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { GdprStatus, GdprType } from '@prisma/client';
import { EmailService } from '../auth/email.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { GdprService } from './gdpr.service';

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

      const txCall = prismaMock.$transaction.mock.calls[0]?.[0] as (
        tx: typeof prismaMock,
      ) => unknown;
      expect(txCall).toBeDefined();
    });

    it('sets evidenceUrl after cascade completion', async () => {
      await service.processDeletion('gdpr_1');

      const evidenceCall = prismaMock.gdprRequest.update.mock.calls.find((call: unknown[]) => {
        const arg = call[0] as { data?: { evidenceUrl?: string } };
        return Boolean(arg?.data?.evidenceUrl);
      });
      expect(evidenceCall).toBeDefined();
    });

    it('anonymizes owner chat messages and records the count in audit details', async () => {
      prismaMock.chatMessage.updateMany.mockResolvedValueOnce({ count: 3 });

      await service.processDeletion('gdpr_1');

      const updateArgs = prismaMock.chatMessage.updateMany.mock.calls[0][0];
      expect(updateArgs).toEqual({
        where: { workspaceId: 'ws_1', userId: 'agent_1', deletedAt: null },
        data: expect.objectContaining({
          userId: null,
          content: '[deleted by GDPR request]',
          deletedAt: updateArgs.data.deletedAt,
        }),
      });
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            details: expect.objectContaining({ chatMessagesAnonymized: 3 }),
          }),
        }),
      );
    });

    it('unassigns agent-linked conversations and messages while preserving records', async () => {
      prismaMock.conversation.updateMany.mockResolvedValueOnce({ count: 2 });
      prismaMock.message.updateMany.mockResolvedValueOnce({ count: 5 });

      await service.processDeletion('gdpr_1');

      expect(prismaMock.conversation.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws_1', assignedAgentId: 'agent_1' },
        data: { assignedAgentId: null },
      });
      expect(prismaMock.message.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws_1', agentId: 'agent_1' },
        data: { agentId: null },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            details: expect.objectContaining({
              conversationsUnassigned: 2,
              messagesUnassigned: 5,
            }),
          }),
        }),
      );
    });
  });
});
