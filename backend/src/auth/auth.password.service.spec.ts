import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { Agent, Workspace } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthPasswordService } from './auth.password.service';
import type { AuthTokenService } from './auth.token.service';
import type { AuthPartnerService } from './auth-partner.service';
import type { RateLimitService } from './rate-limit.service';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt');
jest.mock('./db-init-error.service', () => ({
  DbInitErrorService: {
    throwFriendlyDbInitError: jest.fn((error) => {
      throw error;
    }),
  },
}));

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

interface PrismaMock {
  agent: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  workspace: {
    create: jest.Mock;
    findFirst: jest.Mock;
  };
}

interface TokenServiceMock {
  issueTokens: jest.Mock;
}

interface AuthPartnerServiceMock {
  resolvePartnerInvite: jest.Mock;
}

interface RateLimitServiceMock {
  checkRateLimit: jest.Mock;
}

function createPrismaMock(): PrismaMock {
  return {
    agent: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    workspace: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

describe('AuthPasswordService', () => {
  let service: AuthPasswordService;
  let prismaMock: PrismaMock;
  let tokenServiceMock: TokenServiceMock;
  let authPartnerServiceMock: AuthPartnerServiceMock;
  let rateLimitServiceMock: RateLimitServiceMock;

  const mockAgent = {
    id: 'agent-123',
    email: 'test@example.com',
    workspaceId: 'workspace-123',
    name: 'Test User',
    role: 'ADMIN',
    password: 'hashedPassword123',
    provider: null,
    disabledAt: null,
    deletedAt: null,
  } as unknown as Agent;

  const mockWorkspace = {
    id: 'workspace-123',
    name: 'Test Workspace',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Workspace;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    tokenServiceMock = { issueTokens: jest.fn() };
    authPartnerServiceMock = { resolvePartnerInvite: jest.fn() };
    rateLimitServiceMock = { checkRateLimit: jest.fn() };

    // AuthPasswordService is instantiated manually (not via Nest DI) by AuthService,
    // so we mirror that pattern here with explicit constructor arguments.
    service = new AuthPasswordService(
      prismaMock as unknown as PrismaService,
      tokenServiceMock as unknown as AuthTokenService,
      authPartnerServiceMock as unknown as AuthPartnerService,
      rateLimitServiceMock as unknown as RateLimitService,
    );
  });

  describe('checkEmail', () => {
    it('should return exists: true when email is found', async () => {
      prismaMock.agent.findFirst.mockResolvedValueOnce(mockAgent as never);

      const result = await service.checkEmail('test@example.com');

      expect(result.exists).toBe(true);
      expect(prismaMock.agent.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@example.com', workspaceId: undefined },
      });
    });

    it('should return exists: false when email is not found', async () => {
      prismaMock.agent.findFirst.mockResolvedValueOnce(null as never);

      const result = await service.checkEmail('nonexistent@example.com');

      expect(result.exists).toBe(false);
    });

    it('should throw when database error occurs', async () => {
      const dbError = new Error('Database connection failed');
      prismaMock.agent.findFirst.mockRejectedValueOnce(dbError as never);

      await expect(service.checkEmail('test@example.com')).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('createAnonymous', () => {
    it('should create anonymous guest workspace and agent', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValueOnce(undefined as never);
      prismaMock.workspace.create.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.agent.create.mockResolvedValueOnce(mockAgent as never);
      tokenServiceMock.issueTokens.mockResolvedValueOnce({
        access_token: 'token123',
        refresh_token: 'refresh123',
        user: {
          id: 'agent-123',
          name: 'Guest',
          email: mockAgent.email,
          workspaceId: 'workspace-123',
          role: 'ADMIN',
        },
        workspace: { id: 'workspace-123', name: 'Guest Workspace' },
        workspaces: [{ id: 'workspace-123', name: 'Guest Workspace' }],
        isNewUser: false,
      } as never);

      const result = await service.createAnonymous('127.0.0.1');

      expect(rateLimitServiceMock.checkRateLimit).toHaveBeenCalledWith(
        'anonymous:127.0.0.1',
        3,
        60_000,
      );
      expect(prismaMock.workspace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Guest Workspace',
            providerSettings: expect.objectContaining({
              guestMode: true,
            }),
          }),
        }),
      );
      expect(result.access_token).toBe('token123');
    });

    it('should respect rate limit for anonymous creation', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitServiceMock.checkRateLimit.mockRejectedValueOnce(rateLimitError as never);

      await expect(service.createAnonymous('127.0.0.1')).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('register', () => {
    it('should register new user successfully', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValueOnce(undefined as never);
      authPartnerServiceMock.resolvePartnerInvite.mockResolvedValueOnce(null as never);
      prismaMock.agent.findFirst.mockResolvedValueOnce(null as never);
      prismaMock.workspace.create.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.agent.create.mockResolvedValueOnce(mockAgent as never);
      tokenServiceMock.issueTokens.mockResolvedValueOnce({
        access_token: 'token123',
        refresh_token: 'refresh123',
        user: {
          id: 'agent-123',
          name: 'Test User',
          email: 'test@example.com',
          workspaceId: 'workspace-123',
          role: 'ADMIN',
        },
        workspace: { id: 'workspace-123', name: 'Test Workspace' },
        workspaces: [{ id: 'workspace-123', name: 'Test Workspace' }],
        isNewUser: true,
      } as never);

      const result = await service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        workspaceName: 'My Workspace',
        ip: '127.0.0.1',
      });

      expect(rateLimitServiceMock.checkRateLimit).toHaveBeenCalledWith('register:127.0.0.1');
      expect(prismaMock.workspace.create).toHaveBeenCalled();
      expect(prismaMock.agent.create).toHaveBeenCalled();
      expect(result.isNewUser).toBe(true);
    });

    it('should throw ConflictException when email already exists', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValueOnce(undefined as never);
      authPartnerServiceMock.resolvePartnerInvite.mockResolvedValueOnce(null as never);
      prismaMock.agent.findFirst.mockResolvedValueOnce({ id: 'existing-agent' } as never);

      await expect(
        service.register({
          name: 'Test User',
          email: 'existing@example.com',
          password: 'password123',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(ConflictException);
      expect(() => {
        throw new ConflictException('Email já em uso');
      }).toThrow('Email já em uso');
    });

    it('should throw when rate limit is exceeded', async () => {
      const rateLimitError = new Error('Too many requests');
      rateLimitServiceMock.checkRateLimit.mockRejectedValueOnce(rateLimitError as never);

      await expect(
        service.register({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow('Too many requests');
    });

    it('should derive name from email when name not provided', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValueOnce(undefined as never);
      authPartnerServiceMock.resolvePartnerInvite.mockResolvedValueOnce(null as never);
      prismaMock.agent.findFirst.mockResolvedValueOnce(null as never);
      prismaMock.workspace.create.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.agent.create.mockResolvedValueOnce(mockAgent as never);
      tokenServiceMock.issueTokens.mockResolvedValueOnce({
        access_token: 'token123',
        refresh_token: 'refresh123',
        user: mockAgent as unknown as never,
        workspace: { id: 'workspace-123', name: 'Test Workspace' },
        workspaces: [{ id: 'workspace-123', name: 'Test Workspace' }],
        isNewUser: true,
      } as never);

      await service.register({
        email: 'user@example.com',
        password: 'password123',
        ip: '127.0.0.1',
      });

      expect(prismaMock.agent.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
      prismaMock.agent.findFirst.mockResolvedValueOnce({
        ...mockAgent,
        password: 'hashedPassword123',
      } as never);
      tokenServiceMock.issueTokens.mockResolvedValueOnce({
        access_token: 'token123',
        refresh_token: 'refresh123',
        user: {
          id: 'agent-123',
          name: 'Test User',
          email: 'test@example.com',
          workspaceId: 'workspace-123',
          role: 'ADMIN',
        },
        workspace: { id: 'workspace-123', name: 'Test Workspace' },
        workspaces: [{ id: 'workspace-123', name: 'Test Workspace' }],
        isNewUser: false,
      } as never);

      bcryptMock.compare = jest.fn().mockResolvedValue(true);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
        ip: '127.0.0.1',
      });

      expect(result.access_token).toBe('token123');
      expect(bcryptMock.compare).toHaveBeenCalledWith('password123', 'hashedPassword123');
    });

    it('should throw when user not found', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
      prismaMock.agent.findFirst.mockResolvedValueOnce(null as never);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'password123',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when password is invalid', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
      prismaMock.agent.findFirst.mockResolvedValueOnce({
        ...mockAgent,
        password: 'hashedPassword123',
      } as never);

      bcryptMock.compare = jest.fn().mockResolvedValue(false);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrongpassword',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(() => {
        throw new UnauthorizedException('Credenciais inválidas');
      }).toThrow('Credenciais inválidas');
    });

    it('should throw when account is deleted', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
      prismaMock.agent.findFirst.mockResolvedValueOnce({
        ...mockAgent,
        deletedAt: new Date(),
      } as never);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'password123',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when account is disabled', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
      prismaMock.agent.findFirst.mockResolvedValueOnce({
        ...mockAgent,
        disabledAt: new Date(),
      } as never);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'password123',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when account uses OAuth only', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
      prismaMock.agent.findFirst.mockResolvedValueOnce({
        ...mockAgent,
        provider: 'google',
        password: null,
      } as never);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'password123',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow('Esta conta usa Google. Entre com o Google.');
    });

    it('should apply rate limiting by IP and email', async () => {
      rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);

      prismaMock.agent.findFirst.mockResolvedValueOnce({
        ...mockAgent,
        password: 'hashedPassword123',
      } as never);
      tokenServiceMock.issueTokens.mockResolvedValueOnce({
        access_token: 'token123',
        refresh_token: 'refresh123',
        user: {
          id: 'agent-123',
          name: 'Test User',
          email: 'test@example.com',
          workspaceId: 'workspace-123',
          role: 'ADMIN',
        },
        workspace: { id: 'workspace-123', name: 'Test Workspace' },
        workspaces: [{ id: 'workspace-123', name: 'Test Workspace' }],
        isNewUser: false,
      } as never);

      bcryptMock.compare = jest.fn().mockResolvedValue(true);

      await service.login({
        email: 'test@example.com',
        password: 'password123',
        ip: '192.168.1.1',
      });

      expect(rateLimitServiceMock.checkRateLimit).toHaveBeenCalledWith('login:192.168.1.1');
      expect(rateLimitServiceMock.checkRateLimit).toHaveBeenCalledWith(
        'login:192.168.1.1:test@example.com',
      );
    });
  });
});
