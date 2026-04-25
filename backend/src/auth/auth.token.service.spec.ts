import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Agent } from '@prisma/client';
import { AuthTokenService } from './auth.token.service';
import { PrismaService } from '../prisma/prisma.service';

interface PrismaMock {
  agent: { findUnique: jest.Mock };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  workspace: { findUnique: jest.Mock };
}
interface JwtMock {
  signAsync: jest.Mock;
}

function buildPrismaMock(): PrismaMock {
  return {
    agent: { findUnique: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    workspace: { findUnique: jest.fn() },
  };
}

function buildJwtMock(): JwtMock {
  return { signAsync: jest.fn() };
}

jest.mock('./db-init-error.service', () => ({
  DbInitErrorService: {
    throwFriendlyDbInitError: jest.fn((error) => {
      throw error;
    }),
  },
}));

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let prismaMock: PrismaMock;
  let jwtMock: JwtMock;

  const mockAgent = {
    id: 'agent-123',
    email: 'test@example.com',
    workspaceId: 'workspace-123',
    name: 'Test User',
    role: 'ADMIN',
    disabledAt: null,
    deletedAt: null,
  } as never as Agent;

  const mockWorkspace = {
    id: 'workspace-123',
    name: 'Test Workspace',
  };

  const mockRefreshToken = {
    id: 'token-id-123',
    token: 'rt-stub-1',
    agentId: 'agent-123',
    revoked: false,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prismaMock = buildPrismaMock();
    jwtMock = buildJwtMock();
    service = new AuthTokenService(
      prismaMock as never as PrismaService,
      jwtMock as never as JwtService,
    );
  });

  describe('issueTokens', () => {
    it('should issue access and refresh tokens for valid agent', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      } as never);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken as never);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123' as never);

      const result = await service.issueTokens(mockAgent);

      expect(result.access_token).toBe('access-token-123');
      expect(result.refresh_token).toBeTruthy();
      expect(result.user.id).toBe('agent-123');
      expect(result.user.email).toBe('test@example.com');
      expect(result.workspace?.id).toBe('workspace-123');
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalled();
      expect(prismaMock.refreshToken.create).toHaveBeenCalled();
    });

    it('should mark token as new user when extra.isNewUser is true', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      } as never);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken as never);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123' as never);

      const result = await service.issueTokens(mockAgent, {
        isNewUser: true,
      });

      expect(result.isNewUser).toBe(true);
    });

    it('should throw when workspace is not found', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(null as never);

      await expect(service.issueTokens(mockAgent)).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw when workspaceId is missing', async () => {
      const agentWithoutWorkspace = {
        ...mockAgent,
        workspaceId: null,
      };

      await expect(service.issueTokens(agentWithoutWorkspace as never as Agent)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw when agent is deleted', async () => {
      const deletedAgent = {
        ...mockAgent,
        deletedAt: new Date(),
      };

      await expect(service.issueTokens(deletedAgent as never as Agent)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when agent is disabled', async () => {
      const disabledAgent = {
        ...mockAgent,
        disabledAt: new Date(),
      };

      await expect(service.issueTokens(disabledAgent as never as Agent)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should rotate refresh tokens correctly', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 1,
      } as never);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken as never);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123' as never);

      await service.issueTokens(mockAgent);

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-123', revoked: false },
        data: { revoked: true },
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentId: 'agent-123',
          token: expect.anything(),
          expiresAt: expect.anything(),
        }),
      });
      const createCall = prismaMock.refreshToken.create.mock.calls[0][0];
      expect(typeof createCall.data.token).toBe('string');
      expect(createCall.data.expiresAt).toBeInstanceOf(Date);
    });

    it('should include user info in response', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      } as never);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken as never);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123' as never);

      const result = await service.issueTokens(mockAgent);

      expect(result.user).toEqual({
        id: 'agent-123',
        name: 'Test User',
        email: 'test@example.com',
        workspaceId: 'workspace-123',
        role: 'ADMIN',
      });
    });
  });

  describe('issueTokensForAgentId', () => {
    it('should issue tokens when agent exists', async () => {
      prismaMock.agent.findUnique.mockResolvedValueOnce(mockAgent as never);
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      } as never);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken as never);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123' as never);

      const result = await service.issueTokensForAgentId('agent-123');

      expect(result.access_token).toBe('access-token-123');
      expect(prismaMock.agent.findUnique).toHaveBeenCalledWith({
        where: { id: 'agent-123' },
        select: {
          id: true,
          email: true,
          workspaceId: true,
          name: true,
          role: true,
          disabledAt: true,
          deletedAt: true,
        },
      });
    });

    it('should throw when agent does not exist', async () => {
      prismaMock.agent.findUnique.mockResolvedValueOnce(null as never);

      await expect(service.issueTokensForAgentId('nonexistent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('should issue new tokens with valid refresh token', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored as never);
      prismaMock.refreshToken.update.mockResolvedValueOnce({} as never);
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      } as never);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken as never);
      jwtMock.signAsync.mockResolvedValueOnce('new-access-token' as never);

      const result = await service.refresh('rt-stub-1');

      expect(result.access_token).toBe('new-access-token');
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-id-123' },
        data: { revoked: true },
      });
    });

    it('should throw when refresh token not found', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null as never);

      await expect(service.refresh('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when refresh token is revoked', async () => {
      const revokedToken = {
        ...mockRefreshToken,
        revoked: true,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(revokedToken as never);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 1,
      } as never);

      await expect(service.refresh('revoked-token')).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-123', revoked: false },
        data: { revoked: true },
      });
    });

    it('should throw when refresh token is expired', async () => {
      const expiredToken = {
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(expiredToken as never);

      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should detect and revoke replayed refresh tokens', async () => {
      const revokedToken = {
        ...mockRefreshToken,
        revoked: true,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(revokedToken as never);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 2,
      } as never);

      await expect(service.refresh('replayed-token')).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-123', revoked: false },
        data: { revoked: true },
      });
    });

    it('should throw when agent is deleted', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: { ...mockAgent, deletedAt: new Date() },
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored as never);

      await expect(service.refresh('token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when agent is disabled', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: { ...mockAgent, disabledAt: new Date() },
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored as never);

      await expect(service.refresh('token')).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke old token before issuing new pair', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored as never);
      prismaMock.refreshToken.update.mockResolvedValueOnce({} as never);
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace as never);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      } as never);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken as never);
      jwtMock.signAsync.mockResolvedValueOnce('new-token' as never);

      await service.refresh('rt-stub-1');

      const updateCallOrder = prismaMock.refreshToken.update.mock.invocationCallOrder[0];
      const createCallOrder = prismaMock.refreshToken.create.mock.invocationCallOrder[0];

      expect(updateCallOrder).toBeLessThan(createCallOrder);
    });
  });
});
