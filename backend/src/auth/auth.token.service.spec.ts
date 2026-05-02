import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Agent } from '@prisma/client';
import { AuthTokenService } from './auth.token.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildJwtMock,
  buildPrismaMock,
  type JwtMock,
  type PrismaMock,
  mockAgent,
  mockRefreshToken,
  mockWorkspace,
} from './auth.token.service.spec.helpers';

jest.mock('./db-init-error.service', () => ({
  DbInitErrorService: {
    throwFriendlyDbInitError: jest.fn((error) => {
      throw error;
    }),
  },
}));

// PULSE_OK: assertions exist below
describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let prismaMock: PrismaMock;
  let jwtMock: JwtMock;

  beforeEach(async () => {
    prismaMock = buildPrismaMock();
    jwtMock = buildJwtMock();
    service = new AuthTokenService(
      prismaMock as never as PrismaService,
      jwtMock as never as JwtService,
      undefined,
    );
  });

  describe('issueTokens', () => {
    it('should issue access and refresh tokens for valid agent', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

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
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

      const result = await service.issueTokens(mockAgent, {
        isNewUser: true,
      });

      expect(result.isNewUser).toBe(true);
    });

    it('should throw when workspace is not found', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(null);

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
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

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
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

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
      prismaMock.agent.findUnique.mockResolvedValueOnce(mockAgent);
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

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
      prismaMock.agent.findUnique.mockResolvedValueOnce(null);

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
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);
      // 1st updateMany: atomic claim of the inbound token
      // 2nd updateMany: rotateRefreshToken revoke-siblings step
      prismaMock.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('new-access-token');

      const result = await service.refresh('rt-stub-1');

      expect(result.access_token).toBe('new-access-token');
      // Atomic claim: updateMany with id + revoked: false guard.
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'token-id-123', revoked: false },
        data: { revoked: true },
      });
    });

    it('should throw when refresh token not found', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);

      await expect(service.refresh('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when refresh token is revoked', async () => {
      const revokedToken = {
        ...mockRefreshToken,
        revoked: true,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(revokedToken);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 1,
      });

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
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(expiredToken);

      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should detect and revoke replayed refresh tokens', async () => {
      const revokedToken = {
        ...mockRefreshToken,
        revoked: true,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(revokedToken);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 2,
      });

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
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);

      await expect(service.refresh('token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when agent is disabled', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: { ...mockAgent, disabledAt: new Date() },
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);

      await expect(service.refresh('token')).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke old token before issuing new pair', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);
      prismaMock.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 1 }) // atomic claim
        .mockResolvedValueOnce({ count: 0 }); // rotation revoke-siblings
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('new-token');

      await service.refresh('rt-stub-1');

      const claimOrder = prismaMock.refreshToken.updateMany.mock.invocationCallOrder[0];
      const createOrder = prismaMock.refreshToken.create.mock.invocationCallOrder[0];
      // Atomic claim of inbound token must precede the new-token insert.
      expect(claimOrder).toBeLessThan(createOrder);
    });

    it('should reject concurrent refresh of the same token (race winner only)', async () => {
      // Simulate two concurrent refresh() calls competing for one active
      // token. Only ONE atomic claim should win (count=1); the loser sees
      // count=0 and is rejected with UnauthorizedException.
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      // Both calls observe the same active token via findUnique.
      prismaMock.refreshToken.findUnique
        .mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(stored);
      // First updateMany wins the claim (count=1, then rotation siblings),
      // second updateMany loses (count=0).
      prismaMock.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      prismaMock.workspace.findUnique.mockResolvedValue(mockWorkspace);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValue('access-token');

      const [winner, loser] = await Promise.allSettled([
        service.refresh('rt-stub-1'),
        service.refresh('rt-stub-1'),
      ]);

      const fulfilled = [winner, loser].filter((r) => r.status === 'fulfilled');
      const rejected = [winner, loser].filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      const rejection = rejected[0];
      expect(rejection.reason).toBeInstanceOf(UnauthorizedException);
    });
  });
});
