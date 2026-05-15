import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { GdprStatus, GdprType } from '@prisma/client';
import { EmailService } from '../auth/email.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { GdprService } from './gdpr.service';

jest.mock('node:fs', () => {
  const { Writable } = jest.requireActual<typeof import('node:stream')>('node:stream');
  const actual = jest.requireActual<typeof import('node:fs')>('node:fs');
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
  ...jest.requireActual<typeof import('node:os')>('node:os'),
  tmpdir: jest.fn(() => '/tmp'),
}));

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn(() => {
    const { RedisConfigurationError } = jest.requireActual<
      typeof import('../common/redis/resolve-redis-url')
    >('../common/redis/resolve-redis-url');
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

function firstCallArg<T>(mock: { mock: { calls: Array<[unknown, ...unknown[]]> } }): T {
  const [arg] = mock.mock.calls[0] ?? [];
  return arg as T;
}

describe('GdprService', () => {
  let service: GdprService;

  type AgentRecord = {
    id: string;
    email: string;
    name: string;
    workspaceId: string;
  };

  type GdprRecord = {
    id: string;
    workspaceId: string;
    userId: string;
    type: GdprType;
    code: string;
    status: GdprStatus;
    requestedAt: Date;
    completedAt: Date | null;
  };

  type GdprFindFirstArgs = {
    where?: { code?: string; id?: string; type?: GdprType };
  };

  const agentRecord: AgentRecord = {
    id: 'agent_1',
    email: 'user@kloel.com',
    name: 'Test User',
    workspaceId: 'ws_1',
  };

  const requestedAt = new Date('2026-05-10T12:00:00.000Z');

  const gdprRecord: GdprRecord = {
    id: 'gdpr_1',
    workspaceId: 'ws_1',
    userId: 'agent_1',
    type: GdprType.EXPORT,
    code: 'abc123',
    status: GdprStatus.PENDING,
    requestedAt,
    completedAt: null as Date | null,
  };

  const prismaDelegates = {
    gdprRequest: {
      create: jest.fn<Promise<GdprRecord>, [unknown]>(),
      findUnique: jest.fn<Promise<GdprRecord | null>, [unknown]>(),
      findUniqueOrThrow: jest.fn<Promise<GdprRecord>, [unknown]>(),
      findFirst: jest.fn<Promise<GdprRecord | null>, [GdprFindFirstArgs?]>(),
      update: jest.fn<Promise<GdprRecord>, [unknown]>(),
      updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    },
    agent: {
      findUnique: jest.fn<Promise<AgentRecord | null>, [unknown]>(),
      findFirst: jest.fn<Promise<AgentRecord | null>, [unknown]>(),
      update: jest.fn<Promise<AgentRecord>, [unknown]>(),
    },
    refreshToken: {
      updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    },
    socialAccount: {
      updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    },
    magicLinkToken: {
      updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    },
    auditLog: {
      create: jest.fn<Promise<unknown>, [unknown]>(),
    },
    conversation: {
      findMany: jest.fn<Promise<unknown[]>, [unknown]>(),
      updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    },
    message: {
      findMany: jest.fn<Promise<unknown[]>, [unknown]>(),
      updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    },
    chatMessage: {
      findMany: jest.fn<Promise<unknown[]>, [unknown]>(),
      updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    },
  };

  const prismaMock = {
    $transaction: jest.fn((arg: unknown, _opts?: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prismaDelegates) => unknown)(prismaDelegates);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    ...prismaDelegates,
  };

  const jwtMock = {
    sign: jest.fn<string, [unknown, unknown?]>(),
    verify: jest.fn<{ sub: string; requestId: string }, [string]>(),
  };

  const emailMock = {
    sendEmail: jest.fn<Promise<boolean>, [unknown]>(),
    sendDataDeletionConfirmationEmail: jest.fn<Promise<boolean>, [string]>(),
  };

  const storageMock = {
    upload: jest.fn<Promise<{ url: string; path: string; size: number }>, [unknown, unknown]>(),
    getSignedUrl: jest.fn<string, [string, unknown]>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    jwtMock.sign.mockReturnValue('verification-token');
    jwtMock.verify.mockReturnValue({ sub: 'agent_1', requestId: 'gdpr_1' });
    prismaMock.gdprRequest.create.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findUnique.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findUniqueOrThrow.mockResolvedValue(gdprRecord);
    prismaMock.gdprRequest.findFirst.mockImplementation(
      (args?: { where?: { code?: string; id?: string; type?: GdprType } }) => {
        if (args?.where?.type === GdprType.DELETE) {
          return Promise.resolve(null);
        }
        if (args?.where?.id === gdprRecord.id || args?.where?.code) {
          return Promise.resolve(gdprRecord);
        }
        return Promise.resolve(null);
      },
    );
    prismaMock.gdprRequest.update.mockResolvedValue({
      ...gdprRecord,
      status: GdprStatus.PROCESSING,
    });
    prismaMock.gdprRequest.updateMany.mockResolvedValue({ count: 1 });
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

  describe('requestExport', () => {
    it('creates an export request and sends verification email', async () => {
      const result = await service.requestExport('agent_1', 'ws_1');

      expect(result).toEqual({
        code: result.code,
        status: GdprStatus.PENDING,
        requestedAt,
      });
      expect(typeof result.code).toBe('string');
      const createArgs = firstCallArg<{
        data?: { userId?: string; workspaceId?: string; type?: GdprType; status?: GdprStatus };
      }>(prismaMock.gdprRequest.create);
      expect(createArgs.data).toMatchObject({
        userId: 'agent_1',
        workspaceId: 'ws_1',
        type: GdprType.EXPORT,
        status: GdprStatus.PENDING,
      });
      expect(emailMock.sendEmail).toHaveBeenCalled();
    });

    it('generates a unique random code for each request', async () => {
      const result = await service.requestExport('agent_1', 'ws_1');

      expect(result.code).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('requestDeletion', () => {
    it('filters deletion lookup by workspaceId to prevent cross-tenant leak', async () => {
      prismaMock.gdprRequest.findFirst.mockResolvedValueOnce(null);

      await service.requestDeletion('agent_1', 'ws_1');

      const findArgs = firstCallArg<{ where?: { workspaceId?: string; userId?: string } }>(
        prismaMock.gdprRequest.findFirst,
      );
      expect(findArgs.where).toMatchObject({ workspaceId: 'ws_1', userId: 'agent_1' });
    });

    it('creates a new deletion request when no existing one', async () => {
      const result = await service.requestDeletion('agent_1', 'ws_1');

      expect(result).toEqual({
        code: result.code,
        status: GdprStatus.PENDING,
        requestedAt,
      });
      expect(typeof result.code).toBe('string');
      const createArgs = firstCallArg<{ data?: { type?: GdprType } }>(
        prismaMock.gdprRequest.create,
      );
      expect(createArgs.data).toMatchObject({ type: GdprType.DELETE });
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
      expect(prismaMock.gdprRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gdpr_1', workspaceId: 'ws_1' },
          data: { status: GdprStatus.VERIFYING },
        }),
      );
    });

    it('throws UnauthorizedException for invalid token', async () => {
      jwtMock.verify.mockImplementationOnce(() => {
        throw new Error('jwt malformed');
      });

      await expect(service.verifyIdentity('abc123', 'bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws NotFoundException for unknown code', async () => {
      prismaMock.gdprRequest.findFirst.mockResolvedValueOnce(null);

      await expect(service.verifyIdentity('unknown', 'valid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnauthorizedException when token does not match request', async () => {
      jwtMock.verify.mockReturnValueOnce({ sub: 'other_agent', requestId: 'other_gdpr' });

      await expect(service.verifyIdentity('abc123', 'valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws BadRequestException when request is not in PENDING state', async () => {
      prismaMock.gdprRequest.findFirst.mockResolvedValueOnce({
        ...gdprRecord,
        status: GdprStatus.VERIFYING,
      });

      await expect(service.verifyIdentity('abc123', 'valid-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
