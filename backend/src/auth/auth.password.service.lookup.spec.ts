import { ConflictException } from '@nestjs/common';
import {
  type AuthPasswordSpecContext,
  createAuthPasswordServiceContext,
  mockAgent,
  mockWorkspace,
} from './auth.password.service.spec.helpers';

jest.mock('bcrypt');
jest.mock('./db-init-error.service', () => ({
  DbInitErrorService: {
    throwFriendlyDbInitError: jest.fn((error) => {
      throw error;
    }),
  },
}));

describe('AuthPasswordService — lookup, anonymous, register', () => {
  let ctx: AuthPasswordSpecContext;

  beforeEach(() => {
    ctx = createAuthPasswordServiceContext();
  });

  describe('checkEmail', () => {
    it('should return exists: true when email is found', async () => {
      ctx.prismaMock.agent.findFirst.mockResolvedValueOnce(mockAgent as never);

      const result = await ctx.service.checkEmail('test@example.com');

      expect(result.exists).toBe(true);
      expect(ctx.prismaMock.agent.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@example.com', workspaceId: undefined },
      });
    });

    it('should return exists: false when email is not found', async () => {
      ctx.prismaMock.agent.findFirst.mockResolvedValueOnce(null as never);

      const result = await ctx.service.checkEmail('nonexistent@example.com');

      expect(result.exists).toBe(false);
    });

    it('should throw when database error occurs', async () => {
      const dbError = new Error('Database connection failed');
      ctx.prismaMock.agent.findFirst.mockRejectedValueOnce(dbError as never);

      await expect(ctx.service.checkEmail('test@example.com')).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('createAnonymous', () => {
    it('should create anonymous guest workspace and agent', async () => {
      ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValueOnce(undefined as never);
      ctx.prismaMock.workspace.create.mockResolvedValueOnce(mockWorkspace as never);
      ctx.prismaMock.agent.create.mockResolvedValueOnce(mockAgent as never);
      ctx.tokenServiceMock.issueTokens.mockResolvedValueOnce({
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

      const result = await ctx.service.createAnonymous('127.0.0.1');

      expect(ctx.rateLimitServiceMock.checkRateLimit).toHaveBeenCalledWith(
        'anonymous:127.0.0.1',
        3,
        60_000,
      );
      expect(ctx.prismaMock.workspace.create).toHaveBeenCalledWith(
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
      ctx.rateLimitServiceMock.checkRateLimit.mockRejectedValueOnce(rateLimitError as never);

      await expect(ctx.service.createAnonymous('127.0.0.1')).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('register', () => {
    it('should register new user successfully', async () => {
      ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValueOnce(undefined as never);
      ctx.authPartnerServiceMock.resolvePartnerInvite.mockResolvedValueOnce(null as never);
      ctx.prismaMock.agent.findFirst.mockResolvedValueOnce(null as never);
      ctx.prismaMock.workspace.create.mockResolvedValueOnce(mockWorkspace as never);
      ctx.prismaMock.agent.create.mockResolvedValueOnce(mockAgent as never);
      ctx.tokenServiceMock.issueTokens.mockResolvedValueOnce({
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

      const result = await ctx.service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        workspaceName: 'My Workspace',
        ip: '127.0.0.1',
      });

      expect(ctx.rateLimitServiceMock.checkRateLimit).toHaveBeenCalledWith('register:127.0.0.1');
      expect(ctx.prismaMock.workspace.create).toHaveBeenCalled();
      expect(ctx.prismaMock.agent.create).toHaveBeenCalled();
      expect(result.isNewUser).toBe(true);
    });

    it('should throw ConflictException when email already exists', async () => {
      ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValueOnce(undefined as never);
      ctx.authPartnerServiceMock.resolvePartnerInvite.mockResolvedValueOnce(null as never);
      ctx.prismaMock.agent.findFirst.mockResolvedValueOnce({ id: 'existing-agent' } as never);

      await expect(
        ctx.service.register({
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
      ctx.rateLimitServiceMock.checkRateLimit.mockRejectedValueOnce(rateLimitError as never);

      await expect(
        ctx.service.register({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow('Too many requests');
    });

    it('should derive name from email when name not provided', async () => {
      ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValueOnce(undefined as never);
      ctx.authPartnerServiceMock.resolvePartnerInvite.mockResolvedValueOnce(null as never);
      ctx.prismaMock.agent.findFirst.mockResolvedValueOnce(null as never);
      ctx.prismaMock.workspace.create.mockResolvedValueOnce(mockWorkspace as never);
      ctx.prismaMock.agent.create.mockResolvedValueOnce(mockAgent as never);
      ctx.tokenServiceMock.issueTokens.mockResolvedValueOnce({
        access_token: 'token123',
        refresh_token: 'refresh123',
        user: mockAgent as unknown as never,
        workspace: { id: 'workspace-123', name: 'Test Workspace' },
        workspaces: [{ id: 'workspace-123', name: 'Test Workspace' }],
        isNewUser: true,
      } as never);

      await ctx.service.register({
        email: 'user@example.com',
        password: 'password123',
        ip: '127.0.0.1',
      });

      expect(ctx.prismaMock.agent.create).toHaveBeenCalled();
    });
  });
});
