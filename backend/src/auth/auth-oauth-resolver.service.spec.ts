import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthOAuthResolverService, _buildAuthLogMessage } from './auth-oauth-resolver.service';

const AGENT_STUB = {
  id: 'agent-1',
  email: 'user@example.com',
  workspaceId: 'ws-1',
  name: 'User',
  role: 'ADMIN' as const,
  provider: 'google',
  providerId: 'google-123',
  avatarUrl: null,
  emailVerified: true,
  disabledAt: null,
  deletedAt: null,
};

const mockPrismaService = {
  socialAccount: {
    findUnique: jest.fn(),
  },
  agent: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  workspace: {
    create: jest.fn(),
  },
  $transaction: jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return arg({
        agent: mockPrismaService.agent,
        workspace: mockPrismaService.workspace,
      });
    }
    return Promise.all(arg as Array<Promise<unknown>>);
  }),
};

describe('AuthOAuthResolverService', () => {
  let service: AuthOAuthResolverService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthOAuthResolverService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuthOAuthResolverService>(AuthOAuthResolverService);
    prisma = mockPrismaService;
  });

  describe('findExistingAgent', () => {
    it('returns agent from socialAccount when found', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        agent: AGENT_STUB,
      });

      const result = await service.findExistingAgent('google', 'google-123', 'user@example.com');

      expect(result).toEqual(AGENT_STUB);
      expect(prisma.socialAccount.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            provider_providerUserId: {
              provider: 'google',
              providerUserId: 'google-123',
            },
          },
        }),
      );
    });

    it('falls back to provider/providerId lookup when socialAccount not found', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.agent.findFirst.mockResolvedValue(AGENT_STUB);

      const result = await service.findExistingAgent('google', 'google-123', 'user@example.com');

      expect(result).toEqual(AGENT_STUB);
      expect(prisma.agent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { provider: 'google', providerId: 'google-123' },
        }),
      );
    });

    it('finds agent by email when provider lookup yields nothing', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.findMany.mockResolvedValue([
        { ...AGENT_STUB, provider: 'google', providerId: null },
      ]);

      const result = await service.findExistingAgent('google', 'google-123', 'user@example.com');

      expect(result).toEqual(expect.objectContaining({ id: 'agent-1', email: 'user@example.com' }));
      expect(prisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'user@example.com' },
        }),
      );
    });

    it('returns null when no agent exists at all', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.findMany.mockResolvedValue([]);

      const result = await service.findExistingAgent('google', 'google-123', 'new@example.com');

      expect(result).toBeNull();
    });

    it('throws ConflictException when email exists with different provider', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.findMany.mockResolvedValue([
        { ...AGENT_STUB, provider: 'apple', providerId: 'apple-456' },
      ]);

      await expect(
        service.findExistingAgent('google', 'google-123', 'user@example.com'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('patchExistingAgent', () => {
    it('updates stale fields on an existing agent', async () => {
      const staleAgent = { ...AGENT_STUB, provider: undefined, providerId: undefined, name: '' };
      const updated = { ...AGENT_STUB, name: 'NewName' };
      prisma.agent.update.mockResolvedValue(updated);

      const result = await service.patchExistingAgent(staleAgent, {
        normalizedProvider: 'google',
        normalizedProviderId: 'google-123',
        normalizedEmail: 'user@example.com',
        finalName: 'NewName',
        image: null,
        emailVerified: true,
      });

      expect(result).toEqual(updated);
      expect(prisma.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1' },
        }),
      );
    });

    it('returns agent unchanged when no fields need patching', async () => {
      const result = await service.patchExistingAgent(AGENT_STUB, {
        normalizedProvider: 'google',
        normalizedProviderId: 'google-123',
        normalizedEmail: 'user@example.com',
        finalName: 'User',
        image: null,
        emailVerified: true,
        syntheticEmail: false,
      });

      expect(result).toEqual(AGENT_STUB);
      expect(prisma.agent.update).not.toHaveBeenCalled();
    });
  });

  describe('createAgentForOAuth', () => {
    it('creates workspace and agent in a transaction for first-time OAuth user', async () => {
      prisma.workspace.create.mockResolvedValue({ id: 'ws-new' });
      prisma.agent.create.mockResolvedValue({
        ...AGENT_STUB,
        id: 'agent-new',
        workspaceId: 'ws-new',
      });

      const result = await service.createAgentForOAuth({
        finalName: 'NewUser',
        normalizedEmail: 'new@example.com',
        normalizedProvider: 'google',
        normalizedProviderId: 'google-999',
        image: null,
        emailVerified: true,
      });

      expect(result).toEqual(expect.objectContaining({ id: 'agent-new', workspaceId: 'ws-new' }));
      expect(prisma.workspace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "NewUser's Workspace" }),
        }),
      );
      expect(prisma.agent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@example.com',
            role: 'ADMIN',
            provider: 'google',
          }),
        }),
      );
    });
  });

  describe('deriveFinalName', () => {
    it('uses the provided name when non-empty', () => {
      const result = AuthOAuthResolverService.deriveFinalName('Alice', 'alice@example.com');
      expect(result).toBe('Alice');
    });

    it('falls back to email-derived name when name is empty', () => {
      const result = AuthOAuthResolverService.deriveFinalName('', 'john.doe@example.com');
      expect(result).toBe('John doe');
    });

    it('falls back to email-derived name when name is null', () => {
      const result = AuthOAuthResolverService.deriveFinalName(null, 'jane@example.com');
      expect(result).toBe('Jane');
    });
  });

  describe('handleOAuthError', () => {
    it('throws BadRequestException for PrismaClientValidationError', () => {
      expect(() =>
        service.handleOAuthError(new Prisma.PrismaClientValidationError('bad input', {} as never), {
          provider: 'google',
          email: 'user@example.com',
        }),
      ).toThrow(BadRequestException);
    });

    it('throws InternalServerErrorException for generic errors', () => {
      expect(() =>
        service.handleOAuthError(new Error('unexpected failure'), {
          provider: 'google',
          email: 'user@example.com',
        }),
      ).toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException with errorId for string errors', () => {
      expect(() =>
        service.handleOAuthError('something broke', {
          provider: 'facebook',
          email: 'fb@example.com',
        }),
      ).toThrow(InternalServerErrorException);
    });
  });

  describe('_buildAuthLogMessage', () => {
    it('builds JSON log messages', () => {
      const msg = _buildAuthLogMessage('test_event', { key: 'val' });
      expect(() => JSON.parse(msg)).not.toThrow();
      const parsed = JSON.parse(msg);
      expect(parsed.event).toBe('test_event');
      expect(parsed.key).toBe('val');
    });
  });
});
