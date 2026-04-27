import { UnauthorizedException } from '@nestjs/common';
import {
  type AuthPasswordSpecContext,
  bcryptMock,
  createAuthPasswordServiceContext,
  mockAgent,
} from './auth.password.service.spec.helpers';

jest.mock('bcrypt');
jest.mock('./db-init-error.service', () => ({
  DbInitErrorService: {
    throwFriendlyDbInitError: jest.fn((error) => {
      throw error;
    }),
  },
}));

describe('AuthPasswordService — login', () => {
  let ctx: AuthPasswordSpecContext;

  beforeEach(() => {
    ctx = createAuthPasswordServiceContext();
  });

  it('should login user with valid credentials', async () => {
    ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
    ctx.prismaMock.agent.findFirst.mockResolvedValueOnce({
      ...mockAgent,
      password: 'hashedPassword123',
    } as never);
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
      isNewUser: false,
    } as never);

    bcryptMock.compare = jest.fn().mockResolvedValue(true);

    const result = await ctx.service.login({
      email: 'test@example.com',
      password: 'password123',
      ip: '127.0.0.1',
    });

    expect(result.access_token).toBe('token123');
    expect(bcryptMock.compare).toHaveBeenCalledWith('password123', 'hashedPassword123');
  });

  it('should throw when user not found', async () => {
    ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
    ctx.prismaMock.agent.findFirst.mockResolvedValueOnce(null as never);

    await expect(
      ctx.service.login({
        email: 'nonexistent@example.com',
        password: 'password123',
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when password is invalid', async () => {
    ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
    ctx.prismaMock.agent.findFirst.mockResolvedValueOnce({
      ...mockAgent,
      password: 'hashedPassword123',
    } as never);

    bcryptMock.compare = jest.fn().mockResolvedValue(false);

    const loginPromise = ctx.service.login({
      email: 'test@example.com',
      password: 'wrongpassword',
      ip: '127.0.0.1',
    });

    await expect(loginPromise).rejects.toThrow(UnauthorizedException);
    await expect(loginPromise).rejects.toThrow('Credenciais inválidas');
  });

  it('should throw when account is deleted', async () => {
    ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
    ctx.prismaMock.agent.findFirst.mockResolvedValueOnce({
      ...mockAgent,
      deletedAt: new Date(),
    } as never);

    await expect(
      ctx.service.login({
        email: 'test@example.com',
        password: 'password123',
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when account is disabled', async () => {
    ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
    ctx.prismaMock.agent.findFirst.mockResolvedValueOnce({
      ...mockAgent,
      disabledAt: new Date(),
    } as never);

    await expect(
      ctx.service.login({
        email: 'test@example.com',
        password: 'password123',
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when account uses OAuth only', async () => {
    ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);
    ctx.prismaMock.agent.findFirst.mockResolvedValueOnce({
      ...mockAgent,
      provider: 'google',
      password: null,
    } as never);

    await expect(
      ctx.service.login({
        email: 'test@example.com',
        password: 'password123',
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Esta conta usa Google. Entre com o Google.');
  });

  it('should apply rate limiting by IP and email', async () => {
    ctx.rateLimitServiceMock.checkRateLimit.mockResolvedValue(undefined as never);

    ctx.prismaMock.agent.findFirst.mockResolvedValueOnce({
      ...mockAgent,
      password: 'hashedPassword123',
    } as never);
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
      isNewUser: false,
    } as never);

    bcryptMock.compare = jest.fn().mockResolvedValue(true);

    await ctx.service.login({
      email: 'test@example.com',
      password: 'password123',
      ip: '192.168.1.1',
    });

    expect(ctx.rateLimitServiceMock.checkRateLimit).toHaveBeenCalledWith('login:192.168.1.1');
    expect(ctx.rateLimitServiceMock.checkRateLimit).toHaveBeenCalledWith(
      'login:192.168.1.1:test@example.com',
    );
  });
});
